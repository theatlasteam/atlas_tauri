//! Server-side call signaling.
//!
//! The server is a *validated relay*: it never parses SDP or ICE payloads, but
//! it does enforce who may signal whom (you can only call users you share a
//! chat with; only call participants may relay ICE), tracks ring/active state
//! for busy handling and ring timeouts, and routes post-answer signaling to
//! the specific device that answered (multi-device correctness).
//!
//! Glare (both sides calling simultaneously) is resolved client-side with
//! WebRTC "perfect negotiation": the peer with the lexicographically smaller
//! user id acts as the polite peer. The server just relays both offers.
//!
//! When a call between DM peers ends, the server writes a `call-log` message
//! into their DM (outcome, media kind, duration) through the normal message
//! path, so call history appears in chat on every device including offline
//! ones catching up later.

use std::time::{Duration, Instant};

use uuid::Uuid;

use crate::auth::USER_COLUMNS;
use crate::models::{UserDto, UserRow};
use crate::routes::messages::{persist_and_fanout, NewMessage};
use crate::state::AppState;
use crate::ws::hub::{CallPhase, CallState};
use crate::ws::protocol::ServerEvent;

const RING_TIMEOUT: Duration = Duration::from_secs(60);

/// True if the two users share at least one chat — the authorization rule for
/// placing a call (prevents cold-call spam and SDP-probe abuse from strangers).
async fn share_chat(state: &AppState, a: Uuid, b: Uuid) -> sqlx::Result<bool> {
    sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM chat_members ma
            JOIN chat_members mb ON ma.chat_id = mb.chat_id
            WHERE ma.user_id = $1 AND mb.user_id = $2
         )",
    )
    .bind(a)
    .bind(b)
    .fetch_one(&state.db)
    .await
}

pub async fn handle_offer(
    state: &AppState,
    user_id: Uuid,
    conn_id: u64,
    call_id: Uuid,
    to_user_id: Uuid,
    sdp: String,
    media: String,
) {
    let reject = |reason: &str| {
        state.hub.send_to_conn(
            user_id,
            conn_id,
            &ServerEvent::CallUnavailable { call_id, reason: reason.into() },
        );
    };

    if to_user_id == user_id {
        return reject("self_call");
    }
    if !matches!(media.as_str(), "audio" | "video") {
        return reject("bad_media");
    }
    // A repeated offer on an *active* call from a participant is an ICE
    // restart / renegotiation: relay it to the other side's live device.
    if let Some(call) = state.hub.calls.get(&call_id).map(|c| c.clone()) {
        if call.phase == CallPhase::Active {
            let caller_dto: Result<UserRow, _> = sqlx::query_as(&format!(
                "SELECT {USER_COLUMNS} FROM users WHERE id = $1"
            ))
            .bind(user_id)
            .fetch_one(&state.db)
            .await;
            let Ok(from) = caller_dto else { return reject("internal") };
            let event =
                ServerEvent::CallOffer { call_id, from: UserDto::from(from), sdp, media };
            if user_id == call.caller {
                if let Some(cc) = call.callee_conn {
                    state.hub.send_to_conn(call.callee, cc, &event);
                }
            } else if user_id == call.callee {
                state.hub.send_to_conn(call.caller, call.caller_conn, &event);
            }
            return;
        }
        return reject("duplicate_call_id");
    }
    match share_chat(state, user_id, to_user_id).await {
        Ok(true) => {}
        Ok(false) => return reject("not_allowed"),
        Err(e) => {
            tracing::error!(error = %e, "share_chat query failed");
            return reject("internal");
        }
    }
    if !state.hub.is_online(to_user_id) {
        return reject("offline");
    }
    if state.hub.user_in_active_call(to_user_id) {
        return reject("busy");
    }

    let caller: UserRow = match sqlx::query_as(&format!(
        "SELECT {USER_COLUMNS} FROM users WHERE id = $1"
    ))
    .bind(user_id)
    .fetch_one(&state.db)
    .await
    {
        Ok(u) => u,
        Err(e) => {
            tracing::error!(error = %e, "caller lookup failed");
            return reject("internal");
        }
    };

    state.hub.calls.insert(
        call_id,
        CallState {
            caller: user_id,
            caller_conn: conn_id,
            callee: to_user_id,
            callee_conn: None,
            phase: CallPhase::Ringing,
            media: media.clone(),
            answered_at: None,
        },
    );

    // Ring every device the callee has connected; the first to answer wins.
    state.hub.send_to_user(
        to_user_id,
        &ServerEvent::CallOffer { call_id, from: UserDto::from(caller), sdp, media },
    );

    // Ring timeout: if nobody answered, tear the call down on both ends.
    let st = state.clone();
    tokio::spawn(async move {
        tokio::time::sleep(RING_TIMEOUT).await;
        let still_ringing = st
            .hub
            .calls
            .get(&call_id)
            .map(|c| c.phase == CallPhase::Ringing)
            .unwrap_or(false);
        if still_ringing {
            if let Some((_, call)) = st.hub.calls.remove(&call_id) {
                let end = ServerEvent::CallEnd { call_id, reason: "timeout".into() };
                st.hub.send_to_conn(call.caller, call.caller_conn, &end);
                st.hub.send_to_user(call.callee, &end);
                log_call(&st, call, "missed");
            }
        }
    });
}

