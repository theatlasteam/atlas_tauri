//! In-memory connection registry: user -> live device connections, plus active
//! call state. This is deliberately process-local; to scale past one node the
//! fan-out functions here grow a Redis/NATS pub-sub backend without touching
//! callers (see README "scaling" notes).

use std::sync::atomic::{AtomicU64, Ordering};

use dashmap::DashMap;
use tokio::sync::mpsc;
use uuid::Uuid;

use super::protocol::ServerEvent;

/// Per-connection outbound queue depth. A client that stops reading for long
/// enough to fill this is disconnected rather than allowed to buffer the
/// server into the ground — reconnect-and-resync is the recovery path, and it
/// is a path the client must have anyway for flaky mobile networks.
const CONN_QUEUE: usize = 256;

pub struct Conn {
    pub conn_id: u64,
    pub session_id: Uuid,
    tx: mpsc::Sender<ServerEvent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CallPhase {
    Ringing,
    Active,
}

#[derive(Debug, Clone)]
pub struct CallState {
    pub caller: Uuid,
    pub caller_conn: u64,
    pub callee: Uuid,
    /// Set when a specific device answers; later signaling routes only there.
    pub callee_conn: Option<u64>,
    pub phase: CallPhase,
    /// "audio" | "video" — echoed to the ring screen and call logs.
    pub media: String,
    pub answered_at: Option<std::time::Instant>,
    /// When the call was placed. Used by the stale-call reaper to avoid
    /// collecting a call that was only created moments ago.
    pub created_at: std::time::Instant,
    /// The caller's SDP offer, retained for the duration of the ring so a
    /// device woken by a push notification can be handed the pending call when
    /// its socket connects (ws::calls::replay_pending). Without this, a phone
    /// whose app had been killed would have nothing to answer.
    pub offer_sdp: String,
}

#[derive(Default)]
pub struct Hub {
    conns: DashMap<Uuid, Vec<Conn>>,
    pub calls: DashMap<Uuid, CallState>,
    next_conn_id: AtomicU64,
}

impl Hub {
    /// Register a device connection. Returns (conn_id, came_online) where
    /// came_online is true if the user had no other live connections.
    pub fn register(
        &self,
        user_id: Uuid,
        session_id: Uuid,
        tx: mpsc::Sender<ServerEvent>,
    ) -> (u64, bool) {
        let conn_id = self.next_conn_id.fetch_add(1, Ordering::Relaxed);
        let mut entry = self.conns.entry(user_id).or_default();
        let came_online = entry.is_empty();
        entry.push(Conn { conn_id, session_id, tx });
        (conn_id, came_online)
    }

    /// Remove a connection. Returns true if the user is now fully offline.
    pub fn unregister(&self, user_id: Uuid, conn_id: u64) -> bool {
        let mut went_offline = false;
        self.conns.remove_if_mut(&user_id, |_, conns| {
            conns.retain(|c| c.conn_id != conn_id);
            went_offline = conns.is_empty();
            went_offline
        });
        went_offline
    }

    /// Drop every connection belonging to a session (used when the session is
    /// revoked, so logout takes effect immediately). Dropping the sender ends
    /// the connection's writer task, which tears the socket down.
    pub fn disconnect_session(&self, session_id: Uuid) {
        for mut entry in self.conns.iter_mut() {
            entry.value_mut().retain(|c| c.session_id != session_id);
        }
    }

    pub fn is_online(&self, user_id: Uuid) -> bool {
        self.conns.get(&user_id).map(|c| !c.is_empty()).unwrap_or(false)
    }

    /// Send to every live device of a user. Connections whose queue is full or
    /// closed are pruned (their writer task then ends and the socket closes).
    pub fn send_to_user(&self, user_id: Uuid, event: &ServerEvent) {
        if let Some(mut conns) = self.conns.get_mut(&user_id) {
            conns.retain(|c| match c.tx.try_send(event.clone()) {
                Ok(()) => true,
                Err(mpsc::error::TrySendError::Full(_)) => {
                    tracing::warn!(%user_id, conn = c.conn_id, "slow consumer, dropping connection");
                    false
                }
                Err(mpsc::error::TrySendError::Closed(_)) => false,
            });
        }
    }

    /// Send to one specific device connection of a user.
    pub fn send_to_conn(&self, user_id: Uuid, conn_id: u64, event: &ServerEvent) {
        if let Some(mut conns) = self.conns.get_mut(&user_id) {
            conns.retain(|c| {
                if c.conn_id != conn_id {
                    return true;
                }
                !c.tx.try_send(event.clone()).is_err()
            });
        }
    }

    /// Send to all of a user's devices except one (e.g. "answered elsewhere").
    pub fn send_to_other_conns(&self, user_id: Uuid, except_conn: u64, event: &ServerEvent) {
        if let Some(mut conns) = self.conns.get_mut(&user_id) {
            conns.retain(|c| {
                if c.conn_id == except_conn {
                    return true;
                }
                !c.tx.try_send(event.clone()).is_err()
            });
        }
    }

    pub fn conn_queue_capacity() -> usize {
        CONN_QUEUE
    }

    /// True if the user is a participant in any active (answered) call —
    /// used for busy signaling.
    pub fn user_in_active_call(&self, user_id: Uuid) -> bool {
        self.calls.iter().any(|c| {
            c.phase == CallPhase::Active && (c.caller == user_id || c.callee == user_id)
        })
    }
}
