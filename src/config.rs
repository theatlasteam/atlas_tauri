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
    /// Fixed username/credential for a third-party TURN provider (a free
    /// public demo relay, or a paid service) that doesn't speak coturn's
    /// `use-auth-secret` HMAC scheme. Takes priority over `turn_secret` when
    /// both are set — there's no reason to want both at once. Static
    /// credentials shipped in every client are the reason `turn_secret`'s
    /// scheme exists at all (see turn.rs), but a fixed pair from a provider
    /// that already expects to be embedded in clients is exactly what it's
    /// for, and needing a whole self-hosted coturn just to place a first
    /// working call is a real adoption cliff.
    pub turn_static_username: Option<String>,
    pub turn_static_credential: Option<String>,
    /// `None` => allow any origin (see main.rs). `Some(list)` => only those.
    pub cors_origins: Option<Vec<String>>,
    /// Directory for uploaded attachment blobs (created on demand).
    pub attachments_dir: String,
    /// Firebase service account used to send Android pushes. `None` => push is
    /// disabled and every notification is a no-op (see push.rs).
    pub fcm_service_account: Option<crate::push::ServiceAccount>,
    /// Directory containing the built `web/` site (Vite `dist`). `None` =>
    /// static file serving is disabled, e.g. when the frontend is run
    /// separately in dev via `vite`.
    pub static_dir: Option<String>,
    /// Bearer token gating the waitlist admin endpoints (`GET /api/waitlist`
    /// and the live SSE stream). Waitlist emails are sensitive enough that
    /// these can't be left open like the rest of the CORS-permissive API.
    pub waitlist_admin_token: Option<String>,
    /// Hostname (from the request's `Host` header, no port) that gets the
    /// API only — no static site fallback. Lets the same binary serve the
    /// marketing site on the apex domain and act as a bare backend on a
    /// subdomain (e.g. `s.atlasmsg.app`) without a second deployment. `/api/*`
    /// and `/ws` routes are unaffected either way; this only changes what
    /// happens on paths nothing else matched.
    pub api_only_hostname: Option<String>,
    /// Base URL for the Compass (@compass) AI assistant's inference gateway.
    /// The server never hardcodes the real upstream provider — it always
    /// calls whatever's configured here, so the actual provider (and even
    /// whether one is even reachable) stays swappable without a code change.
    pub compass_api_base: String,
    /// Sent as `X-Auth-Header` to the inference gateway. `None` => Compass
    /// replies are disabled (mentioning it does nothing) rather than the
    /// server making unauthenticated requests that will just fail.
    pub compass_api_key: Option<String>,
    pub compass_model: String,
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
            turn_static_username: var("TURN_STATIC_USERNAME"),
            turn_static_credential: var("TURN_STATIC_CREDENTIAL"),
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
            // Raw JSON or base64 of the service-account key file. A malformed
            // value is fatal rather than ignored: silently booting with push
            // disabled is how a deployment spends a week wondering why
            // notifications never arrive.
            fcm_service_account: match var("FCM_SERVICE_ACCOUNT") {
                Some(raw) => Some(
                    crate::push::ServiceAccount::parse(&raw)
                        .map_err(|e| format!("FCM_SERVICE_ACCOUNT is set but unusable: {e}"))?,
                ),
                None => None,
            },
            static_dir: var("STATIC_DIR").or_else(|| {
                std::path::Path::new("./web-dist").is_dir().then(|| "./web-dist".to_string())
            }),
            waitlist_admin_token: var("WAITLIST_ADMIN_TOKEN"),
            api_only_hostname: var("API_ONLY_HOSTNAME").map(|h| h.to_lowercase()),
            compass_api_base: var("COMPASS_API_BASE")
                .unwrap_or_else(|| "https://ai.atlasmsg.app".into()),
            compass_api_key: var("COMPASS_API_KEY"),
            compass_model: var("COMPASS_MODEL").unwrap_or_else(|| "gpt-5".into()),
        })
    }
}
