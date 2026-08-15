//! Plugin store. Plugins are user-authored JS workspaces: a set of files
//! (manifest.json + main.js + helpers) written through the editor on the
//! marketing site and installed by the Tauri app's Plugins screen.
//!
//! The payload is just `files` — a filename -> source map. Everything else
//! (name, version, description, author) is derived from `manifest.json` on
//! write, so the manifest is the single source of truth and the scalar
//! columns are only a denormalized index for the store list.
//!
//! Reads are public — the store is the point of the feature. Writes require
//! an authenticated Atlas account (the editor's login), and every plugin is
//! tied to the developer who published it: create sets `owner_id`, and
//! update/delete are restricted to that owner. The DTO carries the owner's
//! public profile so the store can show who wrote what.

use std::collections::BTreeMap;

use axum::body::{Body, Bytes};
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::Response;
use axum::Json;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::types::Json as SqlxJson;
use tokio_util::io::ReaderStream;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;

const MAX_FILES: usize = 32;
const MAX_FILES_BYTES: usize = 512 * 1024;
const MAX_FILE_NAME_LEN: usize = 64;
const MAX_PLUGIN_ID_LEN: usize = 128;
const MAX_NAME_LEN: usize = 80;
const MAX_VERSION_LEN: usize = 32;
const MAX_DESC_LEN: usize = 500;

/// `p`/`u` prefixed aliases avoid a clash with `id`/`name`/… in the
/// SELECT list when plugins is joined with users for the developer badge.
const PLUGIN_COLUMNS: &str = "\
p.id, p.plugin_id, p.name, p.version, p.description, p.author, p.files, p.downloads, \
p.created_at, p.updated_at, \
u.id AS owner_id, u.handle AS owner_handle, u.name AS owner_name, \
(u.avatar_attachment_id IS NOT NULL) AS owner_has_avatar";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperDto {
    pub id: Uuid,
    pub handle: String,
    pub name: String,
    pub has_avatar: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginDto {
    pub id: Uuid,
    pub plugin_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub files: BTreeMap<String, String>,
    pub downloads: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// The Atlas account that published the plugin (absent for legacy rows).
    pub developer: Option<DeveloperDto>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct PluginRow {
    pub id: Uuid,
    pub plugin_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub files: SqlxJson<BTreeMap<String, String>>,
    pub downloads: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub owner_id: Option<Uuid>,
    pub owner_handle: Option<String>,
    pub owner_name: Option<String>,
    pub owner_has_avatar: bool,
}

impl From<PluginRow> for PluginDto {
    fn from(r: PluginRow) -> Self {
        Self {
            id: r.id,
            plugin_id: r.plugin_id,
            name: r.name,
            version: r.version,
            description: r.description,
            author: r.author,
            files: r.files.0,
            downloads: r.downloads,
            created_at: r.created_at,
            updated_at: r.updated_at,
            developer: match (r.owner_id, r.owner_handle, r.owner_name) {
                (Some(id), Some(handle), Some(name)) => Some(DeveloperDto {
                    id,
                    handle,
                    name,
                    has_avatar: r.owner_has_avatar,
                }),
                _ => None,
            },
        }
    }
}

const PLUGIN_FROM: &str = "FROM plugins p LEFT JOIN users u ON u.id = p.owner_id";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPayload {
    pub files: BTreeMap<String, String>,
}

/// Denormalized scalar columns, pulled out of the parsed manifest. The
/// author column is NOT here: authorship is the developer's Atlas account
/// (owner_id), so the server stamps `author` with the owner's handle.
pub(crate) struct PluginMeta {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) description: String,
}

fn valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_FILE_NAME_LEN
        && name != "."
        && name != ".."
        && !name.starts_with('/')
        && !name.ends_with('/')
        && !name.contains("//")
        && name.split('/').all(|seg| {
            !seg.is_empty()
                && seg != "."
                && seg != ".."
                && seg.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        })
}

