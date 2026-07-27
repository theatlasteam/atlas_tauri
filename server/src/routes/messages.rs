use std::collections::HashMap;

use axum::extract::{Path, Query, State};
use axum::Json;
use chrono::{DateTime, Duration, Utc};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::{ApiResult, AppError};
use crate::models::{
    decode_body, encode_body, AttachmentRow, MessageDto, MessageRow, ReactionDto, ReplyPreviewDto,
};
use crate::state::AppState;
use crate::ws::chat_member_ids;
use crate::ws::protocol::ServerEvent;

const MAX_BODY_BYTES: usize = 64 * 1024;
/// How far ahead a time capsule may be scheduled. A year is generous for the
/// intended uses (birthdays, anniversaries, "read this when you land") and
/// still bounds how long the server is on the hook for storing a body nobody
/// can read.
const MAX_CAPSULE_AHEAD_DAYS: i64 = 365;
pub const MESSAGE_COLUMNS: &str = "id, chat_id, author_id, scheme, body, sent_at, reply_to_id, \
     attachment_id, unlock_at, edited_at, deleted_at";

fn valid_scheme(scheme: &str) -> bool {
    !scheme.is_empty()
        && scheme.len() <= 16
        && scheme.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

async fn require_membership(state: &AppState, chat_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    // Compass posting into a DM is deliberately not real chat_members
    // membership: a 'dm' row's peer-resolution SQL (chats.rs) assumes
    // exactly one other member, and adding a third would corrupt that for
    // the two actual humans. Compass *does* become a real member of a
    // group (see compass::ensure_member) — groups have no such 2-party
    // assumption, and "shows up as a member" is the point there. The
    // caller of compass_reply already had their own membership checked
    // before Compass's message is posted, so this isn't skipping
    // authorization, just which identity performs the write.
    if user_id == state.compass_user_id {
        return Ok(());
    }
    let is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2)",
    )
    .bind(chat_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;
    if is_member {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

/// Blocks a DM (either direction) after it already exists — fresh DM
/// *creation* between blocked users is rejected earlier, in create_dm.
async fn require_not_blocked(state: &AppState, chat_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
    let blocked: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM chats c
            JOIN chat_members other ON other.chat_id = c.id AND other.user_id <> $2
            JOIN blocks b ON
                (b.blocker_id = $2 AND b.blocked_id = other.user_id)
             OR (b.blocker_id = other.user_id AND b.blocked_id = $2)
            WHERE c.id = $1 AND c.kind = 'dm'
         )",
    )
    .bind(chat_id)
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;
    if blocked {
        Err(AppError::Forbidden)
    } else {
        Ok(())
    }
}

