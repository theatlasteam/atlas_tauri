//! Compass (@compass) — Atlas's built-in AI assistant.
//!
//! Compass is a real row in `users`, seeded once at startup (`ensure_user`) —
//! not a special-cased sender id. It can be searched, DM'd, and be a chat
//! member exactly like anyone else; the client-side chat UI needs no changes
//! to display its messages.
//!
//! Two entirely different paths reach it, because the server's ability to
//! read a message depends on where it came from:
//!
//!  * **Group chats** are already server-visible plaintext (`scheme =
//!    'plain'`) by design — nothing about them is E2EE. So when a group
//!    message arrives with `compass_mentioned = true`, the server itself
//!    gathers recent history, calls the inference gateway, and posts the
//!    reply — see `respond_in_group`, wired from
//!    `routes::messages::persist_and_fanout`.
//!  * **DMs are always end-to-end encrypted** when the platform supports
//!    it — the server only ever holds ciphertext it cannot read, mention or
//!    no mention. So for a DM, `compass_mentioned = true` is just metadata
//!    the client already computed from plaintext it has and the server
//!    doesn't; the *client* decrypts its own history, calls
//!    `POST /api/compass/complete` itself, and hands the finished reply to
//!    `POST /api/chats/{id}/compass-reply` to have the server post it under
//!    Compass's identity. The server never sees the DM's plaintext at any
//!    point — see routes::messages::compass_reply.
//!
//! Neither path stores anything about the AI exchange beyond the messages
//! themselves (identical to any other message row); the actual
//! request/response content is never logged and lives only as long as the
//! HTTP call to the inference gateway takes.