pub(crate) fn validate_files(files: &BTreeMap<String, String>) -> Result<PluginMeta, AppError> {
    if files.is_empty() || files.len() > MAX_FILES {
        return Err(AppError::BadRequest(
            "a plugin must contain between 1 and 32 files".into(),
        ));
    }
    let mut total = 0usize;
    for (name, body) in files {
        if !valid_file_name(name) {
            return Err(AppError::BadRequest(format!("invalid file name: {name}")));
        }
        total += name.len() + body.len();
    }
    if total > MAX_FILES_BYTES {
        return Err(AppError::BadRequest("plugin files are too large".into()));
    }

    let manifest_raw = files
        .get("manifest.json")
        .ok_or_else(|| AppError::BadRequest("manifest.json is required".into()))?;
    let manifest: serde_json::Value = serde_json::from_str(manifest_raw)
        .map_err(|_| AppError::BadRequest("manifest.json is not valid JSON".into()))?;
    let obj = manifest
        .as_object()
        .ok_or_else(|| AppError::BadRequest("manifest.json must be a JSON object".into()))?;

    let get = |key: &str| {
        obj.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    let id = get("id").ok_or_else(|| AppError::BadRequest("manifest.json needs an \"id\"".into()))?;
    let name =
        get("name").ok_or_else(|| AppError::BadRequest("manifest.json needs a \"name\"".into()))?;
    let version = get("version")
        .ok_or_else(|| AppError::BadRequest("manifest.json needs a \"version\"".into()))?;
    let main =
        get("main").ok_or_else(|| AppError::BadRequest("manifest.json needs a \"main\"".into()))?;

    if id.len() > MAX_PLUGIN_ID_LEN
        || !id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '-' | '_' | '.'))
    {
        return Err(AppError::BadRequest(
            "manifest \"id\" must be 1-128 chars of a-z, 0-9, -, _ or .".into(),
        ));
    }
    if name.len() > MAX_NAME_LEN {
        return Err(AppError::BadRequest("manifest \"name\" is too long".into()));
    }
    if version.len() > MAX_VERSION_LEN {
        return Err(AppError::BadRequest("manifest \"version\" is too long".into()));
    }
    if !valid_file_name(&main) || !files.contains_key(&main) {
        return Err(AppError::BadRequest(format!(
            "manifest \"main\" file \"{main}\" does not exist"
        )));
    }

    let description = get("description").unwrap_or_default();
    if description.len() > MAX_DESC_LEN {
        return Err(AppError::BadRequest("manifest \"description\" is too long".into()));
    }

    Ok(PluginMeta { id, name, version, description })
}