/// Attach reply previews, attachment metadata, and reaction tallies to a page
/// of message rows — three set-based queries regardless of page size.
pub async fn hydrate(state: &AppState, rows: Vec<MessageRow>) -> Result<Vec<MessageDto>, AppError> {
    let reply_ids: Vec<Uuid> = rows.iter().filter_map(|r| r.reply_to_id).collect();
    let attachment_ids: Vec<Uuid> = rows.iter().filter_map(|r| r.attachment_id).collect();
    let message_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    let mut replies: HashMap<Uuid, ReplyPreviewDto> = HashMap::new();
    if !reply_ids.is_empty() {
        let parents: Vec<MessageRow> = sqlx::query_as(&format!(
            "SELECT {MESSAGE_COLUMNS} FROM messages WHERE id = ANY($1)"
        ))
        .bind(&reply_ids)
        .fetch_all(&state.db)
        .await?;
        let now = Utc::now();
        for p in parents {
            // A quote must never become a peephole. Quoting a capsule that
            // hasn't opened shows the seal, and quoting an unsent message
            // shows the tombstone — in both cases the same thing the bubble
            // itself would show.
            let placeholder = if p.deleted_at.is_some() {
                Some("deleted")
            } else if p.unlock_at.is_some_and(|at| at > now) {
                Some("sealed")
            } else {
                None
            };
            replies.insert(
                p.id,
                ReplyPreviewDto {
                    id: p.id,
                    author_id: p.author_id,
                    body: match placeholder {
                        Some(_) => String::new(),
                        None => encode_body(&p.scheme, &p.body),
                    },
                    scheme: placeholder.map(str::to_string).unwrap_or(p.scheme),
                },
            );
        }
    }

    let mut attachments: HashMap<Uuid, AttachmentRow> = HashMap::new();
    if !attachment_ids.is_empty() {
        let rows: Vec<AttachmentRow> = sqlx::query_as(
            "SELECT id, kind, mime, size_bytes, filename, duration_ms, width, height
             FROM attachments WHERE id = ANY($1)",
        )
        .bind(&attachment_ids)
        .fetch_all(&state.db)
        .await?;
        for a in rows {
            attachments.insert(a.id, a);
        }
    }

    let mut reactions: HashMap<Uuid, Vec<ReactionDto>> = HashMap::new();
    if !message_ids.is_empty() {
        let rows: Vec<(Uuid, String, Vec<Uuid>)> = sqlx::query_as(
            "SELECT message_id, emoji, array_agg(user_id ORDER BY created_at)
             FROM message_reactions WHERE message_id = ANY($1)
             GROUP BY message_id, emoji ORDER BY min(created_at)",
        )
        .bind(&message_ids)
        .fetch_all(&state.db)
        .await?;
        for (message_id, emoji, user_ids) in rows {
            reactions.entry(message_id).or_default().push(ReactionDto { emoji, user_ids });
        }
    }

    Ok(rows
        .into_iter()
        .map(|row| {
            let reply_to = row.reply_to_id.and_then(|id| replies.get(&id).cloned());
            let attachment =
                row.attachment_id.and_then(|id| attachments.get(&id).cloned()).map(Into::into);
            let reaction_list = reactions.remove(&row.id).unwrap_or_default();
            let mut dto = MessageDto::from(row);
            dto.reply_to = reply_to;
            dto.attachment = attachment;
            dto.reactions = reaction_list;
            dto
        })
        .collect())
}

pub struct NewMessage<'a> {
    pub scheme: &'a str,
    pub body: &'a str,
    pub client_tag: Option<String>,
    pub reply_to_id: Option<Uuid>,
    pub attachment_id: Option<Uuid>,
    /// Send it now, let it be read then. See MessageDto::seal.
    pub unlock_at: Option<DateTime<Utc>>,
    /// Set by the *client*, from plaintext it already has before encryption
    /// — the server can't parse this out of an E2EE DM itself. See
    /// compass.rs's module doc for what does and doesn't happen with it.
    pub mentions_compass: bool,
}