use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::Json;
use futures_util::{Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use uuid::Uuid;

use crate::auth::{hash_password, AuthUser};
use crate::error::{ApiResult, AppError};
use crate::routes::messages::{persist_and_fanout, NewMessage};
use crate::state::AppState;

pub const HANDLE: &str = "compass";

/// How many recent plain-text messages a group's history includes as
/// context. Bounded mainly so one very long-lived chat doesn't balloon
/// every request's token count forever.
const HISTORY_LIMIT: i64 = 30;

/// Shared by every path that reaches the gateway (group auto-reply, a DM
/// mention's client-side call, and the standalone Compass chat) — deliberately
/// generic about *how* it was reached, since the transcript that follows
/// already establishes that context on its own.
fn system_prompt() -> String {
    concat!(
        "You are Compass, the built-in AI assistant inside Atlas — a modern, end-to-end encrypted chat ",
        "app for Windows, Linux, and Android. You can see only the messages given to you below, in order; ",
        "you have no memory of anything outside this specific conversation. Reply directly, concisely, ",
        "and helpfully, in the same language the conversation is using. Do not mention that you are built ",
        "on a third-party AI model — you are Compass, part of Atlas.\n\n",
        "You can make shareable Spaces: tiny HTML apps that open in a sandboxed webview. ",
        "When the user asks for a mini-app, game, tool, landing page, widget, or visual UI, ",
        "output a short intro then ONE fenced block:\n",
        "```space title=\"Short name\"\n",
        "<!DOCTYPE html> ... complete document ...\n",
        "```\n",
        "Space UI rules:\n",
        "- One self-contained HTML file. Inline <style> and <script> only. No external JS/CSS/fonts except https images if needed.\n",
        "- Viewport meta, box-sizing border-box, system-ui / ui-rounded / Nunito-like rounded sans.\n",
        "- Light: bg #f7f5f1, surface #fff, ink #201c16, muted #6b6459, accent #c9772e. Dark: prefer color-scheme and prefers-color-scheme.\n",
        "- Pills not sharp rectangles: buttons border-radius 999px, cards 16–24px, 8px gaps, plenty of padding.\n",
        "- Large tap targets (min 44px). Works at 360px wide. No horizontal scroll.\n",
        "- No tracking, no fetch/XHR to random hosts, no iframes, no document.cookie.\n",
        "- Interactive things must work with only inline JS.\n",
        "- Put a real <title>. The fence title attribute is the Space's name in Atlas.\n",
        "If they did not ask for a Space, do not emit a space fence.",
    )
    .to_string()
}

#[derive(Serialize, Clone)]
struct GatewayMessage {
    role: &'static str,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<GatewayToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

impl GatewayMessage {
    fn plain(role: &'static str, content: String) -> Self {
        Self { role, content, tool_calls: None, tool_call_id: None, name: None }
    }
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<GatewayMessage>,
    temperature: f32,
    stream: bool,
    /// High ceiling so the gateway does not apply a tiny default (Spaces
    /// were getting cut off mid-file). Not a small cap.
    max_tokens: u32,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChoiceMessage,
}

#[derive(Deserialize)]
struct ChoiceMessage {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<GatewayToolCall>>,
}

/// One function call the model wants executed. Mirrors the OpenAI
/// `tool_calls` shape so any OpenAI-compatible gateway works.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GatewayToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: GatewayFunctionCall,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GatewayFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize, Clone)]
struct GatewayToolDef {
    #[serde(rename = "type")]
    kind: &'static str,
    function: GatewayFunctionDef,
}

#[derive(Serialize, Clone)]
struct GatewayFunctionDef {
    name: &'static str,
    description: &'static str,
    parameters: serde_json::Value,
}

/// The model's turn in a tool loop: either plain text, or text plus a list of
/// calls it wants the sandbox to execute before it continues.
#[derive(Debug)]
pub struct AgentTurn {
    pub content: String,
    pub tool_calls: Vec<GatewayToolCall>,
}

/// Ensure the Compass account exists; returns its user id either way.
/// Idempotent — safe to call on every startup.
pub async fn ensure_user(db: &sqlx::PgPool) -> Result<Uuid, AppError> {
    if let Some(id) = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE handle = $1")
        .bind(HANDLE)
        .fetch_optional(db)
        .await?
    {
        return Ok(id);
    }

    // Nobody can ever log in as Compass through the normal auth flow — the
    // password is thrown away immediately after hashing — but it still goes
    // through the real hasher rather than a placeholder string, so nothing
    // downstream (login's PasswordHash::new, say) ever chokes on a
    // malformed value if this row is ever queried the same way a human's is.
    use base64::Engine;
    use rand::RngCore;
    let mut random = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let throwaway_password = base64::engine::general_purpose::STANDARD.encode(random);
    let password_hash = hash_password(throwaway_password).await?;

    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, handle, name, bio, avatar_color, avatar_initial, password_hash, verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (handle) DO NOTHING",
    )
    .bind(id)
    .bind(HANDLE)
    .bind("Compass")
    .bind("Atlas's built-in AI assistant. Tag @compass in a group chat, or start a chat with me directly.")
    .bind("#5B6CFF")
    .bind("C")
    .bind(&password_hash)
    .bind(true)
    .execute(db)
    .await?;

    // Someone else's concurrent startup may have won the race above (ON
    // CONFLICT DO NOTHING) — re-select rather than trust the id we just
    // generated, which wouldn't be the row that actually exists.
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE handle = $1")
        .bind(HANDLE)
        .fetch_one(db)
        .await
        .map_err(AppError::from)
}

/// One call to the configured inference gateway. Shared by the group
/// auto-reply path and the `/api/compass/complete` proxy the client calls
/// for DMs and the separate local-only Compass chat.
const ALLOWED_MODELS: &[&str] = &[
    "glm-5.3-flash",
    "kimi-k2.7-code",
    "deepseek-v4-pro",
    "qwen3.6-35b",
];

fn resolve_model(state: &AppState, requested: Option<&str>) -> String {
    if let Some(m) = requested {
        if ALLOWED_MODELS.iter().any(|allowed| *allowed == m) {
            return m.to_string();
        }
    }
    state.cfg.compass_model.clone()
}

async fn complete(
    state: &AppState,
    messages: Vec<GatewayMessage>,
    model: Option<&str>,
) -> Result<String, AppError> {
    let Some(api_key) = &state.cfg.compass_api_key else {
        return Err(AppError::BadRequest(
            "Compass isn't configured on this server (no API key set)".into(),
        ));
    };

    let body = ChatCompletionRequest {
        model: resolve_model(state, model),
        messages,
        temperature: 0.7,
        stream: false,
        max_tokens: 65_536,
    };

    let res = state
        .http
        .post(format!("{}/v1/chat/completions", state.cfg.compass_api_base))
        .timeout(std::time::Duration::from_secs(600))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("compass gateway request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %text, "compass gateway returned an error");
        return Err(AppError::Internal("Compass couldn't come up with a reply just now.".into()));
    }

    let parsed: ChatCompletionResponse = res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("compass gateway response unparseable: {e}")))?;
    let msg = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message)
        .ok_or_else(|| AppError::Internal("compass gateway returned no choices".into()))?;
    Ok(msg.content.unwrap_or_default())
}

