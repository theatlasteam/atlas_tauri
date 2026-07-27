//! Alpha-test waitlist. Public signup form on the marketing site, plus an
//! admin-only view (list + live SSE stream) so signups can be watched as
//! they come in without polling.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::Json;
use chrono::{DateTime, Utc};
use futures_util::stream::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::error::{ApiResult, AppError};
use crate::state::AppState;

const MAX_EMAIL_LEN: usize = 320;

#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct WaitlistEntry {
    pub id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct JoinPayload {
    email: String,
}

/// Rough sanity check — this exists to keep obvious junk out of the table,
/// not to fully validate RFC 5322 addresses (a confirmation email would be
/// the actual validator, and there isn't one yet).
fn looks_like_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else { return false };
    !local.is_empty() && domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

pub async fn join(
    State(state): State<AppState>,
    Json(payload): Json<JoinPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    let email = payload.email.trim().to_lowercase();
    if email.is_empty() || email.len() > MAX_EMAIL_LEN || !looks_like_email(&email) {
        return Err(AppError::BadRequest("please enter a valid email address".into()));
    }

    let entry = WaitlistEntry { id: Uuid::new_v4(), email, created_at: Utc::now() };

    let inserted = sqlx::query(
        "INSERT INTO waitlist (id, email, created_at) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING",
    )
    .bind(entry.id)
    .bind(&entry.email)
    .bind(entry.created_at)
    .execute(&state.db)
    .await?;

    // Already on the list — not an error, just nothing new to broadcast.
    if inserted.rows_affected() == 0 {
        return Ok(Json(serde_json::json!({ "ok": true, "alreadyJoined": true })));
    }

    // No receiver (no admin tab open) is the common case and isn't an error.
    let _ = state.waitlist_tx.send(entry);

    Ok(Json(serde_json::json!({ "ok": true, "alreadyJoined": false })))
}

fn check_admin(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    let Some(expected) = &state.cfg.waitlist_admin_token else {
        // Unset means the deployment never opted into exposing this endpoint.
        return Err(AppError::NotFound);
    };
    let got = headers
        .get("x-admin-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if got != expected {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Vec<WaitlistEntry>>> {
    check_admin(&state, &headers)?;
    let rows = sqlx::query_as::<_, WaitlistEntry>(
        "SELECT id, email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 500",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(rows))
}

/// Live feed of new signups for the admin waitlist page. Sends the recent
/// backlog first (as a burst of `entry` events), then streams new ones as
/// they arrive — so opening the page always shows the current picture, not
/// just events from that moment forward.
pub async fn stream(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, AppError> {
    check_admin(&state, &headers)?;

    let backlog = sqlx::query_as::<_, WaitlistEntry>(
        "SELECT id, email, created_at FROM waitlist ORDER BY created_at ASC LIMIT 500",
    )
    .fetch_all(&state.db)
    .await?;

    // `unfold` turns the receiver into a Stream by re-polling `recv()` each
    // time; a `Lagged` error just means an admin tab fell behind under a
    // burst of signups, so it's skipped rather than ending the stream.
    let live = futures_util::stream::unfold(state.waitlist_tx.subscribe(), |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(entry) => return Some((entry, rx)),
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });

    let events = futures_util::stream::iter(backlog)
        .chain(live)
        .map(|entry| Ok(Event::default().event("entry").json_data(entry).unwrap()));

    Ok(Sse::new(events).keep_alive(KeepAlive::default()))
}

pub async fn count(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM waitlist").fetch_one(&state.db).await?;
    Ok(Json(serde_json::json!({ "count": count })))
}

