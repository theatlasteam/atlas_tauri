use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Config;
use crate::ws::hub::Hub;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub hub: Arc<Hub>,
    pub cfg: Arc<Config>,
}

impl AppState {
    pub fn new(db: PgPool, cfg: Config) -> Self {
        Self { db, hub: Arc::new(Hub::default()), cfg: Arc::new(cfg) }
    }
}
