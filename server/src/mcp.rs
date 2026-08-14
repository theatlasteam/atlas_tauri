//! MCP server for the Atlas plugin store — lets AI assistants develop
//! plugins. Served over the streamable HTTP transport at `/mcp`.
//!
//! Tools:
//!   list_plugins        browse the store (public)
//!   get_plugin          fetch a plugin + its files (public)
//!   validate_plugin     validate a workspace without saving (public)
//!   create_plugin       publish a new plugin (needs an Atlas session token)
//!   update_plugin       edit a published plugin (token + ownership)
//!   delete_plugin       remove a plugin (token + ownership)
//!   read_docs           the plugin SDK reference (markdown)

use std::collections::BTreeMap;

use rmcp::{
    ErrorData as McpError, RoleServer, ServerHandler,
    handler::server::{
        router::tool::ToolRouter,
        wrapper::Parameters,
    },
    model::*,
    schemars, tool, tool_handler, tool_router,
    service::RequestContext,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use serde_json::json;

use crate::auth::authenticate;
use crate::error::AppError;
use crate::routes::plugins::{validate_files, PluginDto, PluginPayload};
use crate::state::AppState;

// ---------- auth helpers ----------

/// Pull a Bearer token from the request's Authorization header (the way MCP
/// clients like opencode attach credentials), if present.
fn token_from_headers(ctx: &RequestContext<RoleServer>) -> Option<String> {
    ctx.extensions
        .get::<axum::http::request::Parts>()
        .and_then(|parts| parts.headers.get(axum::http::header::AUTHORIZATION))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// Resolve the acting developer: prefer the Authorization header, fall back
/// to the `token` tool argument (for clients that pass it per call).
async fn authed_user(
    state: &AppState,
    ctx: &RequestContext<RoleServer>,
    token_arg: Option<String>,
) -> Result<uuid::Uuid, McpError> {
    let token = token_from_headers(ctx)
        .or(token_arg)
        .ok_or_else(|| McpError::invalid_params("this tool needs an Atlas session token", None))?;
    match authenticate(&state.db, &token).await {
        Ok(auth) => Ok(auth.user_id),
        Err(_) => Err(McpError::invalid_request("invalid or expired token", None)),
    }
}

fn tool_error(msg: impl Into<String>) -> McpError {
    McpError::internal_error(msg.into(), None)
}

fn plugin_summary(p: &PluginDto) -> serde_json::Value {
    json!({
        "id": p.id,
        "pluginId": p.plugin_id,
        "name": p.name,
        "version": p.version,
        "description": p.description,
        "author": p.author,
        "downloads": p.downloads,
    })
}

/// Expose a `PluginDto` to a tool result: a pretty text summary plus the
/// full structured object (files included).
fn dto_result(p: PluginDto) -> CallToolResult {
    let files = json!(&p.files);
    let structured = json!({
        "id": p.id,
        "pluginId": p.plugin_id,
        "name": p.name,
        "version": p.version,
        "description": p.description,
        "author": p.author,
        "downloads": p.downloads,
        "files": files,
    });
    CallToolResult::success(vec![
        ContentBlock::text(serde_json::to_string_pretty(&structured).unwrap_or_default()),
        ContentBlock::json(structured).unwrap_or_else(|_| ContentBlock::text("{}")),
    ])
}

// ---------- handler ----------

#[derive(Clone)]
pub(crate) struct PluginMcpServer {
    state: AppState,
    // Held for the #[tool_router] generated constructor; the macro-generated
    // ServerHandler routes tools without reading it directly.
    #[allow(dead_code)]
    tool_router: ToolRouter<PluginMcpServer>,
}

#[tool_router]
impl PluginMcpServer {
    pub(crate) fn new(state: AppState) -> Self {
        Self {
            state,
            tool_router: Self::tool_router(),
        }
    }

    // ---------- tools ----------

    #[tool(description = "List plugins in the store (public).")]
    async fn list_plugins(
        &self,
        Parameters(_p): Parameters<ListPluginsParams>,
    ) -> Result<CallToolResult, McpError> {
        let res = crate::routes::plugins::list(axum::extract::State(self.state.clone()))
            .await
            .map_err(|e: AppError| tool_error(e.to_string()))?;
        let plugins: Vec<serde_json::Value> = res.0.iter().map(plugin_summary).collect();
        Ok(CallToolResult::success(vec![
            ContentBlock::text(serde_json::to_string_pretty(&plugins).unwrap_or_default()),
        ]))
    }

    #[tool(description = "Fetch a plugin from the store, including its source files.")]
    async fn get_plugin(
        &self,
        Parameters(p): Parameters<GetPluginParams>,
    ) -> Result<CallToolResult, McpError> {
        let id = uuid::Uuid::parse_str(&p.id).ok();
        let row = if let Some(id) = id {
            crate::routes::plugins::get(
                axum::extract::State(self.state.clone()),
                axum::extract::Path(id),
            )
            .await
        } else {
            let res = crate::routes::plugins::list(axum::extract::State(self.state.clone()))
                .await
                .map_err(|e: AppError| tool_error(e.to_string()))?;
            res.0
                .into_iter()
                .find(|x| x.plugin_id == p.id)
                .map(|x| Ok(axum::Json(x)))
                .unwrap_or(Err(AppError::NotFound))
        };

        match row {
            Ok(dto) => Ok(dto_result(dto.0)),
            Err(_) => Ok(CallToolResult::error(vec![ContentBlock::text(format!(
                "no plugin found for id '{}'",
                p.id
            ))])),
        }
    }

    #[tool(description = "Validate a plugin workspace without saving it. Returns \
        the resolved manifest fields or the validation errors.")]
    async fn validate_plugin(
        &self,
        Parameters(p): Parameters<ValidatePluginParams>,
    ) -> Result<CallToolResult, McpError> {
        match validate_files(&p.files) {
            Ok(meta) => Ok(CallToolResult::success(vec![ContentBlock::json(json!({
                "ok": true,
                "id": meta.id,
                "name": meta.name,
                "version": meta.version,
            }))
            .unwrap_or_else(|_| ContentBlock::text("valid"))])),
            Err(e) => Ok(CallToolResult::error(vec![ContentBlock::text(e.to_string())])),
        }
    }

    #[tool(description = "Publish a new plugin to the store. The plugin is tied to \
        the Atlas account whose session token is passed in.")]
    async fn create_plugin(
        &self,
        ctx: RequestContext<RoleServer>,
        Parameters(p): Parameters<CreatePluginParams>,
    ) -> Result<CallToolResult, McpError> {
        let uid = authed_user(&self.state, &ctx, p.token).await?;
        validate_files(&p.files).map_err(|e| McpError::invalid_params(e.to_string(), None))?;

        let payload = PluginPayload { files: p.files };
        let created = crate::routes::plugins::create(
            axum::extract::State(self.state.clone()),
            crate::auth::AuthUser { user_id: uid, session_id: uuid::Uuid::new_v4() },
            axum::Json(payload),
        )
        .await
        .map_err(|e| tool_error(e.to_string()))?;
        Ok(dto_result(created.0))
    }

    #[tool(description = "Update a published plugin's files. The manifest id must \
        stay the same, and the token must belong to the plugin's developer.")]
    async fn update_plugin(
        &self,
        ctx: RequestContext<RoleServer>,
        Parameters(p): Parameters<UpdatePluginParams>,
    ) -> Result<CallToolResult, McpError> {
        let uid = authed_user(&self.state, &ctx, p.token).await?;
        let id = uuid::Uuid::parse_str(&p.id)
            .map_err(|_| McpError::invalid_params("id must be a UUID", None))?;
        validate_files(&p.files).map_err(|e| McpError::invalid_params(e.to_string(), None))?;

        let payload = PluginPayload { files: p.files };
        let updated = crate::routes::plugins::update(
            axum::extract::State(self.state.clone()),
            crate::auth::AuthUser { user_id: uid, session_id: uuid::Uuid::new_v4() },
            axum::extract::Path(id),
            axum::Json(payload),
        )
        .await
        .map_err(|e| tool_error(e.to_string()))?;
        Ok(dto_result(updated.0))
    }

    #[tool(description = "Delete a plugin from the store. Requires the developer's token.")]
    async fn delete_plugin(
        &self,
        ctx: RequestContext<RoleServer>,
        Parameters(p): Parameters<DeletePluginParams>,
    ) -> Result<CallToolResult, McpError> {
        let uid = authed_user(&self.state, &ctx, p.token).await?;
        let id = uuid::Uuid::parse_str(&p.id)
            .map_err(|_| McpError::invalid_params("id must be a UUID", None))?;
        let _ = crate::routes::plugins::delete(
            axum::extract::State(self.state.clone()),
            crate::auth::AuthUser { user_id: uid, session_id: uuid::Uuid::new_v4() },
            axum::extract::Path(id),
        )
        .await
        .map_err(|e| tool_error(e.to_string()))?;
        Ok(CallToolResult::success(vec![ContentBlock::text("deleted")]))
    }

    #[tool(description = "The full Atlas plugin SDK reference (manifest schema, \
        permissions, API, TSX modules, UI slots, config screens).")]
    async fn read_docs(
        &self,
        Parameters(_p): Parameters<ReadDocsParams>,
    ) -> Result<CallToolResult, McpError> {
        // Serve the same reference the marketing site exposes.
        let from = |base: &str| format!("{base}/plugindocs.md");
        let docs = self
            .state
            .cfg
            .static_dir
            .as_ref()
            .map(|d| std::fs::read_to_string(from(d)).ok())
            .flatten()
            .or_else(|| std::fs::read_to_string(from("web/dist")).ok())
            .or_else(|| std::fs::read_to_string("web/dist/plugindocs.md").ok())
            .unwrap_or_else(|| {
                "Plugin SDK reference: see https://atlasmsg.app/plugindocs.md".to_string()
            });
        Ok(CallToolResult::success(vec![ContentBlock::text(docs)]))
    }
}

#[tool_handler(
    name = "atlas-plugins",
    version = "0.1.0",
    instructions = "Tools for developing plugins for the Atlas messenger. \
        Write files as a map of path -> source (manifest.json + src/... .tsx). \
        Validate before publishing; create/update/delete need an Atlas session \
        token passed as the `token` argument."
)]
impl ServerHandler for PluginMcpServer {}

