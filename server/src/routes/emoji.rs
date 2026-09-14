//! Custom emoji packs. Each user owns a pack of small images (max 1.5 MiB
//! each). Sending `{{ce:<id>}}` in a message lets anyone with the id fetch
//! the image; they can copy the whole pack onto their own account.

use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::Response;
use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;

pub const MAX_EMOJI_BYTES: usize = (15 * 1024 * 1024) / 10; // 1.5 MiB
const MAX_PER_USER: i64 = 64;

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiDto {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub mime: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiMetaDto {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub owner_name: String,
    pub owner_handle: String,
    pub name: String,
    pub in_my_pack: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiPackDto {
    pub owner_id: Uuid,
    pub owner_name: String,
    pub owner_handle: String,
    pub emojis: Vec<EmojiDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiLibraryDto {
    pub mine: Vec<EmojiDto>,
    pub packs: Vec<EmojiPackDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadQuery {
    name: Option<String>,
    mime: Option<String>,
    width: Option<i32>,
    height: Option<i32>,
}

fn emoji_path(dir: &str, id: Uuid) -> std::path::PathBuf {
    std::path::Path::new(dir).join("emoji").join(id.to_string())
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | ' '))
        .take(32)
        .collect::<String>()
        .trim()
        .to_string()
}

fn allowed_mime(mime: &str) -> bool {
    matches!(
        mime,
        "image/png" | "image/webp" | "image/gif" | "image/jpeg" | "image/jpg"
    )
}

pub async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<EmojiLibraryDto>> {
    let mine: Vec<EmojiDto> = sqlx::query_as(
        "SELECT id, owner_id, name, mime, width, height FROM custom_emojis
         WHERE owner_id = $1 ORDER BY created_at DESC",
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    let pack_owners: Vec<(Uuid, String, String)> = sqlx::query_as(
        "SELECT u.id, u.name, u.handle
         FROM custom_emoji_packs p
         JOIN users u ON u.id = p.owner_id
         WHERE p.user_id = $1
         ORDER BY p.saved_at DESC",
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;

    let mut packs = Vec::new();
    for (owner_id, owner_name, owner_handle) in pack_owners {
        let emojis: Vec<EmojiDto> = sqlx::query_as(
            "SELECT id, owner_id, name, mime, width, height FROM custom_emojis
             WHERE owner_id = $1 ORDER BY created_at DESC",
        )
        .bind(owner_id)
        .fetch_all(&state.db)
        .await?;
        packs.push(EmojiPackDto {
            owner_id,
            owner_name,
            owner_handle,
            emojis,
        });
    }
    Ok(Json(EmojiLibraryDto { mine, packs }))
}

pub async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<UploadQuery>,
    body: Bytes,
) -> ApiResult<Json<EmojiDto>> {
    if body.is_empty() || body.len() > MAX_EMOJI_BYTES {
        return Err(AppError::BadRequest(
            "emoji must be between 1 byte and 1.5 MB".into(),
        ));
    }
    let mime = query.mime.unwrap_or_else(|| "image/png".into());
    if !allowed_mime(&mime) {
        return Err(AppError::BadRequest("emoji must be png, webp, gif, or jpeg".into()));
    }
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM custom_emojis WHERE owner_id = $1")
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;
    if count.0 >= MAX_PER_USER {
        return Err(AppError::BadRequest("pack is full (64 emojis)".into()));
    }

    let id = Uuid::new_v4();
    let name = sanitize_name(query.name.as_deref().unwrap_or(""));
    let dir = std::path::Path::new(&state.cfg.attachments_dir).join("emoji");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(format!("emoji dir: {e}")))?;
    let path = dir.join(id.to_string());
    tokio::fs::write(&path, &body)
        .await
        .map_err(|e| AppError::Internal(format!("emoji write: {e}")))?;

    let row: EmojiDto = match sqlx::query_as(
        "INSERT INTO custom_emojis (id, owner_id, name, mime, size_bytes, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, owner_id, name, mime, width, height",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&name)
    .bind(&mime)
    .bind(body.len() as i64)
    .bind(query.width)
    .bind(query.height)
    .fetch_one(&state.db)
    .await
    {
        Ok(row) => row,
        Err(e) => {
            let _ = tokio::fs::remove_file(&path).await;
            return Err(e.into());
        }
    };
    Ok(Json(row))
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let n = sqlx::query("DELETE FROM custom_emojis WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    let _ = tokio::fs::remove_file(emoji_path(&state.cfg.attachments_dir, id)).await;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn meta(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<EmojiMetaDto>> {
    let row: Option<(Uuid, Uuid, String, String, String, String)> = sqlx::query_as(
        "SELECT e.id, e.owner_id, e.name, e.mime, u.name, u.handle
         FROM custom_emojis e JOIN users u ON u.id = e.owner_id
         WHERE e.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;
    let Some((eid, owner_id, name, _mime, owner_name, owner_handle)) = row else {
        return Err(AppError::NotFound);
    };
    let in_my_pack: (bool,) = sqlx::query_as(
        "SELECT $2 = $3 OR EXISTS (
            SELECT 1 FROM custom_emoji_packs WHERE user_id = $2 AND owner_id = $3
         ) OR EXISTS (
            SELECT 1 FROM custom_emojis WHERE owner_id = $2 AND (id = $1 OR copied_from = $1)
         )",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(owner_id)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(EmojiMetaDto {
        id: eid,
        owner_id,
        owner_name,
        owner_handle,
        name,
        in_my_pack: in_my_pack.0,
    }))
}

pub async fn download(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT mime, name FROM custom_emojis WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let Some((mime, name)) = row else {
        return Err(AppError::NotFound);
    };
    let path = emoji_path(&state.cfg.attachments_dir, id);
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| AppError::NotFound)?;
    let filename = if name.is_empty() {
        id.to_string()
    } else {
        name.replace('"', "")
    };
    Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{filename}\""),
        )
        .header("X-Content-Type-Options", "nosniff")
        .header(header::CACHE_CONTROL, "private, max-age=86400")
        .body(Body::from_stream(ReaderStream::new(file)))
        .map_err(|e| AppError::Internal(format!("response build: {e}")))
}

