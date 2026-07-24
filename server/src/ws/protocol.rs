//! The WebSocket wire protocol: one JSON-tagged enum in each direction.
//!
//! A single multiplexed socket carries messaging, presence, typing, read
//! receipts AND call signaling. That keeps mobile radios warm on one
//! connection, gives signaling the same auth as everything else, and means
//! call events can never race chat events from the same peer (per-connection
//! FIFO ordering).
//!
//! Both enums are exported to TypeScript via ts-rs, so the client compiles
//! against the exact wire shapes.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::models::{ChatDto, MessageDto, UserDto};

/// Client -> server frames.
#[derive(Debug, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum ClientMsg {
    /// Must be the first frame after connect. The token travels in a frame,
    /// not in the URL query string, so it never lands in access logs or
    /// proxy logs.
    Auth { token: String },

    SendMessage {
        chat_id: Uuid,
        /// "plain" or an E2EE scheme tag like "x25519-v1".
        #[serde(default = "default_scheme")]
        scheme: String,
        #[serde(default)]
        body: String,
        /// Client idempotency tag: retries after a dropped socket dedupe
        /// server-side instead of double-sending.
        #[ts(optional)]
        client_tag: Option<String>,
        #[serde(default)]
        #[ts(optional)]
        reply_to_id: Option<Uuid>,
        #[serde(default)]
        #[ts(optional)]
        attachment_id: Option<Uuid>,
    },
    MarkRead { chat_id: Uuid, message_id: Uuid },
    Typing { chat_id: Uuid },

    // --- WebRTC signaling (opaque SDP/ICE relay; server validates routing,
    // never parses SDP) ---
    CallOffer {
        call_id: Uuid,
        to_user_id: Uuid,
        sdp: String,
        /// "audio" | "video" — shown on the ring screen and in call logs.
        #[serde(default = "default_media")]
        media: String,
    },
    CallAnswer { call_id: Uuid, sdp: String },
    CallIce { call_id: Uuid, candidate: serde_json::Value },
    CallEnd {
        call_id: Uuid,
        #[ts(optional)]
        reason: Option<String>,
    },
    /// Re-bind an active call to a fresh socket after a WS blip. Media is
    /// P2P and survives the drop; this keeps signaling (renegotiation,
    /// hangup) working instead of tearing the call down.
    CallResume { call_id: Uuid },

    Ping,
}

fn default_scheme() -> String {
    "plain".into()
}

fn default_media() -> String {
    "audio".into()
}

/// Server -> client frames.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum ServerEvent {
    /// Auth accepted; the socket is live.
    Ready { user_id: Uuid },

    Message { message: MessageDto },
    /// Echo to the sender confirming persistence (carries the client_tag so
    /// optimistic UI can reconcile).
    MessageAck {
        #[ts(optional)]
        client_tag: Option<String>,
        message: MessageDto,
    },
    Read { chat_id: Uuid, user_id: Uuid, message_id: Uuid },
    Typing { chat_id: Uuid, user_id: Uuid },
    Reaction { chat_id: Uuid, message_id: Uuid, user_id: Uuid, emoji: String, added: bool },
    Presence {
        user_id: Uuid,
        online: bool,
        #[ts(optional)]
        last_seen_at: Option<DateTime<Utc>>,
    },
    ChatCreated { chat: ChatDto },

    CallOffer { call_id: Uuid, from: UserDto, sdp: String, media: String },
    CallAnswer { call_id: Uuid, sdp: String },
    CallIce { call_id: Uuid, candidate: serde_json::Value },
    CallEnd { call_id: Uuid, reason: String },
    /// The offer could not even start ringing (offline peer, busy peer, …).
    CallUnavailable { call_id: Uuid, reason: String },

    Pong,
    Error { code: String, message: String },
}
