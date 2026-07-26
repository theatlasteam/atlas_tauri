use std::collections::HashMap;

use axum::extract::{Path, State};
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::{ChatDto, MessageDto, MessageRow};
use crate::state::AppState;
use crate::ws::protocol::ServerEvent;

/// Row shape of the chat-list query below.
#[derive(sqlx::FromRow)]
struct ChatListRow {
    id: Uuid,
    kind: String,
    name: Option<String>,
    avatar_color: Option<String>,
    muted: bool,
    unread: i64,
    member_count: i64,
    peer_id: Option<Uuid>,
    peer_read_up_to: Option<Uuid>,
    peer_name: Option<String>,
    peer_avatar_color: Option<String>,
    peer_avatar_initial: Option<String>,
    peer_avatar_attachment_id: Option<Uuid>,
    /// NULL for groups (the peer LATERAL join doesn't fire).
    peer_verified: Option<bool>,
    peer_last_seen_at: Option<DateTime<Utc>>,
    peer_last_seen_visible: Option<bool>,
    blocked_by_me: bool,
    blocked_me: bool,
    lm_id: Option<Uuid>,
    lm_author: Option<Uuid>,
    lm_scheme: Option<String>,
    lm_body: Option<Vec<u8>>,
    lm_sent_at: Option<DateTime<Utc>>,
    lm_unlock_at: Option<DateTime<Utc>>,
}

/// One round-trip for the whole chat list: DM peer resolution and the latest
/// message come from LATERAL joins, unread counts from an index-only range
/// scan on (chat_id, id) — UUIDv7 ids make `id > last_read` a time comparison.
const CHAT_LIST_SQL: &str = "
    SELECT
        c.id, c.kind, c.name, c.avatar_color, cm.muted,
        p.user_id AS peer_id,
        p.last_read_message_id AS peer_read_up_to,
        pu.name AS peer_name,
        pu.avatar_color AS peer_avatar_color,
        pu.avatar_initial AS peer_avatar_initial,
        pu.avatar_attachment_id AS peer_avatar_attachment_id,
        pu.verified AS peer_verified,
        pu.last_seen_at AS peer_last_seen_at,
        pu.last_seen_visible AS peer_last_seen_visible,
        EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = cm.user_id AND b.blocked_id = p.user_id) AS blocked_by_me,
        EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = p.user_id AND b.blocked_id = cm.user_id) AS blocked_me,
        lm.id AS lm_id, lm.author_id AS lm_author, lm.scheme AS lm_scheme,
        lm.body AS lm_body, lm.sent_at AS lm_sent_at, lm.unlock_at AS lm_unlock_at,
        (SELECT count(*) FROM messages m
          WHERE m.chat_id = c.id
            AND m.author_id <> cm.user_id
            AND (cm.last_read_message_id IS NULL OR m.id > cm.last_read_message_id)
        ) AS unread,
        (SELECT count(*) FROM chat_members x WHERE x.chat_id = c.id) AS member_count
    FROM chat_members cm
    JOIN chats c ON c.id = cm.chat_id
    LEFT JOIN LATERAL (
        SELECT x.user_id, x.last_read_message_id FROM chat_members x
        WHERE x.chat_id = c.id AND x.user_id <> cm.user_id LIMIT 1
    ) p ON c.kind = 'dm'
    LEFT JOIN users pu ON pu.id = p.user_id
    LEFT JOIN LATERAL (
        SELECT m.id, m.author_id, m.scheme, m.body, m.sent_at, m.unlock_at FROM messages m
        WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1
    ) lm ON TRUE
    WHERE cm.user_id = $1
";

