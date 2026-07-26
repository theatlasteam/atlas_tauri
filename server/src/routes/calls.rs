//! REST surface for call actions that must work without a WebSocket.
//!
//! Call signaling lives on the socket (see ws::calls), but the Android
//! incoming-call notification can be acted on while the app isn't running —
//! there is no socket to send a CallEnd over, and spinning up the whole app
//! just to decline a call would be absurd. The notification's Decline button
//! posts here instead, using the auth token from app-private storage.

use axum::extract::{Path, State};
use axum::Json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;
use crate::ws::calls;

/// Decline a call that is ringing for the caller of this endpoint.
///
/// 404 when there is no such ringing call for this user — which covers an
/// already-cancelled call, one answered on another device, and any attempt to
/// end somebody else's call. Deliberately not distinguished: the response would
/// otherwise tell an attacker whether a given call id exists.
pub async fn decline_call(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(call_id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    if calls::decline_without_socket(&state, auth.user_id, call_id) {
        Ok(Json(serde_json::json!({ "ok": true })))
    } else {
        Err(AppError::NotFound)
    }
}
