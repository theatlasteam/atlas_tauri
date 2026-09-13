//! Atlas bots — special user accounts owned by a developer. They receive DMs
//! and reply from stored rules or a webhook. The website `/bots` editor
//! creates them; the token is shown once.

use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use chrono::{DateTime, Utc};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::{hash_password, AuthUser};
use crate::broadcast::{sanitize_buttons, BroadcastButton};
use crate::error::{ApiResult, AppError};
use crate::models::MessageDto;
use crate::routes::messages::{persist_and_fanout, NewMessage};
use crate::state::AppState;

fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotDto {
    pub id: Uuid,
    pub user_id: Uuid,
    pub handle: String,
    pub name: String,
    pub webhook_url: String,
    pub script: String,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub delivery: String,
    #[serde(default)]
    pub welcome: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBot {
    pub handle: String,
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBot {
    pub webhook_url: Option<String>,
    pub script: Option<String>,
    pub name: Option<String>,
    pub delivery: Option<String>,
}

#[derive(Deserialize, Default, Clone)]
struct ReplyRule {
    #[serde(default)]
    on: String,
    #[serde(default)]
    say: String,
    #[serde(default)]
    buttons: Vec<Vec<BroadcastButton>>,
    #[serde(default)]
    image: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    fetch: String,
}

#[derive(Deserialize, Default)]
struct BotScript {
    #[serde(default)]
    replies: Vec<ReplyRule>,
    #[serde(default)]
    welcome: String,
}

fn mint_token() -> String {
    let mut raw = [0u8; 24];
    OsRng.fill_bytes(&mut raw);
    format!(
        "atlasbot_{}",
        raw.iter().map(|b| format!("{b:02x}")).collect::<String>()
    )
}

fn default_script() -> String {
    serde_json::json!({
        "files": {
            "manifest.json": "{\n  \"id\": \"bot.example\",\n  \"name\": \"My bot\",\n  \"version\": \"0.1.0\",\n  \"main\": \"src/bot.js\"\n}",
            "icon.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\">\n  <rect width=\"64\" height=\"64\" rx=\"14\" fill=\"#c9772e\"/>\n  <text x=\"32\" y=\"42\" text-anchor=\"middle\" font-size=\"28\" fill=\"#fff\">B</text>\n</svg>\n",
            "src/bot.js": "// First matching reply() wins. \"*\" matches anything. {{text}} is the DM.\n// keyboard() — Telegram grid. data+edit: tap rewrites this bubble.\n// fetch(trigger, https) — Atlas GETs live text. app: mini-app URL.\n\nwelcome(\"Hi — tap Start to talk to me.\");\n\nreply(\"/start\", \"Welcome! Pick something.\");\nkeyboard(\"/start\", [\n  [{ \"label\": \"Weather\", \"data\": \"/weather\", \"icon\": \"☀️\", \"edit\": true }, { \"label\": \"Help\", \"data\": \"/help\", \"icon\": \"❓\", \"edit\": true }],\n  [{ \"label\": \"Atlas\", \"url\": \"https://atlasmsg.app\", \"icon\": \"✨\" }]\n]);\n\nreply(\"/weather\", \"Fetching…\");\nfetch(\"/weather\", \"https://wttr.in/?format=3\");\nkeyboard(\"/weather\", [\n  [{ \"label\": \"Back\", \"data\": \"/start\", \"edit\": true }]\n]);\n\nreply(\"/help\", \"Tap a button or send /start.\");\nkeyboard(\"/help\", [\n  [{ \"label\": \"Back\", \"data\": \"/start\", \"edit\": true }]\n]);\nreply(\"*\", \"You said {{text}}\");\n",
            "README.md": "# My bot\n\n`welcome()`, `reply()`, `keyboard()`, `image()`, `fetch()` — see /docs/bots.\nLong-poll with GET /api/bot/updates like aiogram, or set a webhook.\n",
        }
    })
    .to_string()
}

fn unescape_quoted(s: &str) -> String {
    s.replace("\\\"", "\"").replace("\\n", "\n").replace("\\\\", "\\")
}

fn bot_js_source(script: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(script) {
        if let Some(files) = v.get("files").and_then(|f| f.as_object()) {
            for key in ["src/bot.js", "bot.js", "src/main.js"] {
                if let Some(js) = files.get(key).and_then(|s| s.as_str()) {
                    return js.to_string();
                }
            }
        }
    }
    script.to_string()
}

fn take_quoted<'a>(s: &'a str) -> Option<(String, &'a str)> {
    let s = s.trim_start();
    let rest = s.strip_prefix('"')?;
    let mut e = 0;
    let b = rest.as_bytes();
    while e < b.len() {
        if b[e] == b'\\' {
            e += 2;
            continue;
        }
        if b[e] == b'"' {
            return Some((unescape_quoted(&rest[..e]), &rest[e + 1..]));
        }
        e += 1;
    }
    None
}

fn take_json_value(s: &str) -> Option<(serde_json::Value, &str)> {
    let s = s.trim_start();
    let start = s.find(['[', '{'])?;
    let s = &s[start..];
    let open = s.as_bytes()[0];
    let close = if open == b'[' { b']' } else { b'}' };
    let mut depth = 0i32;
    let mut in_str = false;
    let mut esc = false;
    for (i, &c) in s.as_bytes().iter().enumerate() {
        if in_str {
            if esc {
                esc = false;
            } else if c == b'\\' {
                esc = true;
            } else if c == b'"' {
                in_str = false;
            }
            continue;
        }
        match c {
            b'"' => in_str = true,
            x if x == open => depth += 1,
            x if x == close => {
                depth -= 1;
                if depth == 0 {
                    let chunk = &s[..=i];
                    let v = serde_json::from_str(chunk).ok()?;
                    return Some((v, &s[i + 1..]));
                }
            }
            _ => {}
        }
    }
    None
}

fn flatten_keyboard(rows: Vec<Vec<BroadcastButton>>) -> Vec<BroadcastButton> {
    let mut out = Vec::new();
    for (i, row) in rows.into_iter().take(8).enumerate() {
        for mut b in row.into_iter().take(4) {
            b.row = i as u8;
            out.push(b);
        }
    }
    out
}

fn upsert_rule(replies: &mut Vec<ReplyRule>, on: &str) -> usize {
    if let Some(i) = replies.iter().position(|r| r.on == on) {
        return i;
    }
    replies.push(ReplyRule {
        on: on.to_string(),
        ..ReplyRule::default()
    });
    replies.len() - 1
}

/// JSON `{"replies":[...]}` or JS `reply` / `keyboard` / `image` / `icon`.
fn parse_script(script: &str) -> BotScript {
    let src = bot_js_source(script);
    if let Ok(mut parsed) = serde_json::from_str::<BotScript>(&src) {
        for r in &mut parsed.replies {
            if !r.buttons.is_empty() {
                // keep nested; flatten at send time
            }
        }
        return parsed;
    }
    let mut replies: Vec<ReplyRule> = Vec::new();
    let mut rest = src.as_str();
    while !rest.is_empty() {
        if let Some(idx) = rest.find("reply(") {
            let after = &rest[idx + 6..];
            if let Some((on, after)) = take_quoted(after) {
                if let Some((_, after)) = after.find(',').map(|i| ((), &after[i + 1..])) {
                    if let Some((say, tail)) = take_quoted(after) {
                        let i = upsert_rule(&mut replies, &on);
                        if replies[i].say.is_empty() {
                            replies[i].say = say;
                        }
                        rest = tail;
                        continue;
                    }
                }
            }
            rest = &rest[idx + 6..];
            continue;
        }
        break;
    }
    rest = src.as_str();
    while let Some(idx) = rest.find("keyboard(") {
        let after = &rest[idx + 9..];
        if let Some((on, after)) = take_quoted(after) {
            if let Some((val, tail)) = take_json_value(after) {
                if let Ok(rows) = serde_json::from_value::<Vec<Vec<BroadcastButton>>>(val) {
                    let i = upsert_rule(&mut replies, &on);
                    replies[i].buttons = rows;
                }
                rest = tail;
                continue;
            }
        }
        rest = &rest[idx + 9..];
    }
    rest = src.as_str();
    while let Some(idx) = rest.find("image(") {
        let after = &rest[idx + 6..];
        if let Some((on, after)) = take_quoted(after) {
            if let Some((url, tail)) = take_quoted(after.trim_start().trim_start_matches(',')) {
                let i = upsert_rule(&mut replies, &on);
                replies[i].image = url;
                rest = tail;
                continue;
            }
        }
        rest = &rest[idx + 6..];
    }
    rest = src.as_str();
    while let Some(idx) = rest.find("icon(") {
        let after = &rest[idx + 5..];
        if let Some((on, after)) = take_quoted(after) {
            if let Some((icon, tail)) = take_quoted(after.trim_start().trim_start_matches(',')) {
                let i = upsert_rule(&mut replies, &on);
                replies[i].icon = icon;
                rest = tail;
                continue;
            }
        }
        rest = &rest[idx + 5..];
    }
    rest = src.as_str();
    while let Some(idx) = rest.find("fetch(") {
        let after = &rest[idx + 6..];
        if let Some((on, after)) = take_quoted(after) {
            if let Some((url, tail)) = take_quoted(after.trim_start().trim_start_matches(',')) {
                let i = upsert_rule(&mut replies, &on);
                replies[i].fetch = url;
                rest = tail;
                continue;
            }
        }
        rest = &rest[idx + 6..];
    }
    let mut welcome = String::new();
    rest = src.as_str();
    if let Some(idx) = rest.find("welcome(") {
        let after = &rest[idx + 8..];
        if let Some((w, _)) = take_quoted(after) {
            welcome = w;
        }
    }
    BotScript { replies, welcome }
}

type BotRow = (
    Uuid,
    Uuid,
    String,
    String,
    String,
    String,
    DateTime<Utc>,
    String,
    String,
    String,
);

fn dto_from_row(r: BotRow) -> BotDto {
    BotDto {
        id: r.0,
        user_id: r.1,
        handle: r.2,
        name: r.3,
        webhook_url: r.4,
        script: r.5,
        created_at: r.6,
        token: if r.7.is_empty() { None } else { Some(r.7) },
        welcome: r.8,
        delivery: r.9,
    }
}

const BOT_SELECT: &str = "SELECT b.id, b.user_id, u.handle, u.name, b.webhook_url, b.script, b.created_at,
            COALESCE(b.token, ''), COALESCE(b.welcome, ''), COALESCE(b.delivery, 'script')
         FROM bots b JOIN users u ON u.id = b.user_id";

pub async fn list_mine(State(state): State<AppState>, auth: AuthUser) -> ApiResult<Json<Vec<BotDto>>> {
    let rows: Vec<BotRow> = sqlx::query_as(&format!(
        "{BOT_SELECT}
         WHERE b.owner_id = $1
         ORDER BY b.created_at DESC"
    ))
    .bind(auth.user_id)
    .fetch_all(&state.db)
    .await?;
    let mut out = Vec::with_capacity(rows.len());
    for mut row in rows {
        if row.7.is_empty() {
            let token = mint_token();
            let hash = token_hash(&token);
            sqlx::query("UPDATE bots SET token = $2, token_hash = $3 WHERE id = $1")
                .bind(row.0)
                .bind(&token)
                .bind(&hash)
                .execute(&state.db)
                .await?;
            row.7 = token;
        }
        out.push(dto_from_row(row));
    }
    Ok(Json(out))
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<CreateBot>,
) -> ApiResult<Json<BotDto>> {
    let handle = body.handle.trim().trim_start_matches('@').to_lowercase();
    let name = body.name.trim();
    if handle.len() < 3 || handle.len() > 32 || !handle.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(AppError::BadRequest("handle must be 3–32 letters, digits or _".into()));
    }
    if name.is_empty() || name.len() > 80 {
        return Err(AppError::BadRequest("name required".into()));
    }

    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE handle = $1)")
        .bind(&handle)
        .fetch_one(&state.db)
        .await?;
    if exists {
        return Err(AppError::Conflict("handle already taken".into()));
    }

    let token = mint_token();
    let hash = token_hash(&token);

    let mut pw = [0u8; 32];
    OsRng.fill_bytes(&mut pw);
    let password_hash = hash_password(pw.iter().map(|b| format!("{b:02x}")).collect()).await?;

    let user_id = Uuid::new_v4();
    let bot_id = Uuid::new_v4();
    let initial = name.chars().next().map(|c| c.to_uppercase().to_string()).unwrap_or_else(|| "B".into());

    sqlx::query(
        "INSERT INTO users (id, handle, name, password_hash, avatar_initial, is_bot, bio)
         VALUES ($1, $2, $3, $4, $5, true, 'Atlas bot')",
    )
    .bind(user_id)
    .bind(&handle)
    .bind(name)
    .bind(&password_hash)
    .bind(&initial)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO bots (id, owner_id, user_id, token_hash, token, script, welcome, delivery)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'script')",
    )
    .bind(bot_id)
    .bind(auth.user_id)
    .bind(user_id)
    .bind(&hash)
    .bind(&token)
    .bind(default_script())
    .bind("Hi — tap Start to talk to me.")
    .execute(&state.db)
    .await?;

    Ok(Json(BotDto {
        id: bot_id,
        user_id,
        handle,
        name: name.to_string(),
        webhook_url: String::new(),
        script: default_script(),
        created_at: Utc::now(),
        token: Some(token),
        welcome: "Hi — tap Start to talk to me.".into(),
        delivery: "script".into(),
    }))
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBot>,
) -> ApiResult<Json<BotDto>> {
    let welcome = body.script.as_deref().map(|s| parse_script(s).welcome);
    let delivery = body.delivery.as_deref().map(|d| {
        match d {
            "polling" | "webhook" | "script" => d,
            _ => "script",
        }
        .to_string()
    });
    let n = sqlx::query(
        "UPDATE bots SET
            webhook_url = COALESCE($3, webhook_url),
            script = COALESCE($4, script),
            welcome = COALESCE($5, welcome),
            delivery = COALESCE($6, delivery)
         WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(auth.user_id)
    .bind(body.webhook_url.as_deref())
    .bind(body.script.as_deref())
    .bind(welcome.as_deref())
    .bind(delivery.as_deref())
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    if let Some(name) = body.name.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        sqlx::query(
            "UPDATE users SET name = $2 WHERE id = (SELECT user_id FROM bots WHERE id = $1 AND owner_id = $3)",
        )
        .bind(id)
        .bind(name)
        .bind(auth.user_id)
        .execute(&state.db)
        .await?;
    }
    let row: BotRow = sqlx::query_as(&format!("{BOT_SELECT} WHERE b.id = $1"))
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(dto_from_row(row)))
}