// ---------- tool params ----------

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ListPluginsParams {}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct GetPluginParams {
    /// The store id (UUID) or pluginId of the plugin.
    id: String,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ValidatePluginParams {
    /// Plugin workspace: filename -> source (manifest.json + entry + helpers).
    files: BTreeMap<String, String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct CreatePluginParams {
    /// Plugin workspace: filename -> source (manifest.json + entry + helpers).
    files: BTreeMap<String, String>,
    /// Atlas session token (optional if you send `Authorization: Bearer <token>`
    /// as a request header).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct UpdatePluginParams {
    /// Store id (UUID) of the plugin to edit.
    id: String,
    /// Plugin workspace: filename -> source (manifest.json + entry + helpers).
    files: BTreeMap<String, String>,
    /// Atlas session token (optional if you send `Authorization: Bearer <token>`
    /// as a request header).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct DeletePluginParams {
    /// Store id (UUID) of the plugin to delete.
    id: String,
    /// Atlas session token (optional if you send `Authorization: Bearer <token>`
    /// as a request header).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
struct ReadDocsParams {}

// ---------- wiring ----------

/// Build the axum router for the MCP endpoint (mounted at /mcp).
pub(crate) fn router(state: AppState) -> axum::Router<AppState> {
    let service = StreamableHttpService::new(
        move || Ok(PluginMcpServer::new(state.clone())),
        LocalSessionManager::default().into(),
        StreamableHttpServerConfig::default(),
    );
    axum::Router::new().nest_service("/mcp", service)
}
