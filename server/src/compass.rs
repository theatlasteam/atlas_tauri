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
    "You are Compass, the built-in AI assistant inside Atlas — a modern, end-to-end encrypted chat \
     app for Windows, Linux, and Android. You can see only the messages given to you below, in order; \
     you have no memory of anything outside this specific conversation. Reply directly, concisely, \
     and helpfully, in the same language the conversation is using. Do not mention that you are built \
     on a third-party AI model — you are Compass, part of Atlas."
        .to_string()
}

#[derive(Serialize)]
struct GatewayMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<GatewayMessage>,
    temperature: f32,
    stream: bool,
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
    content: String,
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
    .bind("#7b5ec9")
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
async fn complete(state: &AppState, messages: Vec<GatewayMessage>) -> Result<String, AppError> {
    let Some(api_key) = &state.cfg.compass_api_key else {
        return Err(AppError::BadRequest(
            "Compass isn't configured on this server (no API key set)".into(),
        ));
    };

    let body = ChatCompletionRequest {
        model: state.cfg.compass_model.clone(),
        messages,
        temperature: 0.7,
        stream: false,
    };

    let res = state
        .http
        .post(format!("{}/v1/chat/completions", state.cfg.compass_api_base.trim_end_matches('/')))
        .header("X-Auth-Header", api_key)
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
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| AppError::Internal("compass gateway returned no choices".into()))
}

/// Public entry point for the stateless `/api/compass/complete` proxy — the
/// client supplies the full conversation (its own history, decrypted
/// client-side for a DM, or the local-only Compass chat's own log), the
/// server only adds the system prompt and forwards it. Nothing here is
/// persisted; the request/response exist only for the duration of the call.
pub async fn complete_for_client(
    state: &AppState,
    turns: Vec<(String, String)>,
) -> Result<String, AppError> {
    let mut messages = vec![GatewayMessage { role: "system", content: system_prompt() }];
    for (role, content) in turns {
        let role = match role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(GatewayMessage { role, content });
    }
    complete(state, messages).await
}

#[derive(Deserialize)]
pub struct CompleteTurn {
    role: String,
    content: String,
}

#[derive(Deserialize)]
pub struct CompleteRequest {
    messages: Vec<CompleteTurn>,
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
        if turn.content.len() > 8_000 {
            return Err(AppError::BadRequest("a single message is too long".into()));
        }
    }
    let turns = payload.messages.into_iter().map(|t| (t.role, t.content)).collect();
    let reply = complete_for_client(&state, turns).await?;
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
        if turn.content.len() > 8_000 {
            return Err(AppError::BadRequest("a single message is too long".into()));
        }
    }

    let Some(api_key) = &state.cfg.compass_api_key else {
        return Err(AppError::BadRequest(
            "Compass isn't configured on this server (no API key set)".into(),
        ));
    };

    let mut messages = vec![GatewayMessage { role: "system", content: system_prompt() }];
    for turn in payload.messages {
        let role = match turn.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        messages.push(GatewayMessage { role, content: turn.content });
    }

    let body = ChatCompletionRequest {
        model: state.cfg.compass_model.clone(),
        messages,
        temperature: 0.7,
        stream: true,
    };

    let res = state
        .http
        .post(format!("{}/v1/chat/completions", state.cfg.compass_api_base.trim_end_matches('/')))
        .header("X-Auth-Header", api_key)
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

    let mut messages = vec![GatewayMessage { role: "system", content: system_prompt() }];
    for (author_id, body, name) in rows.into_iter().rev() {
        let text = String::from_utf8_lossy(&body).into_owned();
        if author_id == compass_user_id {
            messages.push(GatewayMessage { role: "assistant", content: text });
        } else {
            messages.push(GatewayMessage { role: "user", content: format!("{name}: {text}") });
        }
    }

    let reply = complete(state, messages).await?;

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
        },
    )
    .await?;
    Ok(())
}
