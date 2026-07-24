use axum::extract::{Path, Query, State};
use axum::response::Response;
use axum::Json;
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{AuthUser, USER_COLUMNS};
use crate::error::{ApiResult, AppError};
use crate::models::{UpdateMePayload, UserDto, UserRow};
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
            avatar_initial = COALESCE($6, avatar_initial)
         WHERE id = $1
         RETURNING {USER_COLUMNS}"
    ))
    .bind(auth.user_id)
    .bind(patch.name.map(|n| n.trim().to_string()))
    .bind(patch.bio)
    .bind(patch.status)
    .bind(patch.avatar_color)
    .bind(patch.avatar_initial)
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