pub fn handle_answer(state: &AppState, user_id: Uuid, conn_id: u64, call_id: Uuid, sdp: String) {
    let Some(mut call) = state.hub.calls.get_mut(&call_id) else {
        return; // already ended/timed out; client will get no answer and give up
    };
    // Renegotiation answer on an active call: relay to the other side.
    if call.phase == CallPhase::Active {
        let event = ServerEvent::CallAnswer { call_id, sdp };
        if user_id == call.caller && conn_id == call.caller_conn {
            let (callee, cc) = (call.callee, call.callee_conn);
            drop(call);
            if let Some(cc) = cc {
                state.hub.send_to_conn(callee, cc, &event);
            }
        } else if user_id == call.callee && call.callee_conn == Some(conn_id) {
            let (caller, caller_conn) = (call.caller, call.caller_conn);
            drop(call);
            state.hub.send_to_conn(caller, caller_conn, &event);
        }
        return;
    }
    if call.callee != user_id || call.phase != CallPhase::Ringing {
        return;
    }
    call.phase = CallPhase::Active;
    call.callee_conn = Some(conn_id);
    call.answered_at = Some(Instant::now());
    let (caller, caller_conn, callee) = (call.caller, call.caller_conn, call.callee);
    drop(call);

    state
        .hub
        .send_to_conn(caller, caller_conn, &ServerEvent::CallAnswer { call_id, sdp });
    // Stop ringing on the callee's other devices.
    state.hub.send_to_other_conns(
        callee,
        conn_id,
        &ServerEvent::CallEnd { call_id, reason: "answered_elsewhere".into() },
    );
}

pub fn handle_ice(
    state: &AppState,
    user_id: Uuid,
    conn_id: u64,
    call_id: Uuid,
    candidate: serde_json::Value,
) {
    let Some(call) = state.hub.calls.get(&call_id).map(|c| c.clone()) else {
        return;
    };
    let event = ServerEvent::CallIce { call_id, candidate };

    if user_id == call.caller && conn_id == call.caller_conn {
        match call.callee_conn {
            // Answered: route to the answering device only.
            Some(cc) => state.hub.send_to_conn(call.callee, cc, &event),
            // Still ringing: trickle to all devices; clients buffer candidates
            // until they have a remote description.
            None => state.hub.send_to_user(call.callee, &event),
        }
    } else if user_id == call.callee && (call.callee_conn == Some(conn_id)) {
        state.hub.send_to_conn(call.caller, call.caller_conn, &event);
    }
    // Anything else (non-participant, stale device) is dropped silently.
}

pub fn handle_end(
    state: &AppState,
    user_id: Uuid,
    conn_id: u64,
    call_id: Uuid,
    reason: Option<String>,
) {
    let Some(call) = state.hub.calls.get(&call_id).map(|c| c.clone()) else {
        return;
    };
    let caller_side = user_id == call.caller && conn_id == call.caller_conn;
    // Before answer, any callee device may decline; after answer only the
    // device in the call may hang up.
    let callee_side = user_id == call.callee
        && call.callee_conn.is_none_or(|cc| cc == conn_id);
    if !caller_side && !callee_side {
        return;
    }

    state.hub.calls.remove(&call_id);
    let reason = reason.unwrap_or_else(|| "hangup".into());
    let event = ServerEvent::CallEnd { call_id, reason };
    if caller_side {
        match call.callee_conn {
            Some(cc) => state.hub.send_to_conn(call.callee, cc, &event),
            None => state.hub.send_to_user(call.callee, &event), // cancel ring everywhere
        }
    } else {
        state.hub.send_to_conn(call.caller, call.caller_conn, &event);
        if call.callee_conn.is_none() {
            // A decline while ringing also stops other callee devices.
            state.hub.send_to_other_conns(call.callee, conn_id, &event);
        }
    }

    let outcome = match (call.phase, caller_side) {
        (CallPhase::Active, _) => "completed",
        (CallPhase::Ringing, true) => "canceled",
        (CallPhase::Ringing, false) => "declined",
    };
    log_call(state, call, outcome);
}

