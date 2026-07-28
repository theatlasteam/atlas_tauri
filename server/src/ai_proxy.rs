//! Reverse proxy for the Inference Gateway, mounted on this same server at
//! `/v1/*` so it can be reached at `ai.atlasmsg.app` (or any other hostname
//! pointed at this deployment) without exposing `inference.waw0.amvera.ru`
//! directly. This is the "custom api" layer — callers (compass.rs included)
//! never talk to the upstream gateway themselves, only to this route, which
//! forwards the request byte-for-byte and streams the response back.
//!
//! The gateway key lives only in `COMPASS_API_KEY` on this server — this
//! route injects it itself and requires a signed-in Atlas session, so the
//! key is never handed to a client and the gateway is never reachable
//! anonymously through us.

use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};

use crate::auth::AuthUser;
use crate::state::AppState;

const UPSTREAM_BASE: &str = "https://inference.waw0.amvera.ru";

// Requiring AuthUser (any signed-in Atlas account) keeps this from being an
// open, unauthenticated relay to the gateway — without it, anyone on the
// internet could hit ai.atlasmsg.app and use this server as a free anonymous
// proxy, whether or not they supplied their own key.
pub async fn proxy(State(state): State<AppState>, _auth: AuthUser, req: Request) -> Response {
    let method = req.method().clone();
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let url = format!("{UPSTREAM_BASE}{path_and_query}");
    let upstream_uri: Uri = match UPSTREAM_BASE.parse::<Uri>() {
        Ok(u) => u,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let upstream_host = upstream_uri.host().unwrap_or_default().to_string();

    let mut headers = HeaderMap::new();
    for (name, value) in req.headers() {
        // hop-by-hop / host headers must not be forwarded verbatim, and any
        // caller-supplied auth is dropped — this server's own key is the
        // only one that's ever sent upstream.
        if matches!(
            name.as_str(),
            "host" | "content-length" | "connection" | "transfer-encoding" | "authorization" | "x-auth-header"
        ) {
            continue;
        }
        headers.insert(name.clone(), value.clone());
    }
    if let Ok(host_value) = HeaderValue::from_str(&upstream_host) {
        headers.insert(axum::http::header::HOST, host_value);
    }
    let Some(api_key) = &state.cfg.compass_api_key else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    match HeaderValue::from_str(api_key) {
        Ok(v) => {
            headers.insert("X-Auth-Header", v);
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }

    let body_bytes = match axum::body::to_bytes(req.into_body(), 8 * 1024 * 1024).await {
        Ok(b) => b,
        Err(_) => return StatusCode::PAYLOAD_TOO_LARGE.into_response(),
    };

    let upstream_resp = state
        .http
        .request(method, &url)
        .headers(headers)
        .body(body_bytes)
        .send()
        .await;

    let upstream_resp = match upstream_resp {
        Ok(r) => r,
        Err(err) => {
            tracing::warn!(?err, "ai proxy: upstream request failed");
            return StatusCode::BAD_GATEWAY.into_response();
        }
    };

    let status = upstream_resp.status();
    let mut resp_headers = HeaderMap::new();
    for (name, value) in upstream_resp.headers() {
        if matches!(
            name.as_str(),
            "connection" | "transfer-encoding" | "content-length"
        ) {
            continue;
        }
        resp_headers.insert(name.clone(), value.clone());
    }

    let stream = upstream_resp.bytes_stream();
    let mut response = Response::builder().status(status);
    if let Some(h) = response.headers_mut() {
        *h = resp_headers;
    }
    response
        .body(Body::from_stream(stream))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}
