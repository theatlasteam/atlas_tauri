mod ai_proxy;
mod auth;
mod broadcast;
mod compass;
mod config;
mod error;
mod mcp;
mod minds_sandbox;
mod minds_worker;
mod models;
mod push;
mod routes;
mod state;
mod ws;

use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::{header, HeaderName, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, delete, get, patch, post, put};
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

    let compass_user_id = compass::ensure_user(&db).await?;
    let official = broadcast::ensure(&db, &cfg.attachments_dir).await?;

    let allow_origin = match &cfg.cors_origins {
        Some(origins) => AllowOrigin::list(origins.iter().filter_map(|o| o.parse::<HeaderValue>().ok())),
        None => AllowOrigin::any(),
    };
    let cors = CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static("mcp-session-id"),
            HeaderName::from_static("last-event-id"),
            HeaderName::from_static("mcp-protocol-version"),
        ]);

    let bind_addr = cfg.bind_addr.clone();
    let state = AppState::new(db, cfg, compass_user_id, official.user_id, official.chat_id);

    // Collects call state that no socket can clean up (see the doc comment) —
    // without it a leaked entry makes a user permanently "busy".
    ws::calls::spawn_stale_call_reaper(state.clone());
    routes::metrics::spawn_reaper(state.clone());
    minds_worker::spawn_worker(state.clone());

    let app = Router::new()
        .merge(mcp::router(state.clone()))
        .route("/api/health", get(health))
        .route("/api/version", get(version))
        // auth & sessions
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/check-handle", post(auth::check_handle))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/delete-account", delete(auth::delete_account))
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
        .route("/api/admin/broadcast", post(broadcast::post_broadcast))
        .route(
            "/api/admin/broadcast/image",
            post(broadcast::upload_image).layer(DefaultBodyLimit::max(
                routes::attachments::MAX_ATTACHMENT_BYTES + 1024,
            )),
        )
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
        .route("/api/chats/{id}/members", get(routes::chats::list_members))
        .route("/api/chats/{id}/mute", post(routes::chats::set_muted))
        .route("/api/chats/{id}/history", delete(routes::chats::clear_history))
        .route("/api/chats/{id}/callback", post(routes::bots::chat_callback))
        .route(
            "/api/chats/{id}/messages",
            get(routes::messages::list_messages).post(routes::messages::send_message),
        )
        .route("/api/chats/{id}/read", post(routes::messages::mark_read))
        .route("/api/chats/{id}/compass-reply", post(routes::messages::compass_reply))
        .route("/api/compass/complete", post(compass::complete_route))
        .route("/api/compass/complete/stream", post(compass::complete_stream_route))
        .route("/api/compass/info", get(compass::info_route))
        .route("/api/bots", get(routes::bots::list_mine).post(routes::bots::create))
        .route(
            "/api/bots/{id}",
            patch(routes::bots::update).delete(routes::bots::delete),
        )
        .route("/api/bots/{id}/token", post(routes::bots::rotate_token))
        .route("/api/bot/messages", post(routes::bots::bot_send))
        .route("/api/bot/updates", get(routes::bots::bot_updates))
        .route("/api/spaces", post(routes::spaces::create))
        .route("/api/spaces/{id}", get(routes::spaces::get))
        .route("/api/spaces/{id}/public", get(routes::spaces::get_public))
        .route("/s/{id}", get(routes::spaces::share_page))
        // Custom API surface for the Inference Gateway — reachable at
        // ai.atlasmsg.app once that hostname is pointed at this server.
        .route("/v1/{*path}", any(ai_proxy::proxy))
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
        .route(
            "/api/emoji",
            get(routes::emoji::list).post(routes::emoji::upload).layer(DefaultBodyLimit::max(
                routes::emoji::MAX_EMOJI_BYTES + 1024,
            )),
        )
        .route("/api/emoji/packs/{owner_id}", post(routes::emoji::save_pack))
        .route("/api/emoji/{id}/meta", get(routes::emoji::meta))
        .route("/api/emoji/{id}", get(routes::emoji::download).delete(routes::emoji::delete))
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
        .route("/api/keys/bundle", post(routes::keys::publish_bundle))
        .route("/api/keys/bundle/reset", post(routes::keys::reset_bundle))
        .route("/api/keys/bundle/{user_id}", get(routes::keys::get_bundle))
        .route("/api/keys/packages", post(routes::keys::upload_packages))
        .route("/api/keys/packages/count", get(routes::keys::package_count))
        .route("/api/keys/packages/{user_id}/claim", post(routes::keys::claim_package))
        // calls
        .route("/api/calls/ice-servers", get(routes::turn::ice_servers))
        // waitlist (marketing site signup + live admin view)
        .route("/api/waitlist", get(routes::waitlist::list).post(routes::waitlist::join))
        .route("/api/waitlist/count", get(routes::waitlist::count))
        .route("/api/waitlist/stream", get(routes::waitlist::stream))
        // analytics (anonymous, aggregate-only pageview/time-on-page stats
        // for the marketing site, plus an admin summary view)
        .route("/api/metrics/event", post(routes::metrics::event))
        .route("/api/metrics/summary", get(routes::metrics::summary))
        // Doccy, the blog Q&A Mind: anonymous like the readers, narrow by
        // design (allowlisted slugs, length caps, per-IP rate limit).
        .route("/api/blog/ask", post(routes::doccy::ask))
        // plugin store (see routes/plugins.rs). `/mine` is registered before
        // `/api/plugins/{id}` so the literal segment wins over the param.
        .route("/api/plugins", get(routes::plugins::list).post(routes::plugins::create))
        .route("/api/plugins/mine", get(routes::plugins::list_mine))
        .route(
            "/api/plugins/{id}",
            get(routes::plugins::get).put(routes::plugins::update).delete(routes::plugins::delete),
        )
        .route("/api/plugins/{id}/install", post(routes::plugins::install))
        .route(
            "/api/plugins/{id}/icon",
            post(routes::plugins::upload_icon).layer(DefaultBodyLimit::max(
                routes::plugins::MAX_ICON_BYTES + 1024,
            )),
        )
        .route("/api/plugins/assets/{id}", get(routes::plugins::get_icon))
        // realtime
        .route("/ws", get(ws::ws_handler))
        .route("/ws/canvas/{id}", get(ws::canvas::ws_handler))
        .route("/api/minds", get(routes::minds::list_minds).post(routes::minds::create_mind))
        .route("/api/minds/access", get(routes::minds::access))
        .route("/api/minds/{id}", patch(routes::minds::update_mind).delete(routes::minds::delete_mind))
        .route("/api/minds/rooms", get(routes::minds::list_rooms).post(routes::minds::create_room))
        .route("/api/minds/rooms/{id}", get(routes::minds::get_room).delete(routes::minds::delete_room))
        .route("/api/minds/rooms/{id}/messages", get(routes::minds::room_messages).post(routes::minds::room_turn))
        .route("/api/minds/{id}/run", post(routes::minds::run_mind))
        .route("/api/minds/{id}/run/stream", post(routes::minds::run_mind_stream))
        .route("/api/minds/{id}/runs", get(routes::minds::list_runs))
        .route("/api/minds/{id}/schedules", get(routes::minds::list_schedules).post(routes::minds::create_schedule))
        .route("/api/minds/{id}/schedules/{schedule_id}", patch(routes::minds::toggle_schedule).delete(routes::minds::delete_schedule))
        .route("/api/canvas", post(routes::canvas::create))
        .route("/api/canvas/{id}", get(routes::canvas::get))
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

/// Public build facts: the answer to "what's the latest Atlas version".
/// Minds fetch this instead of guessing GitHub repos or scraping download
/// links (see mind_system_prompt); monitoring can poll it too.
async fn version() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "app": "atlas",
        "version": env!("CARGO_PKG_VERSION"),
        "repo": "theatlasteam/atlas_tauri",
        "site": "https://atlasmsg.app",
        "pwa": "https://atlasmsg.app/app",
    }))
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

    let path = req.uri().path();
    // The messenger PWA lives at /app. Client-side routes (/app/chat/…,
    // /app/settings, …) must still get app/index.html — not the marketing
    // site's index.html, which is the default SPA fallback below.
    if path == "/app" || path == "/app/" || path.starts_with("/app/") {
        // Existing files (hashed JS/CSS under /assets, /app/manifest, …)
        // are served as usual; unknown /app/* routes get the PWA shell.
        let serve_dir = ServeDir::new(dir).fallback(ServeFile::new(format!("{dir}/app/index.html")));
        return match serve_dir.oneshot(req).await {
            Ok(resp) => resp.map(Body::new).into_response(),
            Err(err) => match err {},
        };
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
