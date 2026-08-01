use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

// ---------- database rows ----------

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub handle: String,
    pub name: String,
    pub bio: String,
    pub status: String,
    pub avatar_color: String,
    pub avatar_initial: String,
    pub avatar_attachment_id: Option<Uuid>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub verified: bool,
    pub read_receipts: bool,
    pub last_seen_visible: bool,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MessageRow {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub author_id: Uuid,
    pub scheme: String,
    pub body: Vec<u8>,
    pub sent_at: DateTime<Utc>,
    pub reply_to_id: Option<Uuid>,
    pub attachment_id: Option<Uuid>,
    /// Time capsule: NULL for ordinary messages, otherwise the moment the body
    /// becomes readable.
    pub unlock_at: Option<DateTime<Utc>>,
    /// Last time the author rewrote the body. NULL if never edited.
    pub edited_at: Option<DateTime<Utc>>,
    /// Unsent by its author. The row survives as a tombstone so reply chains
    /// and read cursors stay valid; the body is wiped on write, not on read.
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AttachmentRow {
    pub id: Uuid,
    pub kind: String,
    pub mime: String,
    pub size_bytes: i64,
    pub filename: String,
    pub duration_ms: Option<i32>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

// ---------- API DTOs (camelCase, mirrored to TypeScript via ts-rs) ----------

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UserDto {
    pub id: Uuid,
    pub handle: String,
    pub name: String,
    pub bio: String,
    pub status: String,
    pub avatar_color: String,
    pub avatar_initial: String,
    /// Whether the user has uploaded a photo — if true, fetch it from
    /// `GET /api/users/{id}/avatar`. avatarColor/avatarInitial remain the
    /// fallback (no photo yet, or it failed to load).
    pub has_avatar: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub last_seen_at: Option<DateTime<Utc>>,
    /// Verified badge (checkmark). Granting/revoking is restricted to the
    /// "atlas" account — see routes/users.rs::require_atlas.
    pub verified: bool,
    /// Privacy switches, owned by the user they describe. They are not secrets
    /// (both are inferable from behaviour anyway), and shipping them on every
    /// user lets a viewer explain the absence of a receipt or a last-seen
    /// instead of rendering a silent blank.
    pub read_receipts: bool,
    pub last_seen_visible: bool,
}

impl From<UserRow> for UserDto {
    fn from(u: UserRow) -> Self {
        Self {
            id: u.id,
            handle: u.handle,
            name: u.name,
            bio: u.bio,
            status: u.status,
            avatar_color: u.avatar_color,
            avatar_initial: u.avatar_initial,
            has_avatar: u.avatar_attachment_id.is_some(),
            // The single choke point for "Last seen": stripping it during the
            // row -> DTO conversion means no route can leak it by forgetting
            // to check, however the user was loaded.
            last_seen_at: u.last_seen_at.filter(|_| u.last_seen_visible),
            verified: u.verified,
            read_receipts: u.read_receipts,
            last_seen_visible: u.last_seen_visible,
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AttachmentDto {
    pub id: Uuid,
    /// "image" | "voice" | "file"
    pub kind: String,
    pub mime: String,
    #[ts(type = "number")]
    pub size_bytes: i64,
    pub filename: String,
    pub duration_ms: Option<i32>,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

impl From<AttachmentRow> for AttachmentDto {
    fn from(a: AttachmentRow) -> Self {
        Self {
            id: a.id,
            kind: a.kind,
            mime: a.mime,
            size_bytes: a.size_bytes,
            filename: a.filename,
            duration_ms: a.duration_ms,
            width: a.width,
            height: a.height,
        }
    }
}

/// One emoji on one message with everyone who reacted with it.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReactionDto {
    pub emoji: String,
    pub user_ids: Vec<Uuid>,
}

/// Compact form of the message a reply points at (enough to render the
/// quoted preview without an extra round-trip).
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ReplyPreviewDto {
    pub id: Uuid,
    pub author_id: Uuid,
    pub scheme: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MessageDto {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub author_id: Uuid,
    /// "plain" | "call-log" | E2EE schemes ("x25519-v1", ...)
    pub scheme: String,
    /// UTF-8 text for text schemes, base64 ciphertext otherwise.
    pub body: String,
    pub sent_at: DateTime<Utc>,
    pub reply_to: Option<ReplyPreviewDto>,
    pub attachment: Option<AttachmentDto>,
    pub reactions: Vec<ReactionDto>,
    /// Time capsule: when this message's body becomes readable. Absent for
    /// ordinary messages, and set (past or future) for capsules.
    ///
    /// Omitted rather than sent as null, because `#[ts(optional)]` generates
    /// `unlockAt?: string` — a type that promises the key can be missing, so
    /// the wire has to actually honour that.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub unlock_at: Option<DateTime<Utc>>,
    /// True while `body`/`attachment` are being withheld because the capsule
    /// has not opened yet. The client renders the countdown from `unlock_at`
    /// and refetches the message when it reaches zero.
    pub sealed: bool,
    /// When the author last rewrote this message; absent if never edited.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub edited_at: Option<DateTime<Utc>>,
    /// Unsent by its author. `body` and `attachment` are empty; the row is
    /// kept so replies pointing at it, and read cursors past it, still resolve.
    pub deleted: bool,
}

impl From<MessageRow> for MessageDto {
    fn from(m: MessageRow) -> Self {
        // An unsent message keeps its row but loses its contents. The wipe
        // happens at DELETE time, so this is belt-and-braces: even a row that
        // somehow still held bytes could not serve them.
        let deleted = m.deleted_at.is_some();
        let body = if deleted { String::new() } else { encode_body(&m.scheme, &m.body) };
        Self {
            id: m.id,
            chat_id: m.chat_id,
            author_id: m.author_id,
            scheme: m.scheme,
            body,
            sent_at: m.sent_at,
            reply_to: None,   // hydrated separately where needed
            attachment: None, // hydrated separately where needed
            reactions: Vec::new(),
            unlock_at: m.unlock_at,
            sealed: false, // decided by seal(), once the clock is known
            edited_at: m.edited_at,
            deleted,
        }
    }
}

impl MessageDto {
    /// Withhold a still-shut time capsule's contents — from everyone.
    ///
    /// This is what makes a capsule more than a client-side animation: the
    /// bytes never leave the database until `unlock_at`, so an early peek
    /// would need database access, not a patched client.
    ///
    /// The author is sealed out too, which is the whole point of the
    /// metaphor — you bury it, you don't get to keep lifting the lid. It also
    /// means there is exactly one version of a capsule on the wire rather
    /// than a per-viewer one, so no call site can leak it by picking the
    /// wrong audience.
    ///
    /// The quoted reply preview and the reaction tally stay visible — neither
    /// is part of the sealed content, and hiding them would make the bubble
    /// jump around when it opens.
    pub fn seal(mut self, now: DateTime<Utc>) -> Self {
        if self.unlock_at.is_some_and(|at| at > now) {
            self.body = String::new();
            self.attachment = None;
            self.sealed = true;
        }
        self
    }
}

/// Schemes whose bodies are server-readable UTF-8 text. Everything else is
/// opaque ciphertext and travels base64-encoded.
pub fn is_text_scheme(scheme: &str) -> bool {
    matches!(scheme, "plain" | "call-log" | "space")
}

pub fn encode_body(scheme: &str, body: &[u8]) -> String {
    if is_text_scheme(scheme) {
        String::from_utf8_lossy(body).into_owned()
    } else {
        B64.encode(body)
    }
}

pub fn decode_body(scheme: &str, body: &str) -> Result<Vec<u8>, String> {
    if is_text_scheme(scheme) {
        Ok(body.as_bytes().to_vec())
    } else {
        B64.decode(body).map_err(|_| "body must be base64 for non-plain schemes".into())
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ChatDto {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub avatar_color: String,
    pub avatar_initial: String,
    /// For DMs: the other participant (used by the client for calls/presence).
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub peer_user_id: Option<Uuid>,
    pub last_message: Option<MessageDto>,
    #[ts(type = "number")]
    pub unread_count: i64,
    pub muted: bool,
    pub online: bool,
    pub folder_ids: Vec<Uuid>,
    #[ts(type = "number")]
    pub member_count: i64,
    /// For DMs: the peer's read cursor (message id), so sent messages can
    /// render seen/unseen state after a fresh load, not only from live events.
    pub peer_read_up_to: Option<Uuid>,
    /// For DMs: whether the peer has a photo (fetch via their user avatar
    /// endpoint). Always false for groups — group photos aren't supported yet.
    pub peer_has_avatar: bool,
    /// For DMs: whether the peer carries the verified checkmark, so the chat
    /// list and appbar can show it without fetching the full user. Always
    /// false for groups.
    pub peer_verified: bool,
    /// For DMs: when the peer was last online, so the chat header can say so
    /// instead of guessing. NULL for groups, for a peer who has never been
    /// seen, and for one who turned "Last seen" off.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub peer_last_seen_at: Option<DateTime<Utc>>,
    /// For DMs: whether I've blocked the peer. Always false for groups.
    pub blocked_by_me: bool,
    /// For DMs: whether the peer has blocked me. Always false for groups.
    pub blocked_me: bool,
}

/// A user I've blocked, as returned by GET /api/blocks.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct BlockDto {
    pub user: UserDto,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct FolderDto {
    pub id: Uuid,
    pub name: String,
}

/// One Atlas Space: a self-contained HTML mini-app generated by prompting
/// the inference gateway (see spaces.rs). `html` is the whole app — inline
/// `<style>`/`<script>`, no build step — meant to be dropped straight into a
/// sandboxed `<iframe srcdoc>` on the client.
#[derive(Debug, Clone, sqlx::FromRow, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SpaceDto {
    pub id: Uuid,
    pub creator_id: Uuid,
    /// Set when this Space is a remix — the Space whose HTML was given to
    /// the model as context alongside the new instruction.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub parent_space_id: Option<Uuid>,
    pub html: String,
    pub created_at: DateTime<Utc>,
}

// ---------- request payloads ----------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMePayload {
    pub name: Option<String>,
    pub bio: Option<String>,
    pub status: Option<String>,
    pub avatar_color: Option<String>,
    pub avatar_initial: Option<String>,
    pub read_receipts: Option<bool>,
    pub last_seen_visible: Option<bool>,
}