/// Tool-free completion for shared Mind-room turns: Minds talk to each other
/// there as personas, without touching tools — tool use happens in agent jobs
/// (manual runs and schedule ticks), which go through `complete_agent_turn`.
/// Also used for nothing else; Compass chat and group replies have their own
/// paths with the full Compass system prompt.
pub(crate) async fn complete_sandboxed(
    state: &AppState,
    system: String,
    turns: Vec<(String, String)>,
) -> Result<String, AppError> {
    let mut messages = vec![GatewayMessage::plain(
        "system",
        format!(
            "{system}\n\nThis is a conversation turn, not a job: reply in plain text only, \
             no tool calls, no markdown fences named space. Keep replies under 800 words."
        ),
    )];
    for (role, content) in turns {
        let role = match role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(GatewayMessage::plain(role, content));
    }
    let mut reply = complete(state, messages, None).await?;
    if let Some(i) = reply.find("```space") {
        reply.truncate(i);
    }
    if reply.chars().count() > 4000 {
        reply = reply.chars().take(4000).collect();
    }
    Ok(reply.trim().to_string())
}

/// The three tools a Mind may call. The descriptions are written for the
/// model, not for docs: each one states when to reach for it and what comes
/// back, because a tool the model doesn't understand is a tool it won't use.
fn mind_tool_defs() -> Vec<GatewayToolDef> {
    vec![
        GatewayToolDef {
            kind: "function",
            function: GatewayFunctionDef {
                name: "web_fetch",
                description: "Read a web page. Use for anything that changes: prices, listings, docs, news. Returns the page text, truncated.",
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": { "url": { "type": "string", "description": "https URL to read" } },
                    "required": ["url"],
                }),
            },
        },
        GatewayToolDef {
            kind: "function",
            function: GatewayFunctionDef {
                name: "shell",
                description: "Run a shell command in your private sandbox directory. Files persist between runs — use them for state like the last price seen. Returns stdout plus stderr.",
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": { "command": { "type": "string", "description": "shell command, e.g. \"cat last_price.txt\"" } },
                    "required": ["command"],
                }),
            },
        },
        GatewayToolDef {
            kind: "function",
            function: GatewayFunctionDef {
                name: "browser",
                description: "Open and browse a webpage using a custom human-mimicking browser engine. Bypasses bot protections, executes realistic navigation headers, and extracts clear text and listing data.",
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string", "description": "The URL to visit" },
                        "wait_seconds": { "type": "integer", "description": "Optional seconds to wait/delay (1 to 10) to mimic reading" }
                    },
                    "required": ["url"],
                }),
            },
        },
        GatewayToolDef {
            kind: "function",
            function: GatewayFunctionDef {
                name: "set_schedule",
                description: "Create or update a recurring schedule for yourself (e.g. check a website every morning). You will automatically wake up and run when this schedule fires.",
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "label": { "type": "string", "description": "Human label, e.g. 'Daily price check'" },
                        "cron_expr": { "type": "string", "description": "Standard 5-field cron expression, e.g. '0 9 * * *' (every day at 9am UTC) or '0 */6 * * *' (every 6 hours)" },
                        "task": { "type": "string", "description": "The specific task instructions you will execute when the schedule triggers" }
                    },
                    "required": ["label", "cron_expr", "task"],
                }),
            },
        },
        GatewayToolDef {
            kind: "function",
            function: GatewayFunctionDef {
                name: "message_owner",
                description: "Send your owner a message. This is how findings reach them — end runs that found something worth knowing with one call.",
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": { "text": { "type": "string", "description": "message to your owner, short: finding first, evidence after" } },
                    "required": ["text"],
                }),
            },
        },
    ]
}