pub async fn rotate_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<BotDto>> {
    let token = mint_token();
    let hash = token_hash(&token);
    let n = sqlx::query("UPDATE bots SET token_hash = $3, token = $4 WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .bind(&hash)
        .bind(&token)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(AppError::NotFound);
    }
    let row: BotRow = sqlx::query_as(&format!("{BOT_SELECT} WHERE b.id = $1"))
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    Ok(Json(dto_from_row(row)))
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<serde_json::Value>> {
    let user_id: Option<Uuid> = sqlx::query_scalar("SELECT user_id FROM bots WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(auth.user_id)
        .fetch_optional(&state.db)
        .await?;
    let Some(uid) = user_id else {
        return Err(AppError::NotFound);
    };
    sqlx::query("DELETE FROM bots WHERE id = $1").bind(id).execute(&state.db).await?;
    sqlx::query("DELETE FROM users WHERE id = $1").bind(uid).execute(&state.db).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotSend {
    pub chat_id: Uuid,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub buttons: Vec<BroadcastButton>,
    #[serde(default)]
    pub image_url: String,
    pub attachment_id: Option<Uuid>,
    /// When set, rewrite this existing bot message (navigation).
    pub message_id: Option<Uuid>,
}

async fn attach_from_url(state: &AppState, owner: Uuid, url: &str) -> Result<Uuid, AppError> {
    let url = url.trim();
    if !url.starts_with("https://") || url.len() > 2048 {
        return Err(AppError::BadRequest("imageUrl must be https".into()));
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("0.0.0.0") || lower.contains("[::") {
        return Err(AppError::BadRequest("imageUrl host not allowed".into()));
    }
    let res = state
        .http
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::BadRequest(format!("image fetch failed: {e}")))?;
    if !res.status().is_success() {
        return Err(AppError::BadRequest("image fetch failed".into()));
    }
    let mime = res
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .to_string();
    if !mime.starts_with("image/") {
        return Err(AppError::BadRequest("imageUrl is not an image".into()));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("image read failed: {e}")))?;
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err(AppError::BadRequest("image must be under 5 MiB".into()));
    }
    let id = Uuid::new_v4();
    let dir = &state.cfg.attachments_dir;
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|e| AppError::Internal(format!("attachments dir: {e}")))?;
    let path = std::path::Path::new(dir).join(id.to_string());
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| AppError::Internal(format!("attachment write: {e}")))?;
    let filename = url.rsplit('/').next().unwrap_or("image").chars().take(80).collect::<String>();
    if let Err(e) = sqlx::query(
        "INSERT INTO attachments (id, owner_id, kind, mime, size_bytes, filename)
         VALUES ($1, $2, 'image', $3, $4, $5)",
    )
    .bind(id)
    .bind(owner)
    .bind(&mime)
    .bind(bytes.len() as i64)
    .bind(&filename)
    .execute(&state.db)
    .await
    {
        let _ = tokio::fs::remove_file(&path).await;
        return Err(e.into());
    }
    Ok(id)
}