/// The single write path for messages (WS + REST + server-generated call
/// logs): authorize, validate references, persist idempotently, hydrate,
/// fan out to online members. Persist-before-fanout is the delivery contract.
pub async fn persist_and_fanout(
    state: &AppState,
    author_id: Uuid,
    chat_id: Uuid,
    new: NewMessage<'_>,
) -> Result<MessageDto, AppError> {
    if !valid_scheme(new.scheme) {
        return Err(AppError::BadRequest("invalid scheme".into()));
    }
    let raw = decode_body(new.scheme, new.body).map_err(AppError::BadRequest)?;
    if raw.len() > MAX_BODY_BYTES || (raw.is_empty() && new.attachment_id.is_none()) {
        return Err(AppError::BadRequest("body must be 1..=65536 bytes".into()));
    }
    if let Some(tag) = &new.client_tag {
        if tag.len() > 64 {
            return Err(AppError::BadRequest("client_tag too long".into()));
        }
    }
    let now = Utc::now();
    if let Some(unlock_at) = new.unlock_at {
        // A capsule that opens in the past is just a message; rejecting it
        // keeps "sealed" from ever meaning "sealed for zero seconds", which
        // would flicker a countdown on the recipient for one frame.
        if unlock_at <= now {
            return Err(AppError::BadRequest("unlockAt must be in the future".into()));
        }
        if unlock_at > now + Duration::days(MAX_CAPSULE_AHEAD_DAYS) {
            return Err(AppError::BadRequest(format!(
                "unlockAt must be within {MAX_CAPSULE_AHEAD_DAYS} days"
            )));
        }
    }

    require_membership(state, chat_id, author_id).await?;
    require_not_blocked(state, chat_id, author_id).await?;

    // A reply must point at a message in the same chat — otherwise a crafted
    // reply_to_id would leak previews across chat boundaries via hydration.
    if let Some(reply_id) = new.reply_to_id {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2)",
        )
        .bind(reply_id)
        .bind(chat_id)
        .fetch_one(&state.db)
        .await?;
        if !ok {
            return Err(AppError::BadRequest("reply_to not in this chat".into()));
        }
    }

    // Attachments may only be referenced by their uploader, once.
    if let Some(att_id) = new.attachment_id {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1 FROM attachments a WHERE a.id = $1 AND a.owner_id = $2
                  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.attachment_id = $1)
             )",
        )
        .bind(att_id)
        .bind(author_id)
        .fetch_one(&state.db)
        .await?;
        if !ok {
            return Err(AppError::BadRequest("attachment not found or already used".into()));
        }
    }

    let inserted: Option<MessageRow> = sqlx::query_as(&format!(
        "INSERT INTO messages (id, chat_id, author_id, scheme, body, client_tag, reply_to_id, attachment_id, unlock_at, compass_mentioned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (author_id, client_tag) WHERE client_tag IS NOT NULL DO NOTHING
         RETURNING {MESSAGE_COLUMNS}"
    ))
    .bind(Uuid::now_v7())
    .bind(chat_id)
    .bind(author_id)
    .bind(new.scheme)
    .bind(&raw)
    .bind(&new.client_tag)
    .bind(new.reply_to_id)
    .bind(new.attachment_id)
    .bind(new.unlock_at)
    .bind(new.mentions_compass)
    .fetch_optional(&state.db)
    .await?;

    let (row, fresh) = match inserted {
        Some(row) => (row, true),
        None => {
            let row: MessageRow = sqlx::query_as(&format!(
                "SELECT {MESSAGE_COLUMNS} FROM messages WHERE author_id = $1 AND client_tag = $2"
            ))
            .bind(author_id)
            .bind(&new.client_tag)
            .fetch_one(&state.db)
            .await?;
            (row, false)
        }
    };

    // Sealed once, here, so every consumer below — fan-out, the REST reply to
    // the sender, the WS ack — is handed the same withheld body. A capsule
    // that the author could still read would not be sealed, just polite.
    let dto = hydrate(state, vec![row]).await?.pop().ok_or(AppError::NotFound)?.seal(now);
    if fresh {
        // Fan out to every member — including the author, whose *other*
        // devices need it too. The originating device may see both this and
        // its MessageAck; both carry the same message id, so dedupe is trivial.
        let event = ServerEvent::Message { message: dto.clone() };
        for member in chat_member_ids(state, chat_id).await? {
            state.hub.send_to_user(member, &event);
        }
        push_to_absent_members(state, author_id, chat_id, &dto).await;

        // Only a 'plain' message is one the server can actually read — an
        // encrypted DM's compass_mentioned flag exists for the *client* to
        // act on instead (see compass.rs's module doc). Also guards against
        // Compass's own reply re-triggering itself.
        if new.mentions_compass && new.scheme == "plain" && author_id != state.compass_user_id {
            crate::compass::respond_in_group(state.clone(), chat_id, state.compass_user_id);
        }
    }
    Ok(dto)
}

/// Notify members who won't see the WS event. A live socket means the client
/// can raise its own notification, so a push would double up; muting the chat
/// means the user asked for neither.
async fn push_to_absent_members(
    state: &AppState,
    author_id: Uuid,
    chat_id: Uuid,
    dto: &MessageDto,
) {
    if !state.push.enabled() {
        return;
    }
    let candidates: Vec<Uuid> = match sqlx::query_scalar(
        "SELECT user_id FROM chat_members
         WHERE chat_id = $1 AND user_id <> $2 AND NOT muted",
    )
    .bind(chat_id)
    .bind(author_id)
    .fetch_all(&state.db)
    .await
    {
        Ok(ids) => ids,
        Err(e) => {
            tracing::warn!(error = %e, "could not resolve push recipients");
            return;
        }
    };
    let offline: Vec<Uuid> =
        candidates.into_iter().filter(|id| !state.hub.is_online(*id)).collect();
    if offline.is_empty() {
        return;
    }

    // Identity for the notification, never the body. E2EE bodies are opaque
    // here, and a plaintext one can exceed FCM's 4KB payload limit, so the
    // client fetches and decrypts the message itself. The avatar fields let it
    // render the sender's picture without a second round trip for their profile.
    let sender: (String, String, String, bool) = match sqlx::query_as(
        "SELECT name, avatar_color, avatar_initial, avatar_attachment_id IS NOT NULL
         FROM users WHERE id = $1",
    )
    .bind(author_id)
    .fetch_one(&state.db)
    .await
    {
        Ok(row) => row,
        Err(e) => {
            tracing::warn!(error = %e, "could not load sender profile for push");
            return;
        }
    };

    crate::push::notify_detached(
        state.push.clone(),
        state.db.clone(),
        offline,
        crate::push::PushPayload::Message(crate::push::PushMessage {
            chat_id,
            message_id: dto.id,
            sender_id: author_id,
            sender_name: sender.0,
            sender_avatar_color: sender.1,
            sender_avatar_initial: sender.2,
            sender_has_avatar: sender.3,
        }),
    );
}

