//! Official Atlas channel: a `broadcast` chat every account is in, authored
//! by a seeded verified user. Top-level posts are official-only; members
//! may reply. The control panel posts via `/api/admin/broadcast`.

use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::HeaderMap;
use axum::Json;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::auth::hash_password;
use crate::error::{ApiResult, AppError};
use crate::models::AttachmentDto;
use crate::routes::attachments::MAX_ATTACHMENT_BYTES;
use crate::routes::messages::{persist_and_fanout, NewMessage};
use crate::state::AppState;

pub const HANDLE: &str = "atlasnews";
pub const DISPLAY_NAME: &str = "Atlas";

#[derive(Debug, Clone, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BroadcastButton {
    pub label: String,
    #[serde(default)]
    pub url: String,
    /// Bot callback: tapping sends this text as a DM (Telegram-style).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub data: String,
    /// Emoji shown on the button.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub icon: String,
    /// Grid row (0-based). Buttons with the same row sit side by side.
    #[serde(default)]
    pub row: u8,
    /// Mini-app URL opened in an in-chat webview (Telegram WebApp-style).
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub app: String,
    /// Server GETs this https URL and uses the body as the (edited) reply.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub fetch: String,
    /// If true, tapping `data` edits this message instead of sending a new one.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub edit: bool,
}

pub struct Official {
    pub user_id: Uuid,
    pub chat_id: Uuid,
}

const LOGO_PNG: &[u8] = include_bytes!("../../src-tauri/icons/ios/AppIcon-512@2x.png");

pub async fn ensure(db: &sqlx::PgPool, attachments_dir: &str) -> Result<Official, AppError> {
    let user_id = ensure_user(db).await?;
    ensure_logo(db, user_id, attachments_dir).await?;
    let chat_id = ensure_chat(db, user_id).await?;
    Ok(Official { user_id, chat_id })
}

async fn ensure_logo(db: &sqlx::PgPool, user_id: Uuid, attachments_dir: &str) -> Result<(), AppError> {
    let has: bool = sqlx::query_scalar(
        "SELECT avatar_attachment_id IS NOT NULL FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    if has {
        return Ok(());
    }
    let id = Uuid::new_v4();
    tokio::fs::create_dir_all(attachments_dir)
        .await
        .map_err(|e| AppError::Internal(format!("attachments dir: {e}")))?;
    let path = std::path::Path::new(attachments_dir).join(id.to_string());
    tokio::fs::write(&path, LOGO_PNG)
        .await
        .map_err(|e| AppError::Internal(format!("logo write: {e}")))?;
    sqlx::query(
        "INSERT INTO attachments (id, owner_id, kind, mime, size_bytes, filename, width, height)
         VALUES ($1, $2, 'image', 'image/png', $3, 'atlas-logo.png', 1024, 1024)",
    )
    .bind(id)
    .bind(user_id)
    .bind(LOGO_PNG.len() as i64)
    .execute(db)
    .await?;
    sqlx::query("UPDATE users SET avatar_attachment_id = $2 WHERE id = $1")
        .bind(user_id)
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

async fn ensure_user(db: &sqlx::PgPool) -> Result<Uuid, AppError> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE handle = $1")
        .bind(HANDLE)
        .fetch_optional(db)
        .await?
    {
        let _ = sqlx::query("UPDATE users SET verified = true, name = $2 WHERE id = $1")
            .bind(id)
            .bind(DISPLAY_NAME)
            .execute(db)
            .await;
        return Ok(id);
    }

    use base64::Engine;
    use rand::RngCore;
    let mut random = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let throwaway = base64::engine::general_purpose::STANDARD.encode(random);
    let password_hash = hash_password(throwaway).await?;
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, handle, name, bio, avatar_color, avatar_initial, password_hash, verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (handle) DO NOTHING",
    )
    .bind(id)
    .bind(HANDLE)
    .bind(DISPLAY_NAME)
    .bind("Official Atlas announcements. You can’t reply.")
    .bind("#66A1FF")
    .bind("A")
    .bind(&password_hash)
    .execute(db)
    .await?;

    sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE handle = $1")
        .bind(HANDLE)
        .fetch_one(db)
        .await
        .map_err(Into::into)
}

