use argon2::password_hash::rand_core::OsRng as HashOsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::Json;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use base64::Engine;
use chrono::{Duration as ChronoDuration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{ApiResult, AppError};
use crate::models::{UserDto, UserRow};
use crate::state::AppState;

pub const USER_COLUMNS: &str =
    "id, handle, name, bio, status, avatar_color, avatar_initial, avatar_attachment_id, last_seen_at, verified";

// ---------- password hashing ----------
//
// Argon2id with the crate defaults (19 MiB, t=2, p=1 — the OWASP-recommended
// profile). Hashing is CPU/memory-heavy by design, so it always runs inside
// spawn_blocking to keep the async workers responsive.

async fn hash_password(password: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut HashOsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| AppError::Internal(format!("hash failure: {e}")))
    })
    .await
    .map_err(|e| AppError::Internal(format!("join error: {e}")))?
}

async fn verify_password(password: String, hash: String) -> Result<bool, AppError> {
    tokio::task::spawn_blocking(move || {
        let parsed = PasswordHash::new(&hash)
            .map_err(|e| AppError::Internal(format!("stored hash invalid: {e}")))?;
        Ok(Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
    })
    .await
    .map_err(|e| AppError::Internal(format!("join error: {e}")))?
}

// ---------- tokens ----------
//
// Sessions use opaque 256-bit random bearer tokens, stored server-side as
// SHA-256 hashes. Compared to JWTs this costs one indexed DB read per request
// but buys instant revocation (logout, stolen device) and no signing-key
// rotation story — the right trade for a messenger where "log out my stolen
// phone" must actually work immediately.

fn generate_token() -> (String, Vec<u8>) {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let token = B64URL.encode(bytes);
    let hash = Sha256::digest(token.as_bytes()).to_vec();
    (token, hash)
}

fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Resolve a bearer token to a live user. Shared by the HTTP extractor and the
/// WebSocket auth handshake.
pub async fn authenticate(db: &PgPool, token: &str) -> Result<AuthUser, AppError> {
    let hash = token_hash(token);
    let row: Option<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT s.id, s.user_id FROM sessions s
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()",
    )
    .bind(&hash)
    .fetch_optional(db)
    .await?;
    let (session_id, user_id) = row.ok_or(AppError::Unauthorized)?;

    // Touch last_used_at; best-effort, never blocks the request on failure.
    let _ = sqlx::query("UPDATE sessions SET last_used_at = now() WHERE id = $1")
        .bind(session_id)
        .execute(db)
        .await;

    Ok(AuthUser { user_id, session_id })
}

#[derive(Debug, Clone, Copy)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub session_id: Uuid,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        let token = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        authenticate(&state.db, token).await
    }
}

// ---------- handlers ----------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPayload {
    pub handle: String,
    pub name: String,
    pub password: String,
    pub device_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginPayload {
    pub handle: String,
    pub password: String,
    pub device_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthResponse {
    pub token: String,
    pub user: UserDto,
}

fn valid_handle(handle: &str) -> bool {
    (3..=32).contains(&handle.len())
        && handle.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

async fn create_session(
    state: &AppState,
    user_id: Uuid,
    device_name: Option<String>,
) -> Result<String, AppError> {
    let (token, hash) = generate_token();
    let expires = Utc::now()
        + ChronoDuration::from_std(state.cfg.session_ttl)
            .unwrap_or_else(|_| ChronoDuration::days(30));
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token_hash, device_name, expires_at)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(&hash)
    .bind(device_name.unwrap_or_default())
    .bind(expires)
    .execute(&state.db)
    .await?;
    Ok(token)
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterPayload>,
) -> ApiResult<Json<AuthResponse>> {
    let handle = payload.handle.trim().to_lowercase();
    if !valid_handle(&handle) {
        return Err(AppError::BadRequest(
            "handle must be 3-32 chars of a-z, 0-9, _".into(),
        ));
    }
    if payload.password.len() < 8 {
        return Err(AppError::BadRequest("password must be at least 8 characters".into()));
    }
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest("name must be 1-80 characters".into()));
    }

    let password_hash = hash_password(payload.password).await?;
    let initial = name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_default();

    let user: UserRow = sqlx::query_as(&format!(
        "INSERT INTO users (id, handle, name, password_hash, avatar_initial)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (handle) DO NOTHING
         RETURNING {USER_COLUMNS}"
    ))
    .bind(Uuid::new_v4())
    .bind(&handle)
    .bind(name)
    .bind(&password_hash)
    .bind(&initial)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Conflict("handle already taken".into()))?;

    let token = create_session(&state, user.id, payload.device_name).await?;
    Ok(Json(AuthResponse { token, user: user.into() }))
}

/// A real argon2 hash of an unguessable value, verified when the handle does
/// not exist so login timing does not reveal which handles are registered.
fn dummy_hash() -> String {
    static DUMMY: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    DUMMY
        .get_or_init(|| {
            let salt = SaltString::generate(&mut HashOsRng);
            Argon2::default()
                .hash_password(Uuid::new_v4().as_bytes(), &salt)
                .expect("argon2 hash of fixed input cannot fail")
                .to_string()
        })
        .clone()
}

#[derive(sqlx::FromRow)]
struct LoginRow {
    password_hash: String,
    #[sqlx(flatten)]
    user: UserRow,
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginPayload>,
) -> ApiResult<Json<AuthResponse>> {
    let row: Option<LoginRow> = sqlx::query_as(&format!(
        "SELECT password_hash, {USER_COLUMNS} FROM users WHERE handle = $1"
    ))
    .bind(payload.handle.trim())
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        // Burn the same work as a real verification, then fail generically.
        let _ = verify_password(payload.password, dummy_hash()).await;
        return Err(AppError::Unauthorized);
    };

    if !verify_password(payload.password, row.password_hash).await? {
        return Err(AppError::Unauthorized);
    }

    let token = create_session(&state, row.user.id, payload.device_name).await?;
    Ok(Json(AuthResponse { token, user: row.user.into() }))
}

pub async fn logout(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("UPDATE sessions SET revoked_at = now() WHERE id = $1")
        .bind(auth.session_id)
        .execute(&state.db)
        .await?;
    // Kick this device's live sockets so revocation is immediate, not
    // "whenever the socket next reconnects".
    state.hub.disconnect_session(auth.session_id);
    Ok(Json(json!({ "ok": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub id: Uuid,
    pub device_name: String,
    pub created_at: chrono::DateTime<Utc>,
    pub last_used_at: chrono::DateTime<Utc>,
    pub current: bool,
}

pub async fn list_sessions(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<Vec<SessionDto>>> {
    let rows: Vec<(Uuid, String, chrono::DateTime<Utc>, chrono::DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, device_name, created_at, last_used_at FROM sessions
         WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
         ORDER BY last_used_at DESC",
    )
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(
        rows.into_iter()
            .map(|(id, device_name, created_at, last_used_at)| SessionDto {
                id,
                device_name,
                created_at,
                last_used_at,
                current: id == auth.session_id,
            })
            .collect(),
    ))
}

pub async fn revoke_session(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Path(session_id): axum::extract::Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let res = sqlx::query(
        "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(auth.user_id)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    state.hub.disconnect_session(session_id);
    Ok(Json(json!({ "ok": true })))
}
