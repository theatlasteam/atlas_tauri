use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Config;
use crate::push::Push;
use crate::ws::hub::Hub;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub hub: Arc<Hub>,
    pub cfg: Arc<Config>,
    pub push: Arc<Push>,
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config) -> Self {
        let push = Arc::new(Push::new(cfg.fcm_service_account.clone()));
        Self { db, hub: Arc::new(Hub::default()), cfg: Arc::new(cfg), push }
    }
}