async fn ensure_chat(db: &sqlx::PgPool, official_id: Uuid) -> Result<Uuid, AppError> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>("SELECT id FROM chats WHERE kind = 'broadcast' LIMIT 1")
        .fetch_optional(db)
        .await?
    {
        add_everyone(db, id).await?;
        return Ok(id);
    }

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO chats (id, kind, name, avatar_color, created_by)
         VALUES ($1, 'broadcast', $2, '#66A1FF', $3)",
    )
    .bind(id)
    .bind(DISPLAY_NAME)
    .bind(official_id)
    .execute(db)
    .await?;
    add_everyone(db, id).await?;
    Ok(id)
}

async fn add_everyone(db: &sqlx::PgPool, chat_id: Uuid) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO chat_members (chat_id, user_id)
         SELECT $1, u.id FROM users u
         WHERE u.handle <> $2
           AND NOT EXISTS (
             SELECT 1 FROM chat_members m WHERE m.chat_id = $1 AND m.user_id = u.id
           )",
    )
    .bind(chat_id)
    .bind(HANDLE)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn add_member(state: &AppState, user_id: Uuid) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING",
    )
    .bind(state.broadcast_chat_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;
    Ok(())
}

fn check_admin(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    let expected = state
        .cfg
        .broadcast_admin_token
        .as_deref()
        .or(state.cfg.waitlist_admin_token.as_deref())
        .ok_or(AppError::NotFound)?;
    let bearer = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    let header = headers.get("x-admin-token").and_then(|v| v.to_str().ok());
    let got = bearer.or(header).unwrap_or_default();
    if got != expected {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    pub attachment_id: Uuid,
    #[serde(default)]
    pub title: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastPayload {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub buttons: Vec<BroadcastButton>,
    #[serde(default)]
    pub images: Vec<ImageMeta>,
}

fn sanitize_url(url: &str) -> Result<String, AppError> {
    let u = url.trim();
    if u.is_empty() {
        return Ok(String::new());
    }
    if u.len() > 2048 {
        return Err(AppError::BadRequest("button url too long".into()));
    }
    if !(u.starts_with("https://") || u.starts_with("http://") || u.starts_with("/")) {
        return Err(AppError::BadRequest("button url must be http(s) or a site path".into()));
    }
    Ok(u.to_string())
}

pub fn sanitize_buttons(buttons: Vec<BroadcastButton>) -> Result<Vec<BroadcastButton>, AppError> {
    sanitize_buttons_n(buttons, 24)
}

fn sanitize_buttons_n(buttons: Vec<BroadcastButton>, max: usize) -> Result<Vec<BroadcastButton>, AppError> {
    if buttons.len() > max {
        return Err(AppError::BadRequest(format!("at most {max} buttons")));
    }
    let mut out = Vec::new();
    for b in buttons {
        let label = b.label.trim();
        if label.is_empty() || label.len() > 48 {
            return Err(AppError::BadRequest("button label must be 1-48 characters".into()));
        }
        let url = sanitize_url(&b.url)?;
        let app = sanitize_url(&b.app)?;
        let fetch = sanitize_url(&b.fetch)?;
        if !fetch.is_empty() && !fetch.starts_with("https://") {
            return Err(AppError::BadRequest("button fetch must be https".into()));
        }
        let data = b.data.trim().chars().take(200).collect::<String>();
        let icon = b.icon.chars().take(8).collect::<String>();
        if url.is_empty() && data.is_empty() && app.is_empty() && fetch.is_empty() {
            return Err(AppError::BadRequest("button needs a url, data, app or fetch".into()));
        }
        out.push(BroadcastButton {
            label: label.to_string(),
            url,
            data,
            icon,
            row: b.row,
            app,
            fetch,
            edit: b.edit,
        });
    }
    Ok(out)
}

pub async fn post_broadcast(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<BroadcastPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    check_admin(&state, &headers)?;
    let text = payload.text.trim();
    let buttons = sanitize_buttons(payload.buttons)?;
    if text.is_empty() && payload.images.is_empty() {
        return Err(AppError::BadRequest("text or at least one image is required".into()));
    }

    let mut ids = Vec::new();
    let mut first = true;
    if !text.is_empty() || payload.images.is_empty() {
        let first_image = payload.images.first();
        if let Some(img) = first_image {
            set_title(&state, img.attachment_id, &img.title).await?;
        }
        let dto = persist_and_fanout(
            &state,
            state.official_user_id,
            state.broadcast_chat_id,
            NewMessage {
                scheme: "plain",
                body: if text.is_empty() { " " } else { text },
                client_tag: None,
                reply_to_id: None,
                attachment_id: first_image.map(|i| i.attachment_id),
                unlock_at: None,
                mentions_compass: false,
                buttons: if buttons.is_empty() { None } else { Some(buttons.clone()) },
            },
        )
        .await?;
        ids.push(dto.id);
        first = false;
    }

    let skip = if first { 0 } else { 1 };
    for img in payload.images.into_iter().skip(skip) {
        set_title(&state, img.attachment_id, &img.title).await?;
        let dto = persist_and_fanout(
            &state,
            state.official_user_id,
            state.broadcast_chat_id,
            NewMessage {
                scheme: "plain",
                body: " ",
                client_tag: None,
                reply_to_id: None,
                attachment_id: Some(img.attachment_id),
                unlock_at: None,
                mentions_compass: false,
                buttons: None,
            },
        )
        .await?;
        ids.push(dto.id);
    }

    Ok(Json(serde_json::json!({ "ok": true, "messageIds": ids })))
}

async fn set_title(state: &AppState, id: Uuid, title: &str) -> Result<(), AppError> {
    let title: String = title.chars().take(120).collect();
    let n = sqlx::query(
        "UPDATE attachments SET title = $2 WHERE id = $1 AND owner_id = $3",
    )
    .bind(id)
    .bind(title.trim())
    .bind(state.official_user_id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::BadRequest("attachment not found".into()));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUploadQuery {
    filename: Option<String>,
    mime: Option<String>,
    width: Option<i32>,
    height: Option<i32>,
    #[serde(default)]
    title: String,
}

pub async fn upload_image(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AdminUploadQuery>,
    body: Bytes,
) -> ApiResult<Json<AttachmentDto>> {
    check_admin(&state, &headers)?;
    if body.is_empty() || body.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::BadRequest("image must be 1 byte to 25 MiB".into()));
    }
    let mime = query.mime.unwrap_or_else(|| "image/jpeg".into());
    if !mime.starts_with("image/") {
        return Err(AppError::BadRequest("only images are allowed".into()));
    }
    let filename = query
        .filename
        .unwrap_or_else(|| "photo.jpg".into())
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | '\0'))
        .take(120)
        .collect::<String>();
    let title: String = query.title.chars().take(120).collect();
    let id = Uuid::new_v4();
    let dir = &state.cfg.attachments_dir;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| AppError::Internal(format!("attachments dir: {e}")))?;
    let path = std::path::Path::new(dir).join(id.to_string());
    tokio::fs::write(&path, &body)
        .await
        .map_err(|e| AppError::Internal(format!("attachment write: {e}")))?;

    let row = sqlx::query_as::<_, crate::models::AttachmentRow>(
        "INSERT INTO attachments (id, owner_id, kind, mime, size_bytes, filename, width, height, title)
         VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8)
         RETURNING id, kind, mime, size_bytes, filename, duration_ms, width, height, title",
    )
    .bind(id)
    .bind(state.official_user_id)
    .bind(&mime)
    .bind(body.len() as i64)
    .bind(&filename)
    .bind(query.width)
    .bind(query.height)
    .bind(title.trim())
    .fetch_one(&state.db)
    .await;
    match row {
        Ok(row) => Ok(Json(row.into())),
        Err(e) => {
            let _ = tokio::fs::remove_file(&path).await;
            Err(e.into())
        }
    }
}
