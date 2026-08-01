//! Atlas Spaces — small, self-contained HTML mini-apps a user generates by
//! prompting an AI, shares as a message in a chat, and that anyone who can
//! see the message can open or remix.
//!
//! Each Space is one complete HTML document (inline `<style>`/`<script>`, no
//! separate assets, no build step) stored verbatim in Postgres. The client
//! renders it in a sandboxed `<iframe sandbox="allow-scripts" srcdoc=...>` —
//! *that* sandbox is the real security boundary. The system prompt below
//! asks the model not to write code that tries to escape it, but a prompt is
//! not a security control, so the boundary still has to hold even if the
//! model ignores every word of it.
//!
//! Generation reuses Compass's inference gateway wiring (same `state.http`,
//! same `ai_proxy::UPSTREAM_BASE` + `COMPASS_API_KEY`) with a different model
//! (`SPACES_MODEL`, default GLM-5.1) — see compass.rs for the sibling
//! implementation this one deliberately mirrors.

use axum::extract::{Path, State};
use axum::Json;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::SpaceDto;
use crate::state::AppState;

/// Prompts are short instructions, not documents — this is generous for
/// "build me a tip calculator" while still bounding gateway request size.
const MAX_PROMPT_CHARS: usize = 4_000;
/// A generated app is expected to be small (a single HTML file with inline
/// CSS/JS); this is generous headroom over anything a reasonable mini-app
/// needs while still bounding what gets stored and shipped to a sandboxed
/// iframe on every viewer's device.
const MAX_HTML_CHARS: usize = 300_000;

fn system_prompt() -> String {
    "You generate Atlas Spaces: small, self-contained, shareable mini-apps for the Atlas chat app. \
     Output ONLY a single complete HTML document — starting with <!DOCTYPE html> or <html>, ending \
     with </html> — and nothing else. No markdown code fences, no backticks, no explanation, no \
     commentary before or after the document. Inline all CSS in a <style> tag and all JavaScript in \
     a <script> tag; never reference an external stylesheet, script file, or build step — the whole \
     app must be this one file.\n\n\
     The document will be rendered inside a sandboxed iframe on another person's device \
     (sandbox=\"allow-scripts\", deliberately without allow-same-origin, allow-top-navigation, or \
     allow-popups) — the sandbox is the real security boundary, but do not write code that tries to \
     work around it anyway: do not attempt to break out of the iframe, do not reference or probe \
     window.top/window.parent or the page that embeds you, do not attempt top-level navigation or \
     open popups/new windows, and do not make network requests (fetch/XHR/WebSocket/beacons/image \
     pings) to any third-party domain — if the app needs data, generate or compute it inline instead. \
     Do not include tracking, analytics, or anything that phones home."
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

/// A model that mostly follows instructions still occasionally wraps its
/// answer in a ```html ... ``` fence out of habit — strip one if present
/// rather than storing/serving the fence markers as part of the "HTML".
fn strip_markdown_fence(raw: &str) -> String {
    let trimmed = raw.trim();
    let Some(after_open) = trimmed.strip_prefix("```") else {
        return trimmed.to_string();
    };
    // Drop an optional language tag ("html", "HTML", ...) on the fence's
    // opening line.
    let after_open = match after_open.find('\n') {
        Some(nl) => &after_open[nl + 1..],
        None => after_open,
    };
    match after_open.rfind("```") {
        Some(close) => after_open[..close].trim().to_string(),
        None => after_open.trim().to_string(),
    }
}

/// One call to the configured inference gateway, using the Spaces model.
async fn generate_html(
    state: &AppState,
    prompt: &str,
    parent_html: Option<&str>,
) -> Result<String, AppError> {
    let Some(api_key) = &state.cfg.compass_api_key else {
        return Err(AppError::BadRequest(
            "Atlas Spaces isn't configured on this server (no inference gateway key set)".into(),
        ));
    };

    let user_content = match parent_html {
        Some(html) => format!(
            "You are remixing an existing Atlas Space. Its current complete HTML follows between the \
             markers below. Apply the instruction after it and output the complete new HTML document \
             (not a diff, not just the changed part).\n\n\
             ===BEGIN EXISTING SPACE HTML===\n{html}\n===END EXISTING SPACE HTML===\n\n\
             Instruction: {prompt}"
        ),
        None => prompt.to_string(),
    };

    let body = ChatCompletionRequest {
        model: state.cfg.spaces_model.clone(),
        messages: vec![
            GatewayMessage { role: "system", content: system_prompt() },
            GatewayMessage { role: "user", content: user_content },
        ],
        temperature: 0.7,
        stream: false,
    };

    let res = state
        .http
        .post(format!("{}/v1/chat/completions", crate::ai_proxy::UPSTREAM_BASE))
        .header("X-Auth-Header", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("spaces gateway request failed: {e}")))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        tracing::warn!(%status, body = %text, "spaces gateway returned an error");
        return Err(AppError::Internal("Couldn't generate that Space just now.".into()));
    }

    let parsed: ChatCompletionResponse = res
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("spaces gateway response unparseable: {e}")))?;
    let raw = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| AppError::Internal("spaces gateway returned no choices".into()))?;

    let html = strip_markdown_fence(&raw);
    if html.is_empty() || !html.contains('<') {
        return Err(AppError::Internal("the model didn't return HTML".into()));
    }
    if html.chars().count() > MAX_HTML_CHARS {
        return Err(AppError::BadRequest("generated Space is too large".into()));
    }
    Ok(html)
}