async fn post_bot_message(
    state: &AppState,
    bot_user: Uuid,
    chat_id: Uuid,
    text: &str,
    buttons: Vec<BroadcastButton>,
    image_url: &str,
    attachment_id: Option<Uuid>,
) -> Result<MessageDto, AppError> {
    let buttons = if buttons.is_empty() {
        None
    } else {
        Some(sanitize_buttons(buttons)?)
    };
    let mut att = attachment_id;
    if att.is_none() && !image_url.trim().is_empty() {
        att = attach_from_url(state, bot_user, image_url).await.ok();
    }
    let body = text.trim();
    if body.is_empty() && att.is_none() {
        return Err(AppError::BadRequest("text or image required".into()));
    }
    persist_and_fanout(
        state,
        bot_user,
        chat_id,
        NewMessage {
            scheme: "plain",
            body,
            client_tag: None,
            reply_to_id: None,
            attachment_id: att,
            unlock_at: None,
            mentions_compass: false,
            buttons,
        },
    )
    .await
}

pub struct BotAuth {
    pub bot_user_id: Uuid,
}

impl BotAuth {
    async fn from_header(state: &AppState, headers: &HeaderMap) -> Result<Self, AppError> {
        let raw = headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        let hash = token_hash(raw);
        let user_id: Option<Uuid> = sqlx::query_scalar("SELECT user_id FROM bots WHERE token_hash = $1")
            .bind(&hash)
            .fetch_optional(&state.db)
            .await?;
        Ok(Self {
            bot_user_id: user_id.ok_or(AppError::Unauthorized)?,
        })
    }
}