/// One message by id. Exists for the Android notification service: a push
/// carries only ids, so the device fetches the body it needs to decrypt and
/// display. Membership is checked against the message's own chat, so this
/// can't be used to read messages from chats the caller isn't in.
pub async fn get_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(message_id): Path<Uuid>,
) -> ApiResult<Json<MessageDto>> {
    let row: Option<MessageRow> = sqlx::query_as(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM messages WHERE id = $1"
    ))
    .bind(message_id)
    .fetch_optional(&state.db)
    .await?;
    let row = row.ok_or(AppError::NotFound)?;
    require_membership(&state, row.chat_id, auth.user_id).await?;
    hydrate(&state, vec![row])
        .await?
        .pop()
        .map(|dto| Json(dto.seal(Utc::now())))
        .ok_or(AppError::NotFound)
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    /// Return messages strictly older than this message id (keyset cursor).
    before: Option<Uuid>,
    /// Or: return messages strictly newer than this id (reconnect resync).
    after: Option<Uuid>,
    limit: Option<i64>,
}

pub async fn list_messages(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Query(query): Query<HistoryQuery>,
) -> ApiResult<Json<Vec<MessageDto>>> {
    require_membership(&state, chat_id, auth.user_id).await?;
    let limit = query.limit.unwrap_or(50).clamp(1, 200);

    let rows: Vec<MessageRow> = match (query.after, query.before) {
        (Some(after), _) => {
            sqlx::query_as(&format!(
                "SELECT {MESSAGE_COLUMNS} FROM messages
                 WHERE chat_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3"
            ))
            .bind(chat_id)
            .bind(after)
            .bind(limit)
            .fetch_all(&state.db)
            .await?
        }
        (None, Some(before)) => {
            let mut rows: Vec<MessageRow> = sqlx::query_as(&format!(
                "SELECT {MESSAGE_COLUMNS} FROM messages
                 WHERE chat_id = $1 AND id < $2 ORDER BY id DESC LIMIT $3"
            ))
            .bind(chat_id)
            .bind(before)
            .bind(limit)
            .fetch_all(&state.db)
            .await?;
            rows.reverse();
            rows
        }
        (None, None) => {
            let mut rows: Vec<MessageRow> = sqlx::query_as(&format!(
                "SELECT {MESSAGE_COLUMNS} FROM messages
                 WHERE chat_id = $1 ORDER BY id DESC LIMIT $2"
            ))
            .bind(chat_id)
            .bind(limit)
            .fetch_all(&state.db)
            .await?;
            rows.reverse();
            rows
        }
    };
    let now = Utc::now();
    let dtos = hydrate(&state, rows)
        .await?
        .into_iter()
        .map(|dto| dto.seal(now))
        .collect();
    Ok(Json(dtos))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendPayload {
    #[serde(default = "default_scheme")]
    scheme: String,
    #[serde(default)]
    body: String,
    client_tag: Option<String>,
    reply_to_id: Option<Uuid>,
    attachment_id: Option<Uuid>,
    unlock_at: Option<DateTime<Utc>>,
    #[serde(default)]
    mentions_compass: bool,
}

fn default_scheme() -> String {
    "plain".into()
}

pub async fn send_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<SendPayload>,
) -> ApiResult<Json<MessageDto>> {
    let dto = persist_and_fanout(
        &state,
        auth.user_id,
        chat_id,
        NewMessage {
            scheme: &payload.scheme,
            body: &payload.body,
            client_tag: payload.client_tag,
            reply_to_id: payload.reply_to_id,
            attachment_id: payload.attachment_id,
            unlock_at: payload.unlock_at,
            mentions_compass: payload.mentions_compass,
        },
    )
    .await?;
    Ok(Json(dto))
}