fn row_to_dto(row: ChatListRow, viewer_id: Uuid, folder_ids: Vec<Uuid>, online: bool) -> ChatDto {
    let last_message = match (row.lm_id, row.lm_author, row.lm_scheme, row.lm_body, row.lm_sent_at)
    {
        (Some(id), Some(author_id), Some(scheme), Some(body), Some(sent_at)) => {
            // The chat-list preview goes through the same seal as the thread:
            // a capsule must not leak its first line into the list.
            Some(
                MessageDto::from(MessageRow {
                    id,
                    chat_id: row.id,
                    author_id,
                    scheme,
                    body,
                    sent_at,
                    reply_to_id: None,   // previews don't render reply/attachment
                    attachment_id: None, // detail; hydrating here would be N chats
                    unlock_at: row.lm_unlock_at,
                })
                .seal_for(viewer_id, Utc::now()),
            )
        }
        _ => None,
    };
    let is_dm = row.kind == "dm";
    let name = if is_dm {
        row.peer_name.unwrap_or_else(|| "Deleted user".into())
    } else {
        row.name.unwrap_or_else(|| "Group".into())
    };
    let avatar_color = if is_dm { row.peer_avatar_color } else { row.avatar_color }
        .unwrap_or_else(|| "#94a3b8".into());
    let avatar_initial = if is_dm {
        row.peer_avatar_initial.unwrap_or_else(|| "?".into())
    } else {
        name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_else(|| "?".into())
    };
    ChatDto {
        id: row.id,
        kind: row.kind,
        name,
        avatar_color,
        avatar_initial,
        peer_user_id: row.peer_id,
        last_message,
        unread_count: row.unread,
        muted: row.muted,
        online,
        folder_ids,
        member_count: row.member_count,
        peer_read_up_to: row.peer_read_up_to,
        peer_has_avatar: is_dm && row.peer_avatar_attachment_id.is_some(),
        peer_verified: is_dm && row.peer_verified.unwrap_or(false),
        peer_last_seen_at: row
            .peer_last_seen_at
            .filter(|_| is_dm && row.peer_last_seen_visible.unwrap_or(false)),
        blocked_by_me: row.blocked_by_me,
        blocked_me: row.blocked_me,
    }
}

async fn folder_map(state: &AppState, user_id: Uuid) -> sqlx::Result<HashMap<Uuid, Vec<Uuid>>> {
    let rows: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT fc.chat_id, fc.folder_id FROM folder_chats fc
         JOIN folders f ON f.id = fc.folder_id WHERE f.user_id = $1",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;
    let mut map: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
    for (chat_id, folder_id) in rows {
        map.entry(chat_id).or_default().push(folder_id);
    }
    Ok(map)
}

pub async fn list_chats(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<ChatDto>>> {
    let rows: Vec<ChatListRow> = sqlx::query_as(CHAT_LIST_SQL)
        .bind(auth.user_id)
        .fetch_all(&state.db)
        .await?;
    let mut folders = folder_map(&state, auth.user_id).await?;

    let mut chats: Vec<ChatDto> = rows
        .into_iter()
        .map(|row| {
            let online = row.peer_id.map(|p| state.hub.is_online(p)).unwrap_or(false);
            let folder_ids = folders.remove(&row.id).unwrap_or_default();
            row_to_dto(row, auth.user_id, folder_ids, online)
        })
        .collect();
    chats.sort_by(|a, b| {
        let key = |c: &ChatDto| c.last_message.as_ref().map(|m| m.sent_at);
        key(b).cmp(&key(a))
    });
    Ok(Json(chats))
}

/// Build one user's view of a single chat (used for chat_created events and
/// the GET /api/chats/{id} endpoint).
pub async fn chat_dto_for(
    state: &AppState,
    user_id: Uuid,
    chat_id: Uuid,
) -> Result<ChatDto, AppError> {
    let row: Option<ChatListRow> =
        sqlx::query_as(&format!("{CHAT_LIST_SQL} AND c.id = $2"))
            .bind(user_id)
            .bind(chat_id)
            .fetch_optional(&state.db)
            .await?;
    let row = row.ok_or(AppError::NotFound)?;
    let folder_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT fc.folder_id FROM folder_chats fc
         JOIN folders f ON f.id = fc.folder_id
         WHERE f.user_id = $1 AND fc.chat_id = $2",
    )
    .bind(user_id)
    .bind(chat_id)
    .fetch_all(&state.db)
    .await?;
    let online = row.peer_id.map(|p| state.hub.is_online(p)).unwrap_or(false);
    Ok(row_to_dto(row, user_id, folder_ids, online))
}