/// Re-bind an active call to a fresh connection after a WS reconnect,
/// cancelling the disconnect grace timer's effect (it checks conn ids).
pub fn handle_resume(state: &AppState, user_id: Uuid, conn_id: u64, call_id: Uuid) {
    if let Some(mut call) = state.hub.calls.get_mut(&call_id) {
        if call.phase != CallPhase::Active {
            return;
        }
        if call.caller == user_id {
            call.caller_conn = conn_id;
        } else if call.callee == user_id && call.callee_conn.is_some() {
            call.callee_conn = Some(conn_id);
        }
    }
}

/// How long an *active* call survives a participant's socket death before the
/// server gives up on them. P2P media typically keeps flowing through a WS
/// blip; the client re-binds with call_resume on reconnect.
const RESUME_GRACE: Duration = Duration::from_secs(30);

/// Called when a socket dies: end ringing calls this device was party to
/// immediately; give active calls a resume grace window.
pub fn handle_disconnect(state: &AppState, user_id: Uuid, conn_id: u64) {
    let involved: Vec<(Uuid, CallState)> = state
        .hub
        .calls
        .iter()
        .filter(|c| {
            (c.caller == user_id && c.caller_conn == conn_id)
                || (c.callee == user_id && c.callee_conn == Some(conn_id))
                || (c.callee == user_id
                    && c.phase == CallPhase::Ringing
                    && !state.hub.is_online(user_id))
        })
        .map(|c| (*c.key(), c.clone()))
        .collect();

    for (call_id, snapshot) in involved {
        if snapshot.phase == CallPhase::Active {
            // Grace period: if this side hasn't re-bound (conn id unchanged)
            // when it expires, end the call for real.
            let st = state.clone();
            let was_caller = snapshot.caller == user_id && snapshot.caller_conn == conn_id;
            tokio::spawn(async move {
                tokio::time::sleep(RESUME_GRACE).await;
                let stale = st.hub.calls.get(&call_id).map(|c| {
                    if was_caller {
                        c.caller_conn == conn_id
                    } else {
                        c.callee_conn == Some(conn_id)
                    }
                });
                if stale == Some(true) {
                    if let Some((_, call)) = st.hub.calls.remove(&call_id) {
                        let event =
                            ServerEvent::CallEnd { call_id, reason: "peer_disconnected".into() };
                        if was_caller {
                            if let Some(cc) = call.callee_conn {
                                st.hub.send_to_conn(call.callee, cc, &event);
                            }
                        } else {
                            st.hub.send_to_conn(call.caller, call.caller_conn, &event);
                        }
                        log_call(&st, call, "completed");
                    }
                }
            });
            continue;
        }

        if let Some((_, call)) = state.hub.calls.remove(&call_id) {
            let event = ServerEvent::CallEnd { call_id, reason: "peer_disconnected".into() };
            if call.caller == user_id && call.caller_conn == conn_id {
                match call.callee_conn {
                    Some(cc) => state.hub.send_to_conn(call.callee, cc, &event),
                    None => state.hub.send_to_user(call.callee, &event),
                }
            } else {
                state.hub.send_to_conn(call.caller, call.caller_conn, &event);
            }
            log_call(state, call, "missed");
        }
    }
}

/// Persist a call-log message into the callers' DM (if one exists) through the
/// normal message path, so it fans out and syncs like any other message.
/// Outcomes: completed | missed | declined | canceled.
fn log_call(state: &AppState, call: CallState, outcome: &str) {
    let st = state.clone();
    let outcome = outcome.to_string();
    let duration_secs = call.answered_at.map(|t| t.elapsed().as_secs());
    tokio::spawn(async move {
        let (a, b) = if call.caller < call.callee {
            (call.caller, call.callee)
        } else {
            (call.callee, call.caller)
        };
        let dm_key = format!("{a}:{b}");
        let chat_id: Option<Uuid> =
            match sqlx::query_scalar("SELECT id FROM chats WHERE dm_key = $1")
                .bind(&dm_key)
                .fetch_optional(&st.db)
                .await
            {
                Ok(id) => id,
                Err(e) => {
                    tracing::warn!(error = %e, "call log dm lookup failed");
                    return;
                }
            };
        let Some(chat_id) = chat_id else { return }; // group-only contact: no DM to log into

        let body = serde_json::json!({
            "media": call.media,
            "outcome": outcome,
            "durationSecs": duration_secs,
            "calleeId": call.callee,
        })
        .to_string();
        if let Err(e) = persist_and_fanout(
            &st,
            call.caller,
            chat_id,
            NewMessage {
                scheme: "call-log",
                body: &body,
                client_tag: None,
                reply_to_id: None,
                attachment_id: None,
            },
        )
        .await
        {
            tracing::warn!(error = %e, "call log write failed");
        }
    });
}