/// A DM (or any other chat the server can't read) mentioned @compass — the
/// client already decrypted its own history, called
/// `POST /api/compass/complete` itself, and is now handing back the
/// finished reply to be posted under Compass's identity. The server takes
/// the text on faith (same trust tier as any other message it stores
/// without verifying); it never sees the DM's plaintext at any point.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompassReplyPayload {
    text: String,
}

pub async fn compass_reply(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<CompassReplyPayload>,
) -> ApiResult<Json<MessageDto>> {
    // Only an actual member of this chat may post "on Compass's behalf" —
    // the same boundary that already gates everything else about a chat.
    // Deliberately not compass::ensure_member here: this path exists
    // specifically for chats where Compass *isn't* (and, for a 'dm', can't
    // safely be) a real chat_members row — see require_membership's doc.
    require_membership(&state, chat_id, auth.user_id).await?;

    let dto = persist_and_fanout(
        &state,
        state.compass_user_id,
        chat_id,
        NewMessage {
            scheme: "plain",
            body: &payload.text,
            client_tag: None,
            reply_to_id: None,
            attachment_id: None,
            unlock_at: None,
            mentions_compass: false,
        },
    )
    .await?;
    Ok(Json(dto))
}

/// Deliver a Read event, honouring the reciprocal "Read receipts" switch.
///
/// Reciprocity is the whole point of the setting: if you don't tell people
/// when you've read their messages, you don't get told either. Both halves are
/// enforced here rather than in the UI, so a modified client cannot keep
/// collecting receipts while withholding its own.
///
/// The reader's *own* devices always get the event — it is what clears the
/// unread badge on their other phone, and it tells them nothing about anyone
/// else.
pub async fn fanout_read_receipt(
    state: &AppState,
    chat_id: Uuid,
    reader_id: Uuid,
    message_id: Uuid,
) -> sqlx::Result<()> {
    let members: Vec<(Uuid, bool)> = sqlx::query_as(
        "SELECT cm.user_id, u.read_receipts
         FROM chat_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.chat_id = $1",
    )
    .bind(chat_id)
    .fetch_all(&state.db)
    .await?;

    let reader_shares = members.iter().any(|(id, shares)| *id == reader_id && *shares);
    let event = ServerEvent::Read { chat_id, user_id: reader_id, message_id };
    for (member, member_shares) in members {
        if member == reader_id || (reader_shares && member_shares) {
            state.hub.send_to_user(member, &event);
        }
    }
    Ok(())
}

// ---------- editing and unsending ----------

/// Load a message the caller is allowed to change, i.e. one they wrote.
///
/// Authorship is the only permission that matters here: a group admin who
/// could rewrite someone else's words would make every message in the app
/// deniable, which is a worse property than not being able to moderate.
async fn own_message(state: &AppState, message_id: Uuid, user_id: Uuid) -> Result<MessageRow, AppError> {
    let row: Option<MessageRow> =
        sqlx::query_as(&format!("SELECT {MESSAGE_COLUMNS} FROM messages WHERE id = $1"))
            .bind(message_id)
            .fetch_optional(&state.db)
            .await?;
    let row = row.ok_or(AppError::NotFound)?;
    if row.author_id != user_id {
        // NotFound rather than Forbidden: whether a message id exists is not
        // something a non-author needs confirmed.
        return Err(AppError::NotFound);
    }
    if row.deleted_at.is_some() {
        return Err(AppError::BadRequest("message was unsent".into()));
    }
    Ok(row)
}