pub async fn get_chat(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
) -> ApiResult<Json<ChatDto>> {
    Ok(Json(chat_dto_for(&state, auth.user_id, chat_id).await?))
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CreateChatPayload {
    #[serde(rename = "dm")]
    Dm { user_id: Uuid },
    #[serde(rename = "group")]
    Group { name: String, member_ids: Vec<Uuid> },
}

pub async fn create_chat(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<CreateChatPayload>,
) -> ApiResult<Json<ChatDto>> {
    let chat_id = match payload {
        CreateChatPayload::Dm { user_id: peer } => create_dm(&state, auth.user_id, peer).await?,
        CreateChatPayload::Group { name, member_ids } => {
            create_group(&state, auth.user_id, name, member_ids).await?
        }
    };

    // Push each member their own view of the new chat (names differ per
    // viewer for DMs).
    let members = crate::ws::chat_member_ids(&state, chat_id).await?;
    for member in &members {
        if let Ok(dto) = chat_dto_for(&state, *member, chat_id).await {
            state.hub.send_to_user(*member, &ServerEvent::ChatCreated { chat: dto });
        }
    }

    Ok(Json(chat_dto_for(&state, auth.user_id, chat_id).await?))
}

async fn create_dm(state: &AppState, me: Uuid, peer: Uuid) -> Result<Uuid, AppError> {
    if me == peer {
        return Err(AppError::BadRequest("cannot open a DM with yourself".into()));
    }
    let peer_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
            .bind(peer)
            .fetch_one(&state.db)
            .await?;
    if !peer_exists {
        return Err(AppError::NotFound);
    }
    // A fresh DM can't be opened while either side has blocked the other —
    // an existing DM (opened before the block) is left alone here; sending
    // into it is what actually gets rejected, in persist_and_fanout.
    let blocked: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM blocks
            WHERE (blocker_id = $1 AND blocked_id = $2)
               OR (blocker_id = $2 AND blocked_id = $1)
         )",
    )
    .bind(me)
    .bind(peer)
    .fetch_one(&state.db)
    .await?;
    if blocked {
        return Err(AppError::Forbidden);
    }

    // Canonical key makes DM creation race-free: two concurrent creates hit
    // the same unique dm_key and one wins; both return the same chat.
    let (a, b) = if me < peer { (me, peer) } else { (peer, me) };
    let dm_key = format!("{a}:{b}");

    let mut tx = state.db.begin().await?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO chats (id, kind, created_by, dm_key) VALUES ($1, 'dm', $2, $3)
         ON CONFLICT (dm_key) DO NOTHING RETURNING id",
    )
    .bind(Uuid::new_v4())
    .bind(me)
    .bind(&dm_key)
    .fetch_optional(&mut *tx)
    .await?;

    let chat_id = match inserted {
        Some(id) => {
            sqlx::query(
                "INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)",
            )
            .bind(id)
            .bind(a)
            .bind(b)
            .execute(&mut *tx)
            .await?;
            id
        }
        None => sqlx::query_scalar("SELECT id FROM chats WHERE dm_key = $1")
            .bind(&dm_key)
            .fetch_one(&mut *tx)
            .await?,
    };
    tx.commit().await?;
    Ok(chat_id)
}

async fn create_group(
    state: &AppState,
    me: Uuid,
    name: String,
    member_ids: Vec<Uuid>,
) -> Result<Uuid, AppError> {
    let name = name.trim().to_string();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest("group name must be 1-80 characters".into()));
    }
    if member_ids.len() > 256 {
        return Err(AppError::BadRequest("too many members".into()));
    }

    let mut members: Vec<Uuid> = member_ids;
    members.push(me);
    members.sort();
    members.dedup();

    let known: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE id = ANY($1)")
        .bind(&members)
        .fetch_one(&state.db)
        .await?;
    if known != members.len() as i64 {
        return Err(AppError::BadRequest("unknown member id".into()));
    }

    let chat_id = Uuid::new_v4();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO chats (id, kind, name, created_by) VALUES ($1, 'group', $2, $3)")
        .bind(chat_id)
        .bind(&name)
        .bind(me)
        .execute(&mut *tx)
        .await?;
    for member in &members {
        sqlx::query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)")
            .bind(chat_id)
            .bind(member)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(chat_id)
}

#[derive(Deserialize)]
pub struct MutePayload {
    muted: bool,
}

pub async fn set_muted(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<MutePayload>,
) -> ApiResult<Json<serde_json::Value>> {
    let res = sqlx::query("UPDATE chat_members SET muted = $3 WHERE chat_id = $1 AND user_id = $2")
        .bind(chat_id)
        .bind(auth.user_id)
        .bind(payload.muted)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "ok": true })))
}
