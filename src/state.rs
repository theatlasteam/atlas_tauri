use std::sync::Arc;

use sqlx::PgPool;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::config::Config;
use crate::push::Push;
use crate::routes::metrics::Tracker;
use crate::routes::waitlist::WaitlistEntry;
use crate::ws::hub::Hub;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub hub: Arc<Hub>,
    pub cfg: Arc<Config>,
    pub push: Arc<Push>,
    /// Fans out new waitlist signups to any open admin SSE stream. Lossy by
    /// design (a lagging admin tab misses old entries, not new ones) — see
    /// routes::waitlist.
    pub waitlist_tx: broadcast::Sender<WaitlistEntry>,
    /// In-memory-only pageview session tracker (see routes::metrics) — never
    /// persisted beyond the current session's duration calculation.
    pub metrics: Arc<Tracker>,
    /// Reused across outbound calls to the Compass inference gateway
    /// (connection pooling) — see compass.rs.
    pub http: reqwest::Client,
    /// Compass's real `users.id`, resolved once at startup (compass::ensure_user)
    /// so every request doesn't re-query it by handle.
    pub compass_user_id: Uuid,
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config, compass_user_id: Uuid) -> Self {
        let push = Arc::new(Push::new(cfg.fcm_service_account.clone()));
        let (waitlist_tx, _) = broadcast::channel(64);
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        Self {
            db,
            hub: Arc::new(Hub::default()),
            cfg: Arc::new(cfg),
            push,
            waitlist_tx,
            metrics: Arc::new(Tracker::new()),
            http,
            compass_user_id,
        }
    }
}