pub async fn bot_send(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BotSend>,
) -> ApiResult<Json<MessageDto>> {
    let auth = BotAuth::from_header(&state, &headers).await?;
    if body.text.len() > 8000 {
        return Err(AppError::BadRequest("text too long".into()));
    }
    if let Some(mid) = body.message_id {
        let buttons = if body.buttons.is_empty() {
            None
        } else {
            Some(sanitize_buttons(body.buttons)?)
        };
        let dto = crate::routes::messages::update_plain_bot_message(
            &state,
            auth.bot_user_id,
            mid,
            &body.text,
            buttons,
        )
        .await?;
        return Ok(Json(dto));
    }
    let dto = post_bot_message(
        &state,
        auth.bot_user_id,
        body.chat_id,
        &body.text,
        body.buttons,
        &body.image_url,
        body.attachment_id,
    )
    .await?;
    Ok(Json(dto))
}

#[derive(Deserialize)]
pub struct UpdatesQuery {
    #[serde(default)]
    offset: i64,
    #[serde(default = "default_timeout")]
    timeout: u64,
}

fn default_timeout() -> u64 {
    20
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BotUpdate {
    pub update_id: i64,
    pub chat_id: Uuid,
    pub from: Uuid,
    pub kind: String,
    pub text: String,
    pub data: String,
    pub message_id: Option<Uuid>,
}

/// Long-poll like Telegram getUpdates / aiogram. Confirm by passing the next offset.
pub async fn bot_updates(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Query(q): axum::extract::Query<UpdatesQuery>,
) -> ApiResult<Json<serde_json::Value>> {
    let auth = BotAuth::from_header(&state, &headers).await?;
    if q.offset > 0 {
        sqlx::query("DELETE FROM bot_updates WHERE bot_user_id = $1 AND id < $2")
            .bind(auth.bot_user_id)
            .bind(q.offset)
            .execute(&state.db)
            .await?;
    }
    let timeout = q.timeout.min(30).max(0);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout);
    loop {
        let rows: Vec<(i64, Uuid, Uuid, String, String, String, Option<Uuid>)> = sqlx::query_as(
            "SELECT id, chat_id, from_user, kind, text, data, message_id
             FROM bot_updates WHERE bot_user_id = $1 AND id >= $2
             ORDER BY id ASC LIMIT 100",
        )
        .bind(auth.bot_user_id)
        .bind(q.offset.max(0))
        .fetch_all(&state.db)
        .await?;
        if !rows.is_empty() {
            let result: Vec<BotUpdate> = rows
                .into_iter()
                .map(|r| BotUpdate {
                    update_id: r.0,
                    chat_id: r.1,
                    from: r.2,
                    kind: r.3,
                    text: r.4,
                    data: r.5,
                    message_id: r.6,
                })
                .collect();
            return Ok(Json(serde_json::json!({ "ok": true, "result": result })));
        }
        if std::time::Instant::now() >= deadline {
            return Ok(Json(serde_json::json!({ "ok": true, "result": [] })));
        }
        tokio::time::sleep(std::time::Duration::from_millis(350)).await;
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CallbackBody {
    pub message_id: Uuid,
    #[serde(default)]
    pub data: String,
}

/// Human tapped an inline button. Script bots rewrite the bubble; polling
/// bots get a callback update; webhooks get POSTed.
pub async fn chat_callback(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(body): Json<CallbackBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2)",
    )
    .bind(chat_id)
    .bind(auth.user_id)
    .fetch_one(&state.db)
    .await?;
    if !member {
        return Err(AppError::Forbidden);
    }
    dispatch_callback(&state, auth.user_id, chat_id, body.message_id, body.data.trim()).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// After a human messages a bot in a DM, reply from rules / webhook.
pub fn maybe_dispatch(state: AppState, author_id: Uuid, chat_id: Uuid, text: String) {
    tokio::spawn(async move {
        if let Err(e) = dispatch(&state, author_id, chat_id, &text, None).await {
            tracing::warn!(error = %e, %chat_id, "bot dispatch failed");
        }
    });
}

async fn enqueue_update(
    state: &AppState,
    bot_user: Uuid,
    chat_id: Uuid,
    from: Uuid,
    kind: &str,
    text: &str,
    data: &str,
    message_id: Option<Uuid>,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO bot_updates (bot_user_id, chat_id, from_user, kind, text, data, message_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(bot_user)
    .bind(chat_id)
    .bind(from)
    .bind(kind)
    .bind(text)
    .bind(data)
    .bind(message_id)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn fetch_live(state: &AppState, url: &str) -> Option<String> {
    let url = url.trim();
    if !url.starts_with("https://") || url.len() > 2048 {
        return None;
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("0.0.0.0") {
        return None;
    }
    let res = state.http.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let t = res.text().await.ok()?;
    let t = t.trim();
    if t.is_empty() {
        return None;
    }
    Some(t.chars().take(4000).collect())
}

async fn apply_rule(
    state: &AppState,
    bot_user: Uuid,
    chat_id: Uuid,
    text: &str,
    rule: &ReplyRule,
    edit_id: Option<Uuid>,
) -> Result<(), AppError> {
    let mut say = rule.say.replace("{{text}}", text.trim());
    if !rule.fetch.is_empty() {
        if let Some(live) = fetch_live(state, &rule.fetch).await {
            say = live;
        }
    }
    if !rule.icon.is_empty() && !say.starts_with(&rule.icon) {
        say = format!("{}\n{}", rule.icon, say);
    }
    let buttons = flatten_keyboard(rule.buttons.clone());
    if let Some(mid) = edit_id {
        let b = if buttons.is_empty() {
            None
        } else {
            Some(sanitize_buttons(buttons)?)
        };
        crate::routes::messages::update_plain_bot_message(state, bot_user, mid, &say, b).await?;
        return Ok(());
    }
    post_bot_message(state, bot_user, chat_id, &say, buttons, &rule.image, None).await?;
    Ok(())
}

async fn dispatch_callback(
    state: &AppState,
    author_id: Uuid,
    chat_id: Uuid,
    message_id: Uuid,
    data: &str,
) -> Result<(), AppError> {
    dispatch(state, author_id, chat_id, data, Some(message_id)).await
}

async fn dispatch(
    state: &AppState,
    author_id: Uuid,
    chat_id: Uuid,
    text: &str,
    callback_message: Option<Uuid>,
) -> Result<(), AppError> {
    let kind: String = sqlx::query_scalar("SELECT kind FROM chats WHERE id = $1")
        .bind(chat_id)
        .fetch_one(&state.db)
        .await?;
    if kind != "dm" {
        return Ok(());
    }
    let peer: Option<(Uuid, bool)> = sqlx::query_as(
        "SELECT u.id, u.is_bot FROM chat_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = $1 AND cm.user_id <> $2",
    )
    .bind(chat_id)
    .bind(author_id)
    .fetch_optional(&state.db)
    .await?;
    let Some((bot_user, is_bot)) = peer else {
        return Ok(());
    };
    if !is_bot {
        return Ok(());
    }
    let author_is_bot: bool = sqlx::query_scalar("SELECT is_bot FROM users WHERE id = $1")
        .bind(author_id)
        .fetch_one(&state.db)
        .await?;
    if author_is_bot {
        return Ok(());
    }

    let bot: Option<(String, String, String)> = sqlx::query_as(
        "SELECT webhook_url, script, COALESCE(delivery, 'script') FROM bots WHERE user_id = $1",
    )
    .bind(bot_user)
    .fetch_optional(&state.db)
    .await?;
    let Some((webhook, script, delivery)) = bot else {
        return Ok(());
    };

    let kind = if callback_message.is_some() {
        "callback"
    } else {
        "message"
    };
    if delivery == "polling" {
        enqueue_update(
            state,
            bot_user,
            chat_id,
            author_id,
            kind,
            text,
            if kind == "callback" { text } else { "" },
            callback_message,
        )
        .await?;
        return Ok(());
    }

    if !webhook.trim().is_empty() || delivery == "webhook" {
        let url = webhook.trim().to_string();
        if !url.is_empty() {
            let payload = serde_json::json!({
                "type": kind,
                "chatId": chat_id,
                "from": author_id,
                "text": text,
                "data": if kind == "callback" { text } else { "" },
                "messageId": callback_message,
            });
            let http = state.http.clone();
            tokio::spawn(async move {
                let _ = http.post(url).json(&payload).send().await;
            });
        }
        if delivery == "webhook" {
            return Ok(());
        }
    }

    let parsed = parse_script(&script);
    let lower = text.trim();
    let reply = parsed.replies.iter().find(|r| {
        r.on == "*" || r.on.eq_ignore_ascii_case(lower) || lower.starts_with(&r.on)
    });
    if let Some(r) = reply {
        let mut edit_id = callback_message;
        if let Some(mid) = callback_message {
            if let Some(btn) = r.buttons.iter().flatten().find(|b| b.data == lower) {
                if btn.edit || !btn.fetch.is_empty() {
                    edit_id = Some(mid);
                } else if !btn.edit && callback_message.is_some() {
                    // default: callback with data edits so menus navigate in-place
                    edit_id = Some(mid);
                }
            } else {
                edit_id = Some(mid);
            }
        }
        apply_rule(state, bot_user, chat_id, text, r, edit_id).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_welcome_fetch_and_keyboard() {
        let src = r#"
welcome("Hi there");
reply("/weather", "hold on");
fetch("/weather", "https://wttr.in/?format=3");
keyboard("/weather", [[{ "label": "Back", "data": "/start", "edit": true }]]);
"#;
        let parsed = parse_script(src);
        assert_eq!(parsed.welcome, "Hi there");
        let w = parsed.replies.iter().find(|r| r.on == "/weather").unwrap();
        assert_eq!(w.fetch, "https://wttr.in/?format=3");
        assert_eq!(w.say, "hold on");
        assert_eq!(w.buttons[0][0].data, "/start");
        assert!(w.buttons[0][0].edit);
    }

    #[test]
    fn star_rule_still_matches() {
        let parsed = parse_script(r#"reply("*", "You said {{text}}");"#);
        assert_eq!(parsed.replies[0].on, "*");
        assert!(parsed.welcome.is_empty());
    }
}
