//! Attachment upload/download.
//!
//! Files live on disk under `ATTACHMENTS_DIR` named by UUID (never by
//! client-supplied filename — that stays metadata only, so path traversal is
//! structurally impossible). Metadata lives in Postgres. Upload is raw bytes
//! (works identically from fetch() on every platform, no multipart parsing),
//! then the returned id is referenced by a message; download is authorized by
//! chat membership of the referencing message (or uploader before send).
//!
//! Not E2EE in v1: media bytes are visible to the server even in encrypted
//! chats. The E2EE path for media (client-side encryption with per-file keys
//! shipped in the message ciphertext) is noted in the README.

use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::Response;
use axum::Json;
use serde::Deserialize;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::{AttachmentDto, AttachmentRow};
use crate::state::AppState;

pub const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadQuery {
    kind: String,
    filename: Option<String>,
    mime: Option<String>,
    duration_ms: Option<i32>,
    width: Option<i32>,
    height: Option<i32>,
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|c| !matches!(c, '/' | '\\' | '\0'))
        .take(120)
        .collect::<String>()
        .trim()
        .to_string()
}

pub async fn upload(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<UploadQuery>,
    body: Bytes,
) -> ApiResult<Json<AttachmentDto>> {
    if !matches!(query.kind.as_str(), "image" | "voice" | "file") {
        return Err(AppError::BadRequest("kind must be image|voice|file".into()));
    }
    if body.is_empty() || body.len() > MAX_ATTACHMENT_BYTES {
        return Err(AppError::BadRequest("attachment must be 1 byte to 25 MiB".into()));
    }
    let mime = query.mime.unwrap_or_else(|| "application/octet-stream".into());
    if mime.len() > 100 || !mime.contains('/') {
        return Err(AppError::BadRequest("invalid mime type".into()));
    }
    let filename = sanitize_filename(query.filename.as_deref().unwrap_or(""));

    let id = Uuid::new_v4();
    let dir = &state.cfg.attachments_dir;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| AppError::Internal(format!("attachments dir: {e}")))?;
    let path = std::path::Path::new(dir).join(id.to_string());
    tokio::fs::write(&path, &body)
        .await
        .map_err(|e| AppError::Internal(format!("attachment write: {e}")))?;

    let row: AttachmentRow = match sqlx::query_as(
        "INSERT INTO attachments (id, owner_id, kind, mime, size_bytes, filename, duration_ms, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, kind, mime, size_bytes, filename, duration_ms, width, height",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&query.kind)
    .bind(&mime)
    .bind(body.len() as i64)
    .bind(&filename)
    .bind(query.duration_ms)
    .bind(query.width)
    .bind(query.height)
    .fetch_one(&state.db)
    .await
    {
        Ok(row) => row,
        Err(e) => {
            // Don't leave orphan bytes on disk if the metadata insert failed.
            let _ = tokio::fs::remove_file(&path).await;
            return Err(e.into());
        }
    };
    Ok(Json(row.into()))
}

pub async fn download(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    // Authorized if I uploaded it, or it belongs to a message in a chat I'm in.
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT a.mime, a.filename FROM attachments a
         WHERE a.id = $1 AND (
            a.owner_id = $2
            OR EXISTS (
                SELECT 1 FROM messages m
                JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
                WHERE m.attachment_id = a.id
            )
         )",
    )
    .bind(id)
    .bind(auth.user_id)
    .fetch_optional(&state.db)
    .await?;
    let (mime, filename) = row.ok_or(AppError::NotFound)?;
    stream_attachment(&state, id, &mime, &filename).await
}

/// Streams an attachment's bytes off disk. Shared by the general
/// chat-membership-authorized download above and the avatar endpoint (which
/// authorizes differently: any authenticated user may view any other user's
/// published profile photo — see routes/users.rs).
pub async fn stream_attachment(
    state: &AppState,
    id: Uuid,
    mime: &str,
    filename: &str,
) -> ApiResult<Response> {
    let path = std::path::Path::new(&state.cfg.attachments_dir).join(id.to_string());
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| AppError::NotFound)?;
    let len = file.metadata().await.ok().map(|m| m.len());

    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        // Force download semantics for anything a browser might sniff; the
        // client renders images/audio from blob URLs, so this only hardens
        // direct navigation against stored-XSS-via-SVG and friends.
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename.replace('"', "")),
        )
        .header("X-Content-Type-Options", "nosniff");
    if let Some(len) = len {
        builder = builder.header(header::CONTENT_LENGTH, len);
    }
    builder
        .body(Body::from_stream(ReaderStream::new(file)))
        .map_err(|e| AppError::Internal(format!("response build: {e}")))
}