/// One model turn inside an agent job, with the Mind's tool allowlist applied:
/// tools the owner disabled are not offered at all, so the model plans around
/// what it actually has instead of calling something that will be refused.
pub(crate) async fn complete_agent_turn(
    state: &AppState,
    messages: Vec<AgentMessage>,
    allowed_tools: &[&str],
) -> Result<AgentTurn, AppError> {
    let Some(api_key) = &state.cfg.compass_api_key else {
        return Err(AppError::BadRequest(
            "Compass isn't configured on this server (no API key set)".into(),
        ));
    };

    let tools: Vec<GatewayToolDef> = mind_tool_defs()
        .into_iter()
        .filter(|t| allowed_tools.contains(&t.function.name))
        .collect();

    #[derive(Serialize)]
    struct AgentRequest {
        model: String,
        messages: Vec<GatewayMessage>,
        temperature: f32,
        stream: bool,
        max_tokens: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        tools: Option<Vec<GatewayToolDef>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_choice: Option<&'static str>,
    }

    let body = AgentRequest {
        model: state.cfg.compass_model.clone(),
        messages: messages.into_iter().map(GatewayMessage::from).collect(),
        temperature: 0.7,
        stream: false,
        max_tokens: 65_536,
        tool_choice: if tools.is_empty() { None } else { Some("auto") },
        tools: if tools.is_empty() { None } else { Some(tools) },
    };

    let res = state
        .http
        .post(format!("{}/v1/chat/completions", state.cfg.compass_api_base))
        .timeout(std::time::Duration::from_secs(600))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("compass gateway request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %text, "compass gateway returned an error");
        return Err(AppError::Internal("Compass couldn't come up with a reply just now.".into()));
    }

    let parsed: ChatCompletionResponse = res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("compass gateway response unparseable: {e}")))?;
    let msg = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message)
        .ok_or_else(|| AppError::Internal("compass gateway returned no choices".into()))?;
    Ok(AgentTurn {
        content: msg.content.unwrap_or_default(),
        tool_calls: msg.tool_calls.unwrap_or_default(),
    })
}

/// A message in the agent loop. Tool results come back as `tool` role messages
/// pointing at the call id they answer, which is what lets the model match
/// results to calls when it made several at once.
#[derive(Clone)]
pub enum AgentMessage {
    System(String),
    User(String),
    Assistant { content: String, tool_calls: Vec<GatewayToolCall> },
    Tool { call_id: String, name: String, output: String },
}

impl From<AgentMessage> for GatewayMessage {
    fn from(m: AgentMessage) -> Self {
        match m {
            AgentMessage::System(content) => GatewayMessage::plain("system", content),
            AgentMessage::User(content) => GatewayMessage::plain("user", content),
            AgentMessage::Assistant { content, tool_calls } => GatewayMessage {
                role: "assistant",
                content,
                tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
                tool_call_id: None,
                name: None,
            },
            AgentMessage::Tool { call_id, name, output } => GatewayMessage {
                role: "tool",
                content: output,
                tool_calls: None,
                tool_call_id: Some(call_id),
                name: Some(name),
            },
        }
    }
}

/// Result of an autonomous multi-turn agent run
pub struct AutonomousAgentResult {
    pub output: String,
    pub tool_calls_log: Vec<serde_json::Value>,
    pub status: String,
    pub error: String,
}

