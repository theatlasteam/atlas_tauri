//! Push-notification device registration. The client posts its FCM
//! registration token after sign-in (and whenever FCM rotates it), and deletes
//! it on sign-out so a shared device stops receiving the previous account's
//! notifications.

use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::{AppError, ApiResult};
use crate::state::AppState;

/// FCM tokens are ~160 chars today but the format isn't contractual; this is a
/// sanity bound to keep junk out of the table, not a validation rule.
const MAX_TOKEN_LEN: usize = 512;

const ALLOWED_PLATFORMS: [&str; 3] = ["android", "ios", "web"];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDevicePayload {
    token: String,
    /// "android" | "ios" | "web" — only android sends pushes today.
    platform: String,
}

/// Register (or re-register) this device for pushes. Idempotent: the token is
/// the primary key, so repeated calls just refresh updated_at, and a token that
/// previously belonged to another account is reassigned to this one — which is
/// what must happen when two people share a device.
pub async fn register_device(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<RegisterDevicePayload>,
) -> ApiResult<Json<serde_json::Value>> {
    let token = payload.token.trim();
    if token.is_empty() || token.len() > MAX_TOKEN_LEN {
        return Err(AppError::BadRequest(format!("token must be 1..={MAX_TOKEN_LEN} chars")));
    }
    if !ALLOWED_PLATFORMS.contains(&payload.platform.as_str()) {
        return Err(AppError::BadRequest("platform must be android, ios or web".into()));
    }

    sqlx::query(
        "INSERT INTO device_tokens (token, user_id, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE
            SET user_id = EXCLUDED.user_id,
                platform = EXCLUDED.platform,
                updated_at = now()",
    )
    .bind(token)
    .bind(auth.user_id)
    .bind(&payload.platform)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Drop a token on sign-out. Scoped to the caller's own rows so one account
/// can't unregister another's device.
pub async fn unregister_device(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(token): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM device_tokens WHERE token = $1 AND user_id = $2")
        .bind(&token)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    // Deliberately not 404 on a missing row: sign-out should be idempotent and
    // must never fail because the token was already gone.
    Ok(Json(serde_json::json!({ "ok": true })))
}
