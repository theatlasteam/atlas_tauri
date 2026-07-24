use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub session_ttl: Duration,
    /// Shared secret for coturn's `use-auth-secret` (TURN REST API) mode.
    /// Empty => TURN credential endpoint returns STUN-only config.
    pub turn_secret: String,
    /// Comma-separated ICE server URLs handed to clients, e.g.
    /// "stun:turn.example.com:3478,turn:turn.example.com:3478?transport=udp,turns:turn.example.com:443?transport=tcp"
    pub turn_urls: Vec<String>,
    pub turn_ttl: Duration,
    /// `None` => allow any origin (see main.rs). `Some(list)` => only those.
    pub cors_origins: Option<Vec<String>>,
    /// Directory for uploaded attachment blobs (created on demand).
    pub attachments_dir: String,
}

fn var(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.trim().is_empty())
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        Ok(Self {
            bind_addr: var("BIND_ADDR").unwrap_or_else(|| "127.0.0.1:8080".into()),
            database_url: var("DATABASE_URL")
                .ok_or("DATABASE_URL must be set (postgres://user:pass@host/db)")?,
            session_ttl: Duration::from_secs(
                var("SESSION_TTL_DAYS")
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(30)
                    * 24
                    * 3600,
            ),
            turn_secret: var("TURN_SECRET").unwrap_or_default(),
            turn_urls: var("TURN_URLS")
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_else(|| vec!["stun:stun.l.google.com:19302".into()]),
            turn_ttl: Duration::from_secs(
                var("TURN_TTL_SECS").and_then(|v| v.parse().ok()).unwrap_or(3600),
            ),
            // Unset by default: allow any origin. Auth here is a Bearer
            // token attached explicitly by client JS, never a cookie —
            // there's nothing for CORS to protect against a third-party page
            // (it can't read or trigger use of a token it never has), so
            // there's no security reason to enumerate origins, and doing so
            // is exactly what broke a phone's browser reaching this server
            // over LAN by IP (the client's origin is whatever host/port the
            // frontend happens to be served from — LAN IP, tunnel, emulator
            // host alias — which can't be predicted in advance). Set
            // CORS_ORIGINS explicitly to lock this down for a production
            // deployment that only ever talks to known Tauri clients.
            cors_origins: var("CORS_ORIGINS")
                .map(|v| v.split(',').map(|s| s.trim().to_string()).collect()),
            attachments_dir: var("ATTACHMENTS_DIR").unwrap_or_else(|| "./data/attachments".into()),
        })
    }
}
