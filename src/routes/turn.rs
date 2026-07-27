//! Ephemeral TURN credentials (coturn `use-auth-secret` / "TURN REST API"
//! convention, draft-uberti-behave-turn-rest-00).
//!
//! Why not static TURN credentials: they end up embedded in shipped clients,
//! get scraped, and your relay becomes the internet's free proxy. Instead the
//! backend — which knows who is authenticated — mints short-lived credentials:
//!   username  = "<unix_expiry>:<user_id>"
//!   password  = base64(HMAC-SHA1(turn_secret, username))
//! coturn recomputes the HMAC and honors the expiry; no per-user state is
//! shared with the TURN server beyond the one secret. (HMAC-SHA1 is what
//! coturn implements; HMAC's security here does not rest on SHA-1 collision
//! resistance.)

use axum::extract::State;
use axum::Json;
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha1::Sha1;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IceServersResponse {
    /// Ready to drop into RTCPeerConnection's `iceServers` config.
    ice_servers: Vec<IceServer>,
    /// Seconds the TURN credential remains valid; clients should refresh
    /// before starting a call if stale.
    ttl: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IceServer {
    urls: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    credential: Option<String>,
}

pub async fn ice_servers(
    State(state): State<AppState>,
    auth: AuthUser,
) -> ApiResult<Json<IceServersResponse>> {
    let (stun_urls, turn_urls): (Vec<String>, Vec<String>) = state
        .cfg
        .turn_urls
        .iter()
        .cloned()
        .partition(|u| u.starts_with("stun:") || u.starts_with("stuns:"));

    let mut servers = Vec::new();
    if !stun_urls.is_empty() {
        servers.push(IceServer { urls: stun_urls, username: None, credential: None });
    }

    if !turn_urls.is_empty() {
        if let (Some(username), Some(credential)) =
            (&state.cfg.turn_static_username, &state.cfg.turn_static_credential)
        {
            servers.push(IceServer {
                urls: turn_urls,
                username: Some(username.clone()),
                credential: Some(credential.clone()),
            });
        } else if !state.cfg.turn_secret.is_empty() {
            let expiry = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| AppError::Internal("clock before epoch".into()))?
                .as_secs()
                + state.cfg.turn_ttl.as_secs();
            let username = format!("{expiry}:{}", auth.user_id);
            let mut mac = Hmac::<Sha1>::new_from_slice(state.cfg.turn_secret.as_bytes())
                .map_err(|e| AppError::Internal(format!("hmac init: {e}")))?;
            mac.update(username.as_bytes());
            let credential = B64.encode(mac.finalize().into_bytes());
            servers.push(IceServer {
                urls: turn_urls,
                username: Some(username),
                credential: Some(credential),
            });
        }
    }

    Ok(Json(IceServersResponse { ice_servers: servers, ttl: state.cfg.turn_ttl.as_secs() }))
}