/// Load a Space, but only if the caller is allowed to see it: they created
/// it, or it's been shared into a chat they're a member of (a 'space'
/// message pointing at it). Mirrors attachments::download's authorization
/// shape. NotFound either way — whether a given id exists isn't something an
/// unauthorized caller needs confirmed.
async fn authorized_space(state: &AppState, user_id: Uuid, id: Uuid) -> Result<SpaceDto, AppError> {
    let row: Option<SpaceDto> = sqlx::query_as(
        "SELECT id, creator_id, parent_space_id, html, created_at FROM spaces s
         WHERE s.id = $1 AND (
            s.creator_id = $2
            OR EXISTS (
                SELECT 1 FROM messages m
                JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $2
                WHERE m.scheme = 'space' AND m.deleted_at IS NULL
                  AND convert_from(m.body, 'UTF8')::jsonb ->> 'spaceId' = $1::text
            )
         )",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;
    row.ok_or(AppError::NotFound)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePayload {
    prompt: String,
    /// Present for a remix: the Space whose HTML is given to the model as
    /// context alongside `prompt`.
    parent_space_id: Option<Uuid>,
}

/// `POST /api/spaces/generate` — generate a new Space (or a remix of an
/// existing one) and persist it. Does not post anything into a chat; the
/// client sends a `scheme: "space"` message pointing at the returned id
/// once it wants to actually share it (or discards it unsent).
pub async fn generate_route(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(payload): Json<GeneratePayload>,
) -> ApiResult<Json<SpaceDto>> {
    let prompt = payload.prompt.trim();
    if prompt.is_empty() || prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(AppError::BadRequest(format!(
            "prompt must be 1..={MAX_PROMPT_CHARS} characters"
        )));
    }

    let parent_html = match payload.parent_space_id {
        Some(parent_id) => {
            Some(authorized_space(&state, auth.user_id, parent_id).await?.html)
        }
        None => None,
    };

    let html = generate_html(&state, prompt, parent_html.as_deref()).await?;

    let id = Uuid::now_v7();
    let dto: SpaceDto = sqlx::query_as(
        "INSERT INTO spaces (id, creator_id, parent_space_id, html)
         VALUES ($1, $2, $3, $4)
         RETURNING id, creator_id, parent_space_id, html, created_at",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(payload.parent_space_id)
    .bind(&html)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(dto))
}

/// `GET /api/spaces/:id` — fetch a Space's HTML so the client can render it.
pub async fn get_route(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<SpaceDto>> {
    Ok(Json(authorized_space(&state, auth.user_id, id).await?))
}