/// Re-hydrate a changed message and tell the chat about it.
async fn fanout_update(state: &AppState, row: MessageRow) -> Result<MessageDto, AppError> {
    let chat_id = row.chat_id;
    let dto = hydrate(state, vec![row]).await?.pop().ok_or(AppError::NotFound)?.seal(Utc::now());
    let event = ServerEvent::MessageUpdated { message: dto.clone() };
    for member in chat_member_ids(state, chat_id).await? {
        state.hub.send_to_user(member, &event);
    }
    Ok(dto)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditPayload {
    #[serde(default = "default_scheme")]
    scheme: String,
    body: String,
}

/// Rewrite a message's body. The previous text is not retained anywhere —
/// see migrations/0008 for why.
pub async fn edit_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(message_id): Path<Uuid>,
    Json(payload): Json<EditPayload>,
) -> ApiResult<Json<MessageDto>> {
    let row = own_message(&state, message_id, auth.user_id).await?;
    require_not_blocked(&state, row.chat_id, auth.user_id).await?;

    if row.scheme == "call-log" {
        return Err(AppError::BadRequest("call logs cannot be edited".into()));
    }
    // A capsule that its author could rewrite while it counts down is not
    // sealed — it is a draft with a delivery date.
    if row.unlock_at.is_some_and(|at| at > Utc::now()) {
        return Err(AppError::BadRequest("a sealed time capsule cannot be edited".into()));
    }
    if !valid_scheme(&payload.scheme) {
        return Err(AppError::BadRequest("invalid scheme".into()));
    }
    let raw = decode_body(&payload.scheme, &payload.body).map_err(AppError::BadRequest)?;
    // An edit may not empty a message: that is what unsend is for, and an
    // empty body would render as a bubble with nothing in it.
    if raw.is_empty() || raw.len() > MAX_BODY_BYTES {
        return Err(AppError::BadRequest("body must be 1..=65536 bytes".into()));
    }

    let updated: MessageRow = sqlx::query_as(&format!(
        "UPDATE messages SET scheme = $2, body = $3, edited_at = now()
         WHERE id = $1 RETURNING {MESSAGE_COLUMNS}"
    ))
    .bind(message_id)
    .bind(&payload.scheme)
    .bind(&raw)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(fanout_update(&state, updated).await?))
}

