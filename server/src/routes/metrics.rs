//! First-party, aggregate-only pageview analytics for the marketing site.
//!
//! Privacy shape: the per-tab session token used to correlate a pageview
//! with its later heartbeats (so we can estimate time-on-page) lives only
//! in an in-memory map on this process — it is never written to Postgres,
//! never logged, and is discarded the moment the tab goes quiet. Only
//! rolled-up hourly counts (pageviews, device, referrer host, total
//! duration) land in the database, so storage never grows with traffic
//! volume and nothing here can re-identify a return visitor.

use std::time::{Duration, Instant};

use axum::extract::{Query, State};
use axum::http::{header, HeaderMap};
use axum::Json;
use chrono::{DateTime, Timelike, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};

use crate::error::{ApiResult, AppError};
use crate::state::AppState;

/// How long a tab can go without a heartbeat before its session is
/// considered over and its duration is folded into the hourly aggregate.
const SESSION_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
struct SessionInfo {
    path: String,
    device: &'static str,
    referrer_host: String,
    first_seen: Instant,
    last_seen: Instant,
    bucket: DateTime<Utc>,
}

/// In-memory-only session tracker. Keyed by the random per-tab token the
/// client generates and never persists (see `web/src/lib/analytics.ts`).
pub struct Tracker {
    sessions: DashMap<String, SessionInfo>,
}

impl Tracker {
    pub fn new() -> Self {
        Self { sessions: DashMap::new() }
    }

    /// Sessions that have pinged within the timeout window — used for the
    /// admin "active now" count. Approximate by design: a tab closed
    /// without a final heartbeat stays "active" for up to `SESSION_TIMEOUT`.
    pub fn active_count(&self) -> usize {
        self.sessions.len()
    }
}

/// Periodically evicts sessions that have gone quiet, folding their
/// duration into `metrics_hourly`. Mirrors the stale-call reaper pattern
/// in ws::calls.
pub fn spawn_reaper(state: AppState) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(10));
        loop {
            interval.tick().await;
            reap(&state).await;
        }
    });
}

async fn reap(state: &AppState) {
    let now = Instant::now();
    let stale: Vec<(String, SessionInfo)> = state
        .metrics
        .sessions
        .iter()
        .filter(|entry| now.duration_since(entry.last_seen) > SESSION_TIMEOUT)
        .map(|entry| (entry.key().clone(), entry.value().clone()))
        .collect();

    for (token, info) in stale {
        state.metrics.sessions.remove(&token);
        let duration_secs = info.last_seen.saturating_duration_since(info.first_seen).as_secs() as i64;
        if let Err(err) = sqlx::query(
            "INSERT INTO metrics_hourly
                (bucket_start, path, device, referrer_host, pageviews, total_duration_secs, sessions_with_duration)
             VALUES ($1, $2, $3, $4, 0, $5, 1)
             ON CONFLICT (bucket_start, path, device, referrer_host) DO UPDATE SET
                total_duration_secs = metrics_hourly.total_duration_secs + EXCLUDED.total_duration_secs,
                sessions_with_duration = metrics_hourly.sessions_with_duration + 1",
        )
        .bind(info.bucket)
        .bind(&info.path)
        .bind(info.device)
        .bind(&info.referrer_host)
        .bind(duration_secs)
        .execute(&state.db)
        .await
        {
            tracing::error!(error = %err, "failed to flush metrics session duration");
        }
    }
}

fn hour_bucket(ts: DateTime<Utc>) -> DateTime<Utc> {
    ts.date_naive().and_hms_opt(ts.hour(), 0, 0).unwrap_or_default().and_utc()
}

/// Coarse User-Agent bucketing — substring matching is enough for a "device
/// mix" chart and avoids pulling in a full UA-parsing crate. Order matters:
/// Android UAs also contain "linux", and iPadOS Safari UAs can claim to be
/// "Macintosh", so the more specific checks run first.
fn parse_device(ua: &str) -> &'static str {
    let ua = ua.to_lowercase();
    if ua.contains("iphone") || ua.contains("ipad") || ua.contains("ipod") {
        "iOS"
    } else if ua.contains("android") {
        "Android"
    } else if ua.contains("windows") {
        "Windows"
    } else if ua.contains("mac os x") || ua.contains("macintosh") {
        "macOS"
    } else if ua.contains("linux") {
        "Linux"
    } else {
        "Other"
    }
}

/// Hostname only — never the full referrer URL (which can carry query
/// params/tokens) — so "https://instagram.com/foo?utm=..." becomes
/// "instagram.com" and an empty/same-origin referrer becomes "direct".
fn referrer_host(referrer: &str) -> String {
    let r = referrer.trim();
    if r.is_empty() {
        return "direct".into();
    }
    let without_scheme = r.split("://").nth(1).unwrap_or(r);
    let host = without_scheme.split(['/', '?', '#']).next().unwrap_or(without_scheme);
    let host = host.rsplit('@').next().unwrap_or(host);
    let host = host.split(':').next().unwrap_or(host);
    if host.is_empty() {
        "direct".into()
    } else {
        host.to_lowercase()
    }
}