/// Executes an autonomous multi-turn agent loop for a Mind.
/// Keeps running tool turns until the model outputs a final answer or reaches max turns limit.
pub async fn run_autonomous_agent(
    state: &AppState,
    mind_id: Uuid,
    owner_id: Uuid,
    mind_name: &str,
    system_prompt: String,
    task_input: String,
    allowed_tools: &[&str],
) -> AutonomousAgentResult {
    let mut messages = vec![
        AgentMessage::System(system_prompt),
        AgentMessage::User(task_input),
    ];
    let mut tool_calls_log: Vec<serde_json::Value> = Vec::new();
    let max_turns = 10;
    let mut final_content = String::new();

    for _turn_idx in 0..max_turns {
        let turn = match complete_agent_turn(state, messages.clone(), allowed_tools).await {
            Ok(t) => t,
            Err(e) => {
                return AutonomousAgentResult {
                    output: final_content,
                    tool_calls_log,
                    status: "error".into(),
                    error: e.to_string(),
                };
            }
        };

        let has_tools = !turn.tool_calls.is_empty();
        let content = turn.content.clone();
        if !content.trim().is_empty() {
            final_content = content.clone();
        }

        messages.push(AgentMessage::Assistant {
            content: turn.content.clone(),
            tool_calls: turn.tool_calls.clone(),
        });

        if !has_tools {
            // Model finished turn without any further tool calls
            break;
        }

        // Execute tool calls requested by the model
        for tool_call in turn.tool_calls {
            let fn_name = &tool_call.function.name;
            let args_raw = &tool_call.function.arguments;
            let args_parsed: serde_json::Value = serde_json::from_str(args_raw).unwrap_or_default();

            let tool_output = match fn_name.as_str() {
                "browser" => {
                    let url = args_parsed.get("url").and_then(|v| v.as_str()).unwrap_or_default();
                    let wait = args_parsed.get("wait_seconds").and_then(|v| v.as_u64());
                    crate::minds_sandbox::browser_fetch(state, url, wait).await
                }
                "web_fetch" => {
                    let url = args_parsed.get("url").and_then(|v| v.as_str()).unwrap_or_default();
                    crate::minds_sandbox::fetch_url(state, url).await
                }
                "shell" => {
                    let cmd = args_parsed.get("command").and_then(|v| v.as_str()).unwrap_or_default();
                    crate::minds_sandbox::exec_shell(state, owner_id, cmd).await
                }
                "message_owner" => {
                    let text = args_parsed.get("text").and_then(|v| v.as_str()).unwrap_or_default();
                    match crate::minds_sandbox::send_owner_message(state, mind_id, owner_id, mind_name, text).await {
                        Ok(_) => "Message delivered to your owner via Atlas.".to_string(),
                        Err(e) => format!("Failed to deliver message: {e}"),
                    }
                }
                "set_schedule" => {
                    let label = args_parsed.get("label").and_then(|v| v.as_str()).unwrap_or("Scheduled Task");
                    let cron = args_parsed.get("cron_expr").and_then(|v| v.as_str()).unwrap_or("");
                    let task = args_parsed.get("task").and_then(|v| v.as_str()).unwrap_or("");

                    if cron.split_whitespace().count() == 5 {
                        let sched_id = Uuid::new_v4();
                        let res = sqlx::query(
                            "INSERT INTO mind_schedules (id, mind_id, label, cron_expr, tz, task) VALUES ($1,$2,$3,$4,'UTC',$5)",
                        )
                        .bind(sched_id)
                        .bind(mind_id)
                        .bind(label)
                        .bind(cron)
                        .bind(task)
                        .execute(&state.db)
                        .await;

                        match res {
                            Ok(_) => format!("Schedule '{label}' created successfully with cron '{cron}'."),
                            Err(e) => format!("Database error saving schedule: {e}"),
                        }
                    } else {
                        "error: cron expression must have exactly 5 fields, e.g. '0 9 * * *'".to_string()
                    }
                }
                unknown => format!("error: unknown tool '{unknown}'"),
            };

            tool_calls_log.push(serde_json::json!({
                "name": fn_name,
                "arguments": args_parsed,
                "output": tool_output
            }));

            messages.push(AgentMessage::Tool {
                call_id: tool_call.id,
                name: tool_call.function.name,
                output: tool_output,
            });
        }
    }

    AutonomousAgentResult {
        output: final_content,
        tool_calls_log,
        status: "ok".into(),
        error: String::new(),
    }
}