/// Unsend: wipe the body, keep the row. See migrations/0008.
pub async fn delete_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(message_id): Path<Uuid>,
) -> ApiResult<Json<MessageDto>> {
    // Authorization, and the guard against unsending twice. The row it returns
    // is not needed — the UPDATE below returns the version that matters.
    // Deliberately no restriction on unsending a sealed capsule: "actually,
    // never mind" has to stay available right up until it opens.
    own_message(&state, message_id, auth.user_id).await?;

    // The bytes go in the same statement that marks the tombstone, so there is
    // no window in which a message reads as deleted while its body is still
    // recoverable from the row.
    let updated: MessageRow = sqlx::query_as(&format!(
        "UPDATE messages SET deleted_at = now(), body = ''::bytea, attachment_id = NULL
         WHERE id = $1 RETURNING {MESSAGE_COLUMNS}"
    ))
    .bind(message_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(fanout_update(&state, updated).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkReadPayload {
    message_id: Option<Uuid>,
}

/// Mark a chat read up to a message (default: the latest message).
pub async fn mark_read(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<MarkReadPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    let target = match payload.message_id {
        Some(id) => Some(id),
        None => sqlx::query_scalar(
            "SELECT id FROM messages WHERE chat_id = $1 ORDER BY id DESC LIMIT 1",
        )
        .bind(chat_id)
        .fetch_optional(&state.db)
        .await?,
    };
    let Some(message_id) = target else {
        return Ok(Json(json!({ "ok": true }))); // empty chat: nothing to read
    };

    let updated = sqlx::query(
        "UPDATE chat_members SET last_read_message_id = $3
         WHERE chat_id = $1 AND user_id = $2
           AND (last_read_message_id IS NULL OR last_read_message_id < $3)",
    )
    .bind(chat_id)
    .bind(auth.user_id)
    .bind(message_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() > 0 {
        fanout_read_receipt(&state, chat_id, auth.user_id, message_id).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

// ---------- reactions ----------

#[derive(Deserialize)]
pub struct ReactionPayload {
    emoji: String,
}

async fn message_chat(state: &AppState, message_id: Uuid) -> Result<Uuid, AppError> {
    sqlx::query_scalar("SELECT chat_id FROM messages WHERE id = $1")
        .bind(message_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)
}

/// A reaction must be a short emoji, not a chat message wearing a costume.
///
/// "Contains no ASCII at all" was too blunt: keycap emoji are ASCII digits
/// glued to modifiers (1️⃣ is `1 U+FE0F U+20E3`, #️⃣ likewise), so the whole
/// keycap row was rejected. What actually needs excluding is ASCII that can
/// carry meaning on its own — letters, punctuation, whitespace, controls — so
/// digits and `#`/`*` are allowed through only as part of a longer sequence
/// that also contains a combining mark.
fn valid_emoji(emoji: &str) -> bool {
    if emoji.is_empty() || emoji.len() > 28 {
        return false;
    }
    let mut has_non_ascii = false;
    for c in emoji.chars() {
        if c.is_ascii() {
            // Only the keycap bases; everything else ASCII is text.
            if !(c.is_ascii_digit() || c == '#' || c == '*') {
                return false;
            }
        } else {
            has_non_ascii = true;
        }
    }
    // Rules out a bare "42" or "#" while keeping 1️⃣ and #️⃣.
    has_non_ascii
}

pub async fn add_reaction(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(message_id): Path<Uuid>,
    Json(payload): Json<ReactionPayload>,
) -> ApiResult<Json<serde_json::Value>> {
    if !valid_emoji(&payload.emoji) {
        return Err(AppError::BadRequest("not an emoji".into()));
    }
    let chat_id = message_chat(&state, message_id).await?;
    require_membership(&state, chat_id, auth.user_id).await?;

    let inserted = sqlx::query(
        "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(message_id)
    .bind(auth.user_id)
    .bind(&payload.emoji)
    .execute(&state.db)
    .await?;

    if inserted.rows_affected() > 0 {
        let event = ServerEvent::Reaction {
            chat_id,
            message_id,
            user_id: auth.user_id,
            emoji: payload.emoji,
            added: true,
        };
        for member in chat_member_ids(&state, chat_id).await? {
            state.hub.send_to_user(member, &event);
        }
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn remove_reaction(
    State(state): State<AppState>,
    auth: AuthUser,
    Path((message_id, emoji)): Path<(Uuid, String)>,
) -> ApiResult<Json<serde_json::Value>> {
    let chat_id = message_chat(&state, message_id).await?;
    let removed = sqlx::query(
        "DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3",
    )
    .bind(message_id)
    .bind(auth.user_id)
    .bind(&emoji)
    .execute(&state.db)
    .await?;

    if removed.rows_affected() > 0 {
        let event = ServerEvent::Reaction {
            chat_id,
            message_id,
            user_id: auth.user_id,
            emoji,
            added: false,
        };
        for member in chat_member_ids(&state, chat_id).await? {
            state.hub.send_to_user(member, &event);
        }
    }
    Ok(Json(json!({ "ok": true })))
}

// ---------- search ----------

#[derive(Deserialize)]
pub struct SearchQuery {
    q: String,
    limit: Option<i64>,
}

/// Server-side search over *plaintext* messages in the caller's chats.
/// E2EE messages are ciphertext here by design — those are searched
/// client-side over the local decrypted cache.
pub async fn search_messages(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(query): Query<SearchQuery>,
) -> ApiResult<Json<Vec<MessageDto>>> {
    let q = query.q.trim();
    if q.len() < 2 || q.len() > 100 {
        return Ok(Json(vec![]));
    }
    let limit = query.limit.unwrap_or(30).clamp(1, 100);
    let pattern = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let rows: Vec<MessageRow> = sqlx::query_as(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM messages m
         WHERE m.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = $1)
           AND m.scheme = 'plain'
           -- A sealed capsule must not be searchable before it opens, or the
           -- search box becomes the way to read one early — including by the
           -- author, who is sealed out of their own capsules too.
           AND (m.unlock_at IS NULL OR m.unlock_at <= now())
           AND m.deleted_at IS NULL
           AND convert_from(m.body, 'UTF8') ILIKE $2
         ORDER BY m.id DESC LIMIT $3"
    ))
    .bind(auth.user_id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(hydrate(&state, rows).await?))
}
