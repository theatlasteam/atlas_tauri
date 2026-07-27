mod auth;
mod config;
mod error;
mod models;
mod push;
mod routes;
mod state;
mod ws;

use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post, put};
use axum::{Json, Router};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "atlas_server=info,tower_http=info".into()),
        )
        .init();

    let cfg = Config::from_env().map_err(std::io::Error::other)?;

    let db = PgPoolOptions::new()
        .max_connections(20)
        .connect(&cfg.database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    tracing::info!("database ready, migrations applied");

    let allow_origin = match &cfg.cors_origins {
        Some(origins) => AllowOrigin::list(origins.iter().filter_map(|o| o.parse::<HeaderValue>().ok())),
        None => AllowOrigin::any(),
    };
    let cors = CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::PUT, Method::DELETE])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    let bind_addr = cfg.bind_addr.clone();
    let state = AppState::new(db, cfg);

    // Collects call state that no socket can clean up (see the doc comment) —
    // without it a leaked entry makes a user permanently "busy".
    ws::calls::spawn_stale_call_reaper(state.clone());

    let app = Router::new()
        .route("/api/health", get(health))
        // auth & sessions
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/sessions", get(auth::list_sessions))
        .route("/api/sessions/{id}", delete(auth::revoke_session))
        // users
        .route("/api/me", get(routes::users::get_me).patch(routes::users::update_me))
        .route(
            "/api/me/avatar",
            post(routes::users::set_avatar).delete(routes::users::remove_avatar),
        )
        .route("/api/users", get(routes::users::search_users))
        .route("/api/users/{id}", get(routes::users::get_user))
        .route("/api/users/{id}/avatar", get(routes::users::get_avatar))
        .route("/api/users/{id}/verified", patch(routes::users::set_verified))
        // Atlas-only: full user list backing the verification screen. Kept off
        // /api/users so it can't be confused with the public search endpoint.
        .route("/api/admin/users", get(routes::users::list_all_users))
        // Push notification device tokens (FCM).
        .route("/api/devices", post(routes::devices::register_device))
        .route("/api/devices/{token}", delete(routes::devices::unregister_device))
        // Declining from the Android call notification, which has no socket.
        .route("/api/calls/{id}/decline", post(routes::calls::decline_call))
        .route("/api/blocks", get(routes::users::list_blocks).post(routes::users::block_user))
        .route("/api/blocks/{id}", delete(routes::users::unblock_user))
        // chats & messages
        .route("/api/chats", get(routes::chats::list_chats).post(routes::chats::create_chat))
        .route("/api/chats/{id}", get(routes::chats::get_chat))
        .route("/api/chats/{id}/mute", post(routes::chats::set_muted))
        .route(
            "/api/chats/{id}/messages",
            get(routes::messages::list_messages).post(routes::messages::send_message),
        )
        .route("/api/chats/{id}/read", post(routes::messages::mark_read))
        .route("/api/messages/search", get(routes::messages::search_messages))
        // Single message fetch — the Android push payload carries ids only, so
        // the notification service pulls the body from here to decrypt it.
        .route(
            "/api/messages/{id}",
            get(routes::messages::get_message)
                .patch(routes::messages::edit_message)
                .delete(routes::messages::delete_message),
        )
        .route("/api/messages/{id}/reactions", post(routes::messages::add_reaction))
        .route(
            "/api/messages/{id}/reactions/{emoji}",
            delete(routes::messages::remove_reaction),
        )
        // attachments (raw-bytes upload; own body limit)
        .route(
            "/api/attachments",
            post(routes::attachments::upload).layer(DefaultBodyLimit::max(
                routes::attachments::MAX_ATTACHMENT_BYTES + 1024,
            )),
        )
        .route("/api/attachments/{id}", get(routes::attachments::download))
        // folders
        .route(
            "/api/folders",
            get(routes::folders::list_folders).post(routes::folders::create_folder),
        )
        .route("/api/folders/{id}", delete(routes::folders::delete_folder))
        .route(
            "/api/folders/{folder_id}/chats/{chat_id}",
            put(routes::folders::add_chat_to_folder)
                .delete(routes::folders::remove_chat_from_folder),
        )
        // E2EE key distribution
        .route("/api/keys/identity", post(routes::keys::publish_identity))
        .route("/api/keys/identity/reset", post(routes::keys::reset_identity))
        .route("/api/keys/identity/{user_id}", get(routes::keys::get_identity))
        .route("/api/keys/packages", post(routes::keys::upload_packages))
        .route("/api/keys/packages/count", get(routes::keys::package_count))
        .route("/api/keys/packages/{user_id}/claim", post(routes::keys::claim_package))
        // calls
        .route("/api/calls/ice-servers", get(routes::turn::ice_servers))
        // waitlist (marketing site signup + live admin view)
        .route("/api/waitlist", get(routes::waitlist::list).post(routes::waitlist::join))
        .route("/api/waitlist/count", get(routes::waitlist::count))
        .route("/api/waitlist/stream", get(routes::waitlist::stream))
        // realtime
        .route("/ws", get(ws::ws_handler))
        // Everything the routes above didn't match. `/api/*` and `/ws` are
        // unaffected by this — they're matched before the fallback ever
        // runs — so this only decides what a browser sees when it visits
        // the bare domain.
        .fallback(static_or_api_only)
        .layer(DefaultBodyLimit::max(512 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!(addr = %bind_addr, "atlas-server listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

/// Serves the built `web/` site (Vite `dist`) for anything no route above
/// matched — with unknown paths falling back to `index.html`, since the site
/// is a client-routed SPA and e.g. a deep link needs that same document as
/// `/` — *unless* the request's `Host` is `cfg.api_only_hostname`, in which
/// case this is a bare backend and there's no site to serve.
async fn static_or_api_only(State(state): State<AppState>, req: Request) -> Response {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .map(|h| h.split(':').next().unwrap_or(h).to_lowercase());

    let is_api_only = match (&state.cfg.api_only_hostname, &host) {
        (Some(configured), Some(actual)) => configured == actual,
        _ => false,
    };

    let Some(dir) = &state.cfg.static_dir else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if is_api_only {
        return StatusCode::NOT_FOUND.into_response();
    }

    let index = ServeFile::new(format!("{dir}/index.html"));
    let serve_dir = ServeDir::new(dir).fallback(index);
    match serve_dir.oneshot(req).await {
        Ok(resp) => resp.map(Body::new).into_response(),
        Err(err) => match err {},
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            sig.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received");
}