fn normalize_path(path: &str) -> String {
    let p = path.split(['?', '#']).next().unwrap_or(path);
    let p = if p.is_empty() { "/" } else { p };
    p.chars().take(256).collect()
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum EventKind {
    Pageview,
    Heartbeat,
}

#[derive(Deserialize)]
pub struct EventPayload {
    #[serde(rename = "type")]
    kind: EventKind,
    session: String,
    path: String,
    #[serde(default)]
    referrer: Option<String>,
}

pub async fn event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EventPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    if payload.session.is_empty()
        || payload.session.len() > 128
        || payload.path.is_empty()
        || payload.path.len() > 512
    {
        return Err(AppError::BadRequest("invalid event".into()));
    }

    let now = Instant::now();
    match payload.kind {
        EventKind::Pageview => {
            let ua = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("");
            let device = parse_device(ua);
            let host = referrer_host(payload.referrer.as_deref().unwrap_or(""));
            let path = normalize_path(&payload.path);
            let bucket = hour_bucket(Utc::now());

            state.metrics.sessions.insert(
                payload.session.clone(),
                SessionInfo {
                    path: path.clone(),
                    device,
                    referrer_host: host.clone(),
                    first_seen: now,
                    last_seen: now,
                    bucket,
                },
            );

            sqlx::query(
                "INSERT INTO metrics_hourly
                    (bucket_start, path, device, referrer_host, pageviews, total_duration_secs, sessions_with_duration)
                 VALUES ($1, $2, $3, $4, 1, 0, 0)
                 ON CONFLICT (bucket_start, path, device, referrer_host) DO UPDATE SET
                    pageviews = metrics_hourly.pageviews + 1",
            )
            .bind(bucket)
            .bind(&path)
            .bind(device)
            .bind(&host)
            .execute(&state.db)
            .await?;
        }
        EventKind::Heartbeat => {
            if let Some(mut entry) = state.metrics.sessions.get_mut(&payload.session) {
                entry.last_seen = now;
            }
            // Unknown/expired session token — nothing to update, and not an
            // error: the reaper may have already flushed it.
        }
    }

    Ok(Json(serde_json::json!({ "ok": true })))
}

fn check_admin(state: &AppState, headers: &HeaderMap) -> Result<(), AppError> {
    let Some(expected) = &state.cfg.metrics_admin_token else {
        return Err(AppError::NotFound);
    };
    let got = headers.get("x-admin-token").and_then(|v| v.to_str().ok()).unwrap_or_default();
    if got != expected {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct SummaryQuery {
    #[serde(default = "default_hours")]
    hours: i64,
}
fn default_hours() -> i64 {
    24
}

#[derive(Serialize)]
pub struct HourBucket {
    hour: DateTime<Utc>,
    pageviews: i64,
}
#[derive(Serialize)]
pub struct DeviceCount {
    device: String,
    count: i64,
}
#[derive(Serialize)]
pub struct ReferrerCount {
    host: String,
    count: i64,
}
#[derive(Serialize)]
pub struct PathDuration {
    path: String,
    avg_secs: f64,
}

#[derive(Serialize)]
pub struct Summary {
    hourly: Vec<HourBucket>,
    devices: Vec<DeviceCount>,
    referrers: Vec<ReferrerCount>,
    avg_duration_secs: f64,
    avg_duration_by_path: Vec<PathDuration>,
    active_now: usize,
}

pub async fn summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SummaryQuery>,
) -> ApiResult<Json<Summary>> {
    check_admin(&state, &headers)?;
    let hours = q.hours.clamp(1, 24 * 30);
    let since = Utc::now() - chrono::Duration::hours(hours);

    let hourly = sqlx::query_as::<_, (DateTime<Utc>, Option<i64>)>(
        "SELECT bucket_start, SUM(pageviews) FROM metrics_hourly
         WHERE bucket_start >= $1 GROUP BY bucket_start ORDER BY bucket_start",
    )
    .bind(since)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|(hour, pageviews)| HourBucket { hour, pageviews: pageviews.unwrap_or(0) })
    .collect();

    let devices = sqlx::query_as::<_, (String, Option<i64>)>(
        "SELECT device, SUM(pageviews) FROM metrics_hourly
         WHERE bucket_start >= $1 GROUP BY device ORDER BY 2 DESC NULLS LAST",
    )
    .bind(since)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|(device, count)| DeviceCount { device, count: count.unwrap_or(0) })
    .collect();

    let referrers = sqlx::query_as::<_, (String, Option<i64>)>(
        "SELECT referrer_host, SUM(pageviews) FROM metrics_hourly
         WHERE bucket_start >= $1 GROUP BY referrer_host ORDER BY 2 DESC NULLS LAST LIMIT 20",
    )
    .bind(since)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .map(|(host, count)| ReferrerCount { host, count: count.unwrap_or(0) })
    .collect();

    let (total_dur, total_sessions): (Option<i64>, Option<i64>) = sqlx::query_as(
        "SELECT SUM(total_duration_secs), SUM(sessions_with_duration) FROM metrics_hourly WHERE bucket_start >= $1",
    )
    .bind(since)
    .fetch_one(&state.db)
    .await?;
    let avg_duration_secs = match (total_dur, total_sessions) {
        (Some(d), Some(s)) if s > 0 => d as f64 / s as f64,
        _ => 0.0,
    };

    let avg_duration_by_path = sqlx::query_as::<_, (String, Option<i64>, Option<i64>)>(
        "SELECT path, SUM(total_duration_secs), SUM(sessions_with_duration) FROM metrics_hourly
         WHERE bucket_start >= $1 GROUP BY path",
    )
    .bind(since)
    .fetch_all(&state.db)
    .await?
    .into_iter()
    .filter_map(|(path, d, s)| {
        let (d, s) = (d.unwrap_or(0), s.unwrap_or(0));
        if s == 0 {
            return None;
        }
        Some(PathDuration { path, avg_secs: d as f64 / s as f64 })
    })
    .collect();

    Ok(Json(Summary {
        hourly,
        devices,
        referrers,
        avg_duration_secs,
        avg_duration_by_path,
        active_now: state.metrics.active_count(),
    }))
}