pub async fn save_pack(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(owner_id): Path<Uuid>,
) -> ApiResult<Json<EmojiLibraryDto>> {
    if owner_id == auth.user_id {
        return Err(AppError::BadRequest("that pack is already yours".into()));
    }
    let exists: (bool,) = sqlx::query_as("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
        .bind(owner_id)
        .fetch_one(&state.db)
        .await?;
    if !exists.0 {
        return Err(AppError::NotFound);
    }

    sqlx::query(
        "INSERT INTO custom_emoji_packs (user_id, owner_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING",
    )
    .bind(auth.user_id)
    .bind(owner_id)
    .execute(&state.db)
    .await?;

    let source: Vec<(Uuid, String, String, i64, Option<i32>, Option<i32>)> = sqlx::query_as(
        "SELECT id, name, mime, size_bytes, width, height FROM custom_emojis WHERE owner_id = $1",
    )
    .bind(owner_id)
    .fetch_all(&state.db)
    .await?;

    let mine_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM custom_emojis WHERE owner_id = $1")
            .bind(auth.user_id)
            .fetch_one(&state.db)
            .await?;

    let dir = std::path::Path::new(&state.cfg.attachments_dir).join("emoji");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(format!("emoji dir: {e}")))?;

    let mut copied = mine_count.0;
    for (src_id, name, mime, size_bytes, width, height) in source {
        if copied >= MAX_PER_USER {
            break;
        }
        let already: (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM custom_emojis WHERE owner_id = $1 AND copied_from = $2)",
        )
        .bind(auth.user_id)
        .bind(src_id)
        .fetch_one(&state.db)
        .await?;
        if already.0 {
            continue;
        }
        let new_id = Uuid::new_v4();
        let from = emoji_path(&state.cfg.attachments_dir, src_id);
        let to = emoji_path(&state.cfg.attachments_dir, new_id);
        if tokio::fs::copy(&from, &to).await.is_err() {
            continue;
        }
        let inserted = sqlx::query(
            "INSERT INTO custom_emojis (id, owner_id, name, mime, size_bytes, width, height, copied_from)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT DO NOTHING",
        )
        .bind(new_id)
        .bind(auth.user_id)
        .bind(&name)
        .bind(&mime)
        .bind(size_bytes)
        .bind(width)
        .bind(height)
        .bind(src_id)
        .execute(&state.db)
        .await;
        if inserted.is_ok() {
            copied += 1;
        } else {
            let _ = tokio::fs::remove_file(&to).await;
        }
    }

    list(State(state), auth).await
}