async fn complete_for_client_with_model(
    state: &AppState,
    turns: Vec<(String, String)>,
    model: Option<&str>,
) -> Result<String, AppError> {
    let mut messages = vec![GatewayMessage::plain("system", system_prompt())];
    for (role, content) in turns {
        let role = match role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(GatewayMessage::plain(role, content));
    }
    complete(state, messages, model).await
}

#[derive(Deserialize)]
pub struct CompleteTurn {
    role: String,
    content: String,
}

#[derive(Deserialize)]
pub struct CompleteRequest {
    messages: Vec<CompleteTurn>,
    model: Option<String>,
}

#[derive(Serialize)]
pub struct CompleteResponse {
    reply: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoResponse {
    user_id: Uuid,
}

/// `GET /api/compass/info` — lets the client resolve Compass's real user id
/// once (it's generated at server startup, not a fixed constant either side
/// can hardcode) so it can tell "was this message from Compass?" apart from
/// any other author when building a transcript for the gateway.
pub async fn info_route(State(state): State<AppState>, _auth: AuthUser) -> ApiResult<Json<InfoResponse>> {
    Ok(Json(InfoResponse { user_id: state.compass_user_id }))
}

/// `POST /api/compass/complete` — stateless proxy to the inference gateway.
/// Used by the client for: a DM's @compass mention (it decrypts its own
/// history, calls this, then POSTs the result to `compass_reply` above), and
/// the separate local-only Compass chat (see the client's compassChat
/// store) whose history the server never sees persisted anywhere at all —
/// only this one request/response, per turn, never written to disk here.
pub async fn complete_route(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(payload): Json<CompleteRequest>,
) -> ApiResult<Json<CompleteResponse>> {
    if payload.messages.is_empty() || payload.messages.len() > 60 {
        return Err(AppError::BadRequest("messages must be 1..=60 turns".into()));
    }
    for turn in &payload.messages {
        if turn.content.len() > 100_000 {
            return Err(AppError::BadRequest("a single message is too long".into()));
        }
    }
    let model = payload.model.clone();
    let turns = payload.messages.into_iter().map(|t| (t.role, t.content)).collect();
    let reply = complete_for_client_with_model(&state, turns, model.as_deref()).await?;
    Ok(Json(CompleteResponse { reply }))
}

#[derive(Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(Deserialize, Default)]
struct StreamDelta {
    content: Option<String>,
}

/// Turns the gateway's raw `text/event-stream` bytes into a stream of plain
/// text deltas — the client just appends each one, no OpenAI framing to
/// parse on that side. Buffers across chunk boundaries since a `data: ...`
/// line can arrive split across multiple TCP reads.
fn sse_from_gateway(
    byte_stream: impl Stream<Item = reqwest::Result<bytes::Bytes>> + Unpin + Send + 'static,
) -> impl Stream<Item = Result<Event, Infallible>> {
    struct ScanState<S> {
        stream: S,
        buf: String,
    }
    futures_util::stream::unfold(ScanState { stream: byte_stream, buf: String::new() }, |mut st| async move {
        loop {
            if let Some(pos) = st.buf.find("\n\n") {
                let block = st.buf[..pos].to_string();
                st.buf.drain(..=pos + 1);
                for line in block.lines() {
                    let Some(data) = line.trim().strip_prefix("data:") else { continue };
                    let data = data.trim();
                    if data == "[DONE]" {
                        return None;
                    }
                    if let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) {
                        if let Some(content) =
                            chunk.choices.into_iter().next().and_then(|c| c.delta.content)
                        {
                            if !content.is_empty() {
                                return Some((Ok(Event::default().data(content)), st));
                            }
                        }
                    }
                }
                continue;
            }
            match st.stream.next().await {
                Some(Ok(bytes)) => {
                    st.buf.push_str(&String::from_utf8_lossy(&bytes));
                }
                Some(Err(_)) | None => return None,
            }
        }
    })
}

