use axum::extract::{Path, Query, State};
use axum::response::Response;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{AuthUser, USER_COLUMNS};
use crate::error::{ApiResult, AppError};
use crate::models::{BlockDto, UpdateMePayload, UserDto, UserRow};
use crate::routes::attachments::stream_attachment;
use crate::state::AppState;

pub async fn get_me(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<UserDto>> {
    let user: UserRow =
        sqlx::query_as(&format!("SELECT {USER_COLUMNS} FROM users WHERE id = $1"))
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;
    Ok(Json(user.into()))
}

pub async fn update_me(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(patch): Json<UpdateMePayload>,
) -> ApiResult<Json<UserDto>> {
    let too_long = |s: &Option<String>, max: usize| s.as_ref().is_some_and(|v| v.len() > max);
    if too_long(&patch.name, 80)
        || too_long(&patch.bio, 500)
        || too_long(&patch.status, 120)
        || too_long(&patch.avatar_color, 32)
        || too_long(&patch.avatar_initial, 8)
    {
        return Err(AppError::BadRequest("field too long".into()));
    }
    if patch.name.as_deref().is_some_and(|n| n.trim().is_empty()) {
        return Err(AppError::BadRequest("name cannot be empty".into()));
    }

    let user: UserRow = sqlx::query_as(&format!(
        "UPDATE users SET
            name = COALESCE($2, name),
            bio = COALESCE($3, bio),
            status = COALESCE($4, status),
            avatar_color = COALESCE($5, avatar_color),
            avatar_initial = COALESCE($6, avatar_initial),
            read_receipts = COALESCE($7, read_receipts),
            last_seen_visible = COALESCE($8, last_seen_visible)
         WHERE id = $1
         RETURNING {USER_COLUMNS}"
    ))
    .bind(auth.user_id)
    .bind(patch.name.map(|n| n.trim().to_string()))
    .bind(patch.bio)
    .bind(patch.status)
    .bind(patch.avatar_color)
    .bind(patch.avatar_initial)
    .bind(patch.read_receipts)
    .bind(patch.last_seen_visible)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(user.into()))
}

