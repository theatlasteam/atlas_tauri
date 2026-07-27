use std::sync::Arc;

use sqlx::PgPool;
use tokio::sync::broadcast;

use crate::config::Config;
use crate::push::Push;
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
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config) -> Self {
        let push = Arc::new(Push::new(cfg.fcm_service_account.clone()));
        let (waitlist_tx, _) = broadcast::channel(64);
        Self { db, hub: Arc::new(Hub::default()), cfg: Arc::new(cfg), push, waitlist_tx }
    }
}