/// `POST /api/compass/complete/stream` — same inputs as `complete_route`,
/// but streams the reply as it's generated instead of waiting for the whole
/// thing. Used by the local-only Compass chat so a reply appears
/// incrementally rather than as one long pause.
pub async fn complete_stream_route(
    State(state): State<AppState>,
    _auth: AuthUser,
    Json(payload): Json<CompleteRequest>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    if payload.messages.is_empty() || payload.messages.len() > 60 {
        return Err(AppError::BadRequest("messages must be 1..=60 turns".into()));
    }
    for turn in &payload.messages {
        if turn.content.len() > 100_000 {
            return Err(AppError::BadRequest("a single message is too long".into()));
        }
    }

    let Some(api_key) = &state.cfg.compass_api_key else {
        return Err(AppError::BadRequest(
            "Compass isn't configured on this server (no API key set)".into(),
        ));
    };

    let mut messages = vec![GatewayMessage::plain("system", system_prompt())];
    for turn in payload.messages {
        let role = match turn.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(GatewayMessage::plain(role, turn.content));
    }

    let body = ChatCompletionRequest {
        model: resolve_model(&state, payload.model.as_deref()),
        messages,
        temperature: 0.7,
        stream: true,
        max_tokens: 65_536,
    };

    let res = state
        .http
        .post(format!("{}/v1/chat/completions", state.cfg.compass_api_base))
        .timeout(std::time::Duration::from_secs(600))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("compass gateway request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %text, "compass gateway returned an error");
        return Err(AppError::Internal("Compass couldn't come up with a reply just now.".into()));
    }

    Ok(Sse::new(sse_from_gateway(res.bytes_stream())).keep_alive(KeepAlive::default()))
}

/// A group message mentioned @compass and the server can read it (it's
/// plaintext already) — gather recent history itself and post a reply
/// under Compass's identity, via the same write path a human's message
/// takes. Fire-and-forget: called from inside persist_and_fanout right
/// after the triggering message's own fan-out, so it must never block or
/// fail that request.
pub fn respond_in_group(state: AppState, chat_id: Uuid, compass_user_id: Uuid) {
    tokio::spawn(async move {
        if let Err(e) = try_respond_in_group(&state, chat_id, compass_user_id).await {
            tracing::warn!(error = %e, %chat_id, "compass group reply failed");
        }
    });
}

/// "A separate user that joins the chat" — Compass isn't a member of a chat
/// until it's actually mentioned there, group or DM. Idempotent.
pub async fn ensure_member(state: &AppState, chat_id: Uuid) -> Result<(), AppError> {
    sqlx::query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
        .bind(chat_id)
        .bind(state.compass_user_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

async fn try_respond_in_group(
    state: &AppState,
    chat_id: Uuid,
    compass_user_id: Uuid,
) -> Result<(), AppError> {
    ensure_member(state, chat_id).await?;

    let rows: Vec<(Uuid, Vec<u8>, String)> = sqlx::query_as(
        "SELECT m.author_id, m.body, u.name FROM messages m
         JOIN users u ON u.id = m.author_id
         WHERE m.chat_id = $1 AND m.scheme = 'plain' AND m.deleted_at IS NULL
         ORDER BY m.id DESC LIMIT $2",
    )
    .bind(chat_id)
    .bind(HISTORY_LIMIT)
    .fetch_all(&state.db)
    .await?;

    let mut messages = vec![GatewayMessage::plain("system", system_prompt())];
    for (author_id, body, name) in rows.into_iter().rev() {
        let text = String::from_utf8_lossy(&body).into_owned();
        if author_id == compass_user_id {
            messages.push(GatewayMessage::plain("assistant", text));
        } else {
            messages.push(GatewayMessage::plain("user", format!("{name}: {text}")));
        }
    }

    let reply = complete(state, messages, None).await?;

    persist_and_fanout(
        state,
        compass_user_id,
        chat_id,
        NewMessage {
            scheme: "plain",
            body: &reply,
            client_tag: None,
            reply_to_id: None,
            attachment_id: None,
            unlock_at: None,
            mentions_compass: false, // its own reply must never re-trigger itself
            buttons: None,
        },
    )
    .await?;
    Ok(())
}