pub async fn get_user(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Json<UserDto>> {
    let user: Option<UserRow> =
        sqlx::query_as(&format!("SELECT {USER_COLUMNS} FROM users WHERE id = $1"))
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    user.map(|u| Json(u.into())).ok_or(AppError::NotFound)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAvatarPayload {
    attachment_id: Uuid,
}

/// Point my profile photo at one of my own image attachments. The previous
/// attachment (if any) is left as an ordinary orphaned row — no cleanup needed,
/// same tradeoff the rest of the attachment system already makes.
pub async fn set_avatar(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<SetAvatarPayload>,
) -> ApiResult<Json<UserDto>> {
    let owned_image: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM attachments WHERE id = $1 AND owner_id = $2 AND kind = 'image')",
    )
    .bind(payload.attachment_id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;
    if !owned_image {
        return Err(AppError::BadRequest(
            "attachment must be an image you uploaded".into(),
        ));
    }

    let user: UserRow = sqlx::query_as(&format!(
        "UPDATE users SET avatar_attachment_id = $2 WHERE id = $1 RETURNING {USER_COLUMNS}"
    ))
    .bind(auth.user_id)
    .bind(payload.attachment_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(user.into()))
}

pub async fn remove_avatar(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<UserDto>> {
    let user: UserRow = sqlx::query_as(&format!(
        "UPDATE users SET avatar_attachment_id = NULL WHERE id = $1 RETURNING {USER_COLUMNS}"
    ))
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(user.into()))
}

/// Anyone authenticated may view anyone's profile photo — same visibility as
/// the rest of a user's public profile fields (name, handle, status all
/// already come back from search/get_user with no relationship required).
pub async fn get_avatar(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Response> {
    let row: Option<(Uuid, String, String)> = sqlx::query_as(
        "SELECT a.id, a.mime, a.filename FROM users u
         JOIN attachments a ON a.id = u.avatar_attachment_id
         WHERE u.id = $1",
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    let (attachment_id, mime, filename) = row.ok_or(AppError::NotFound)?;
    stream_attachment(&state, attachment_id, &mime, &filename).await
}

#[derive(Deserialize)]
pub struct SearchQuery {
    q: String,
}

/// Search users by handle or display name (for starting new chats).
pub async fn search_users(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<Vec<UserDto>>> {
    let q = query.q.trim();
    if q.len() < 2 {
        return Ok(Json(vec![]));
    }
    let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));
    let rows: Vec<UserRow> = sqlx::query_as(&format!(
        "SELECT {USER_COLUMNS} FROM users
         WHERE (handle ILIKE $1 OR name ILIKE $1) AND id <> $2
         ORDER BY handle LIMIT 20"
    ))
    .bind(&pattern)
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockPayload {
    user_id: Uuid,
}

/// Block a user: no new DM can be opened with them and neither side can send
/// into an existing one (enforced in chats::create_dm / messages::persist_and_fanout).
/// Existing chat history is left untouched — blocking never deletes anything.
pub async fn block_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<BlockPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    if payload.user_id == auth.user_id {
        return Err(AppError::BadRequest("cannot block yourself".into()));
    }
    let target_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
            .bind(payload.user_id)
            .fetch_one(&state.db)
            .await?;
    if !target_exists {
        return Err(AppError::NotFound);
    }
    sqlx::query(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING",
    )
    .bind(auth.user_id)
    .bind(payload.user_id)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn unblock_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(user_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2")
        .bind(auth.user_id)
        .bind(user_id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(sqlx::FromRow)]
struct BlockRow {
    created_at: DateTime<Utc>,
    #[sqlx(flatten)]
    user: UserRow,
}

pub async fn list_blocks(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<BlockDto>>> {
    let rows: Vec<BlockRow> = sqlx::query_as(&format!(
        "SELECT b.created_at, {cols} FROM blocks b
         JOIN users u ON u.id = b.blocked_id
         WHERE b.blocker_id = $1
         ORDER BY b.created_at DESC",
        cols = USER_COLUMNS
            .split(", ")
            .map(|c| format!("u.{c}"))
            .collect::<Vec<_>>()
            .join(", ")
    ))
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        rows.into_iter()
            .map(|r| BlockDto { user: r.user.into(), created_at: r.created_at })
            .collect(),
    ))
}

/// Granting/revoking the verified badge is restricted to the "atlas"
/// account — there's no separate roles/admin system, so this is checked
/// directly against the well-known handle rather than a permissions table.
async fn require_atlas(state: &AppState, user_id: Uuid) -> Result<(), AppError> {
    let is_atlas: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND handle = 'atlas')")
            .bind(user_id)
            .fetch_one(&state.db)
            .await?;
    if is_atlas {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetVerifiedPayload {
    verified: bool,
}

pub async fn set_verified(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(user_id): Path<Uuid>,
    Json(payload): Json<SetVerifiedPayload>,
) -> ApiResult<Json<UserDto>> {
    require_atlas(&state, auth.user_id).await?;
    let user: Option<UserRow> = sqlx::query_as(&format!(
        "UPDATE users SET verified = $2 WHERE id = $1 RETURNING {USER_COLUMNS}"
    ))
    .bind(user_id)
    .bind(payload.verified)
    .fetch_optional(&state.db)
    .await?;
    user.map(|u| Json(u.into())).ok_or(AppError::NotFound)
}

/// Cap on the admin user list — the screen is for granting checkmarks, not
/// browsing the whole table, so beyond this the operator narrows with `q`.
const ADMIN_USER_LIMIT: i64 = 200;

#[derive(Deserialize)]
pub struct AdminUserQuery {
    /// Empty/absent lists everyone; otherwise filters by handle or name.
    #[serde(default)]
    q: String,
}

/// Every account, for the atlas-only verification screen. Distinct from
/// search_users: it needs no query, includes the caller (so atlas can verify
/// its own account), and sorts verified accounts first.
pub async fn list_all_users(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<AdminUserQuery>,
) -> ApiResult<Json<Vec<UserDto>>> {
    require_atlas(&state, auth.user_id).await?;
    let q = query.q.trim();
    let rows: Vec<UserRow> = if q.is_empty() {
        sqlx::query_as(&format!(
            "SELECT {USER_COLUMNS} FROM users
             ORDER BY verified DESC, handle LIMIT $1"
        ))
        .bind(ADMIN_USER_LIMIT)
        .fetch_all(&state.db)
        .await?
    } else {
        let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));
        sqlx::query_as(&format!(
            "SELECT {USER_COLUMNS} FROM users
             WHERE handle ILIKE $1 OR name ILIKE $1
             ORDER BY verified DESC, handle LIMIT $2"
        ))
        .bind(&pattern)
        .bind(ADMIN_USER_LIMIT)
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}