/// All plugins, newest first — the public store the app's marketplace reads.
pub async fn list(State(state): State<AppState>) -> ApiResult<Json<Vec<PluginDto>>> {
    let rows = sqlx::query_as::<_, PluginRow>(&format!(
        "SELECT {PLUGIN_COLUMNS} {PLUGIN_FROM} ORDER BY p.created_at DESC"
    ))
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

/// Plugins published by the authenticated developer — the web editor's "My
/// plugins" dashboard.
pub async fn list_mine(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<PluginDto>>> {
    let rows = sqlx::query_as::<_, PluginRow>(&format!(
        "SELECT {PLUGIN_COLUMNS} {PLUGIN_FROM} WHERE p.owner_id = $1 ORDER BY p.created_at DESC"
    ))
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

pub async fn get(State(state): State<AppState>, Path(id): Path<Uuid>) -> ApiResult<Json<PluginDto>> {
    let row = sqlx::query_as::<_, PluginRow>(&format!(
        "SELECT {PLUGIN_COLUMNS} {PLUGIN_FROM} WHERE p.id = $1"
    ))
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row.into()))
}

/// Load the row's manifest id and owner — the two columns update needs to
/// enforce invariants before mutating anything.
#[derive(Debug, sqlx::FromRow)]
struct UpdateGate {
    plugin_id: String,
    owner_id: Option<Uuid>,
}

async fn update_gate(state: &AppState, id: Uuid) -> Result<UpdateGate, AppError> {
    let row = sqlx::query_as::<_, UpdateGate>(
        "SELECT plugin_id, owner_id FROM plugins WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(row)
}

/// The account that owns a plugin is the author — the manifest no longer
/// carries one. Pull the handle so the denormalized `author` column stays
/// populated for older consumers (the marketplace's "by …" line).
async fn owner_handle(state: &AppState, user_id: Uuid) -> Result<String, AppError> {
    sqlx::query_scalar("SELECT handle FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<PluginPayload>,
) -> ApiResult<Json<PluginDto>> {
    let meta = validate_files(&payload.files)?;
    let author = owner_handle(&state, auth.user_id).await?;

    let row = PluginRow {
        id: Uuid::new_v4(),
        plugin_id: meta.id,
        name: meta.name,
        version: meta.version,
        description: meta.description,
        author,
        files: SqlxJson(payload.files),
        downloads: 0,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        owner_id: Some(auth.user_id),
        owner_handle: None,
        owner_name: None,
        owner_has_avatar: false,
    };

    let inserted = sqlx::query(&format!(
        "INSERT INTO plugins (id, plugin_id, name, version, description, author, files, downloads, created_at, updated_at, owner_id) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"
    ))
    .bind(row.id)
    .bind(&row.plugin_id)
    .bind(&row.name)
    .bind(&row.version)
    .bind(&row.description)
    .bind(&row.author)
    .bind(&row.files)
    .bind(row.downloads)
    .bind(row.created_at)
    .bind(row.updated_at)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;
    if inserted.rows_affected() == 0 {
        return Err(AppError::Conflict("pluginId already taken".into()));
    }
    Ok(Json(row.into()))
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<PluginPayload>,
) -> ApiResult<Json<PluginDto>> {
    let meta = validate_files(&payload.files)?;
    let gate = update_gate(&state, id).await?;

    // Only the developer may edit their published plugin.
    if gate.owner_id != Some(auth.user_id) {
        return Err(AppError::Forbidden);
    }
    // The manifest id is the identity of an install — it must not change
    // after publish (existing installs key their storage by it).
    if gate.plugin_id != meta.id {
        return Err(AppError::Conflict(
            "the manifest \"id\" cannot change after publishing".into(),
        ));
    }
    let author = owner_handle(&state, auth.user_id).await?;

    // Update the row, then re-select with the developer join — Postgres
    // doesn't allow a FROM/JOIN clause inside UPDATE ... RETURNING.
    let updated = sqlx::query(
        "UPDATE plugins SET name=$2, version=$3, description=$4, author=$5, files=$6, updated_at=now() \
         WHERE id=$1 AND owner_id=$7",
    )
    .bind(id)
    .bind(&meta.name)
    .bind(&meta.version)
    .bind(&meta.description)
    .bind(&author)
    .bind(SqlxJson(payload.files))
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    let row = sqlx::query_as::<_, PluginRow>(&format!(
        "SELECT {PLUGIN_COLUMNS} {PLUGIN_FROM} WHERE p.id = $1"
    ))
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(row.into()))
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let gate = update_gate(&state, id).await?;
    if gate.owner_id != Some(auth.user_id) {
        return Err(AppError::Forbidden);
    }
    let res = sqlx::query("DELETE FROM plugins WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Bumps the download counter when the app installs a plugin. Best-effort
/// analytics for the store, not a gate.
pub async fn install(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let res = sqlx::query("UPDATE plugins SET downloads = downloads + 1 WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub const MAX_ICON_BYTES: usize = 2 * 1024 * 1024;

/// Upload a plugin icon. Raw bytes (same shape as /api/attachments) — the
/// file goes to the shared attachment store and the manifest references the
/// returned URL instead of inlining base64 into the workspace. Owner-only.
pub async fn upload_icon(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(plugin_id): Path<Uuid>,
    Query(query): Query<IconUploadQuery>,
    body: Bytes,
) -> ApiResult<Json<serde_json::Value>> {
    let gate = update_gate(&state, plugin_id).await?;
    if gate.owner_id != Some(auth.user_id) {
        return Err(AppError::Forbidden);
    }
    if body.is_empty() || body.len() > MAX_ICON_BYTES {
        return Err(AppError::BadRequest(
            "icon must be 1 byte to 2 MiB".into(),
        ));
    }
    let mime = query.mime.unwrap_or_else(|| "image/png".into());
    if !mime.starts_with("image/") || mime.len() > 100 {
        return Err(AppError::BadRequest("icon must be an image".into()));
    }
    let filename = query
        .filename
        .map(|f| {
            f.chars()
                .filter(|c| !matches!(c, '/' | '\\' | '\0'))
                .take(120)
                .collect::<String>()
        })
        .unwrap_or_else(|| "icon".into());

    let id = Uuid::new_v4();
    let dir = &state.cfg.attachments_dir;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| AppError::Internal(format!("attachments dir: {e}")))?;
    let path = std::path::Path::new(dir).join(id.to_string());
    tokio::fs::write(&path, &body)
        .await
        .map_err(|e| AppError::Internal(format!("icon write: {e}")))?;

    let res = sqlx::query(
        "INSERT INTO attachments (id, owner_id, kind, mime, size_bytes, filename) \
         VALUES ($1, $2, 'image', $3, $4, $5)",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(&mime)
    .bind(body.len() as i64)
    .bind(&filename)
    .execute(&state.db)
    .await;
    if let Err(e) = res {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e.into());
    }
    Ok(Json(serde_json::json!({ "url": format!("/api/plugins/assets/{id}") })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IconUploadQuery {
    filename: Option<String>,
    mime: Option<String>,
}

/// Public plugin-icon download. Unlike message attachments (chat-membership
/// gated) and avatars (auth gated), store icons must load for anyone browsing
/// the marketplace — the image bytes are the plugin's public listing art.
/// Served with a safe `image/*` content type and no attachment disposition so
/// `<img>` can render it cross-origin.
pub async fn get_icon(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> ApiResult<Response> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT mime FROM attachments WHERE id = $1 AND kind = 'image'")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let (mime,) = row.ok_or(AppError::NotFound)?;
    let path = std::path::Path::new(&state.cfg.attachments_dir).join(id.to_string());
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|_| AppError::NotFound)?;
    let len = file.metadata().await.ok().map(|m| m.len());

    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header("X-Content-Type-Options", "nosniff");
    if let Some(len) = len {
        builder = builder.header(header::CONTENT_LENGTH, len);
    }
    builder
        .body(Body::from_stream(ReaderStream::new(file)))
        .map_err(|e| AppError::Internal(format!("response build: {e}")))
}