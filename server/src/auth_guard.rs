//! Auth abuse guard: per-IP/per-handle rate limits, device+IP
//! fingerprinting, and a 0–100 risk score that caps mass account creation.
//!
//! Privacy: IPs, device fingerprints and user-agents are never stored raw —
//! only SHA-256 hashes (see migration 0027 + privacy policy §2). Rate-limit
//! buckets are in-memory only and die with the process.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::http::HeaderMap;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::error::AppError;

// ---------- hashing / IP ----------

/// SHA-256 hex of a sensitive signal. Empty input -> empty string (means
/// "signal absent", which itself feeds the risk score).
pub fn blind_hash(s: &str) -> String {
    let s = s.trim();
    if s.is_empty() {
        return String::new();
    }
    hex_encode(Sha256::digest(s.as_bytes()))
}

fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    bytes.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

/// Best-effort client IP: first X-Forwarded-For entry (site proxy), then
/// X-Real-IP, else "unknown". Abuse mitigation, not a security boundary.
pub fn client_ip(headers: &HeaderMap) -> String {
    for key in ["x-forwarded-for", "x-real-ip"] {
        if let Some(v) = headers.get(key).and_then(|v| v.to_str().ok()) {
            let first = v.split(',').next().unwrap_or("").trim().to_lowercase();
            if !first.is_empty() {
                return first;
            }
        }
    }
    "unknown".into()
}

fn ua_hash(headers: &HeaderMap) -> String {
    let ua = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    blind_hash(ua)
}

// ---------- in-memory sliding-window limiter ----------

fn buckets() -> &'static Mutex<HashMap<String, Vec<Instant>>> {
    static B: OnceLock<Mutex<HashMap<String, Vec<Instant>>>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hit(key: &str, max: usize, window: Duration) -> Result<(), AppError> {
    let now = Instant::now();
    let mut map = buckets()
        .lock()
        .map_err(|_| AppError::Internal("rate limiter poisoned".into()))?;
    if map.len() > 20_000 {
        map.retain(|_, v| v.iter().any(|t| now.duration_since(*t) < window));
    }
    let entry = map.entry(key.to_string()).or_default();
    entry.retain(|t| now.duration_since(*t) < window);
    if entry.len() >= max {
        return Err(AppError::TooManyRequests(
            "too many attempts — try again later".into(),
        ));
    }
    entry.push(now);
    Ok(())
}

/// Pre-DB brute-force shields. Register is the tightest (account creation is
/// the abused surface); login is looser per IP but also capped per handle so
/// one account can't be password-sprayed from many IPs.
pub fn limit_check_handle(ip: &str) -> Result<(), AppError> {
    hit(&format!("ch:{ip}"), 60, Duration::from_secs(60))
}

pub fn limit_register(ip: &str) -> Result<(), AppError> {
    hit(&format!("reg:{ip}"), 5, Duration::from_secs(3600))
}

pub fn limit_login_ip(ip: &str) -> Result<(), AppError> {
    hit(&format!("li:{ip}"), 30, Duration::from_secs(600))
}

pub fn limit_login_handle(handle: &str) -> Result<(), AppError> {
    hit(&format!("lh:{handle}"), 10, Duration::from_secs(600))
}

// ---------- risk score ----------

/// Tunables (env-overridable): how many accounts one network/device may spawn.
fn env_usize(key: &str, fallback: i64) -> i64 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(fallback)
}

pub struct Signals {
    pub ip: String,
    pub device_fp: String,
    pub headers: HeaderMap,
}

pub struct Risk {
    pub score: u8,
    #[allow(dead_code)]
    pub reasons: Vec<&'static str>,
    pub ip_hash: String,
    pub device_fp_hash: String,
    pub ua_hash: String,
}

/// Scores 0–100 from DB-backed sybil signals + request traits:
/// +30 per account from this IP in 24h, +25 per account from this device in
/// 30d, +20 missing device fingerprint, +15 rapid succession (<10 min since
/// the last signup from this IP), +10 unknown/proxyless IP.
/// Blocks when caps are exceeded OR score >= 80.
pub async fn assess_signup(db: &PgPool, sig: &Signals) -> Result<Risk, AppError> {
    let ip_hash = blind_hash(&sig.ip);
    let device_fp_hash = blind_hash(&sig.device_fp);
    let ua = ua_hash(&sig.headers);

    let max_ip_24h = env_usize("MAX_ACCOUNTS_PER_IP_24H", 3);
    let max_device_30d = env_usize("MAX_ACCOUNTS_PER_DEVICE_30D", 3);

    let ip_24h: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM account_fingerprints WHERE ip_hash = $1 AND created_at > now() - interval '24 hours'",
    )
    .bind(&ip_hash)
    .fetch_one(db)
    .await?;
    let device_n: i64 = if device_fp_hash.is_empty() {
        0
    } else {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM account_fingerprints WHERE device_fp_hash = $1 AND created_at > now() - interval '30 days'",
        )
        .bind(&device_fp_hash)
        .fetch_one(db)
        .await?
    };
    let last_secs: Option<f64> = sqlx::query_scalar(
        "SELECT EXTRACT(EPOCH FROM (now() - MAX(created_at))) FROM account_fingerprints WHERE ip_hash = $1",
    )
    .bind(&ip_hash)
    .fetch_one(db)
    .await?;

    let mut score: i64 = 0;
    let mut reasons = Vec::new();
    if ip_24h > 0 {
        score += 30 * ip_24h.min(3);
        reasons.push("multiple accounts from this network in 24h");
    }
    if device_n > 0 {
        score += 25 * device_n.min(3);
        reasons.push("multiple accounts on this device");
    }
    if device_fp_hash.is_empty() {
        score += 20;
        reasons.push("no device fingerprint");
    }
    if matches!(last_secs, Some(s) if s < 600.0) {
        score += 15;
        reasons.push("accounts created in rapid succession");
    }
    if sig.ip == "unknown" {
        score += 10;
        reasons.push("unidentifiable network");
    }
    let score = score.min(100) as u8;

    if ip_24h >= max_ip_24h || (!device_fp_hash.is_empty() && device_n >= max_device_30d) || score >= 80 {
        tracing::warn!(
            ip_24h,
            device_n,
            score,
            "signup blocked: sybil cap or risk threshold"
        );
        return Err(AppError::TooManyRequests(
            "account creation limit reached for this device or network — try again later".into(),
        ));
    }

    Ok(Risk { score, reasons, ip_hash, device_fp_hash, ua_hash: ua })
}

/// Persist the fingerprint row after a successful insert. Best-effort would
/// hide a broken migration, so errors propagate (registration fails closed).
pub async fn record_signup(
    db: &PgPool,
    user_id: uuid::Uuid,
    risk: &Risk,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO account_fingerprints (user_id, ip_hash, device_fp_hash, user_agent_hash, risk_score)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(user_id)
    .bind(&risk.ip_hash)
    .bind(&risk.device_fp_hash)
    .bind(&risk.ua_hash)
    .bind(i32::from(risk.score))
    .execute(db)
    .await?;
    Ok(())
}

/// Failed-login trail feeding the persistent brute-force view. Fire-and-forget
/// by callers (never blocks a response).
pub async fn record_failure(db: &PgPool, handle: &str, ip: &str) {
    let _ = sqlx::query("INSERT INTO auth_failures (handle, ip_hash) VALUES ($1, $2)")
        .bind(handle.trim().to_lowercase())
        .bind(blind_hash(ip))
        .execute(db)
        .await;
}
