pub mod calls;
pub mod hub;
pub mod protocol;

use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::auth::{authenticate, AuthUser};
use crate::routes::messages::{persist_and_fanout, NewMessage};
use crate::state::AppState;
use protocol::{ClientMsg, ServerEvent};

/// How long the client has to send its Auth frame after connecting.
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
/// Reader considers the connection dead if nothing (including pong frames)
/// arrives for this long. The writer pings every PING_INTERVAL, so a healthy
/// link always has traffic well inside the window.
const IDLE_TIMEOUT: Duration = Duration::from_secs(75);
const PING_INTERVAL: Duration = Duration::from_secs(30);
/// Ceiling on a live-typing preview, matching the message body limit. A draft
/// arrives as ciphertext, which is ~4/3 the plaintext size, so this is roomier
/// than it looks.
const MAX_TYPING_PREVIEW_BYTES: usize = 64 * 1024;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(move |socket| session(socket, state))
}

async fn session(mut socket: WebSocket, state: AppState) {
    // --- auth handshake: first frame must be {"type":"auth","token":...} ---
    let auth = match tokio::time::timeout(AUTH_TIMEOUT, socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) => match serde_json::from_str::<ClientMsg>(&text) {
            Ok(ClientMsg::Auth { token }) => authenticate(&state.db, &token).await.ok(),
            _ => None,
        },
        _ => None,
    };
    let Some(AuthUser { user_id, session_id }) = auth else {
        let _ = socket
            .send(Message::Text(
                serde_json::to_string(&ServerEvent::Error {
                    code: "unauthorized".into(),
                    message: "expected valid auth frame".into(),
                })
                .unwrap_or_default()
                .into(),
            ))
            .await;
        let _ = socket.send(Message::Close(None)).await;
        return;
    };

    let (tx, mut rx) = mpsc::channel::<ServerEvent>(hub::Hub::conn_queue_capacity());
    let (conn_id, came_online) = state.hub.register(user_id, session_id, tx);
    tracing::info!(%user_id, conn_id, "ws connected");

    state.hub.send_to_conn(user_id, conn_id, &ServerEvent::Ready { user_id });
    if came_online {
        broadcast_presence(&state, user_id, true).await;
    }
    // A push may have woken this app for a call that started before the socket
    // existed — hand this device the offer it missed.
    calls::replay_pending(&state, user_id, conn_id).await;

    // Writer task: owns the sink, drains the hub queue, emits keepalive pings.
    // The hub holds the only Sender, so when the hub drops this connection
    // (slow consumer, revoked session) rx yields None and the socket closes.
    let (mut sink, mut stream) = socket.split();
    let writer = tokio::spawn(async move {
        let mut ping = tokio::time::interval(PING_INTERVAL);
        ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                event = rx.recv() => match event {
                    Some(event) => {
                        let Ok(json) = serde_json::to_string(&event) else { continue };
                        if sink.send(Message::Text(json.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                },
                _ = ping.tick() => {
                    if sink.send(Message::Ping(Vec::new().into())).await.is_err() {
                        break;
                    }
                }
            }
        }
        let _ = sink.close().await;
    });

    // Reader loop with idle timeout.
    loop {
        let frame = match tokio::time::timeout(IDLE_TIMEOUT, stream.next()).await {
            Err(_elapsed) => break,               // dead link (mobile radio dropped)
            Ok(None) | Ok(Some(Err(_))) => break, // closed
            Ok(Some(Ok(frame))) => frame,
        };
        match frame {
            Message::Text(text) => match serde_json::from_str::<ClientMsg>(&text) {
                Ok(msg) => handle_client_msg(&state, user_id, conn_id, msg).await,
                Err(e) => state.hub.send_to_conn(
                    user_id,
                    conn_id,
                    &ServerEvent::Error {
                        code: "bad_frame".into(),
                        message: e.to_string(),
                    },
                ),
            },
            Message::Close(_) => break,
            // Ping/Pong/Binary: pings are auto-answered by the stack; pongs
            // matter only as liveness, which the timeout above already counts.
            _ => {}
        }
    }

    // --- cleanup ---
    // Vacate the room before deregistering, or co-presence would show this
    // device sitting in a chat it can no longer be reached in.
    let _ = handle_focus(&state, user_id, conn_id, None).await;
    let went_offline = state.hub.unregister(user_id, conn_id);
    calls::handle_disconnect(&state, user_id, conn_id);
    writer.abort();
    if went_offline {
        let _ = sqlx::query("UPDATE users SET last_seen_at = now() WHERE id = $1")
            .bind(user_id)
            .execute(&state.db)
            .await;
        broadcast_presence(&state, user_id, false).await;
    }
    tracing::info!(%user_id, conn_id, "ws disconnected");
}

/// "Who invoked what" for the WebSocket half of the protocol — REST commands
/// are logged in auth.rs's `AuthUser` extractor, but calls and messages
/// mostly ride this socket instead, so that alone doesn't show the whole
/// picture (e.g. a `call_offer` that never shows up here at all means it
/// never left the client, not a server-side problem).
fn log_ws_command(user_id: Uuid, conn_id: u64, msg: &ClientMsg) {
    match msg {
        ClientMsg::Auth { .. } | ClientMsg::Ping => {} // logged elsewhere / too frequent to be useful
        ClientMsg::SendMessage { chat_id, scheme, .. } => {
            tracing::info!(%user_id, conn_id, %chat_id, scheme, "ws command: send_message");
        }
        ClientMsg::MarkRead { chat_id, message_id } => {
            tracing::info!(%user_id, conn_id, %chat_id, %message_id, "ws command: mark_read");
        }
        ClientMsg::Typing { chat_id, .. } => {
            tracing::info!(%user_id, conn_id, %chat_id, "ws command: typing");
        }
        ClientMsg::Focus { chat_id } => {
            tracing::info!(%user_id, conn_id, ?chat_id, "ws command: focus");
        }
        ClientMsg::CallOffer { call_id, to_user_id, media, .. } => {
            tracing::info!(%user_id, conn_id, %call_id, %to_user_id, media, "ws command: call_offer");
        }
        ClientMsg::CallAnswer { call_id, .. } => {
            tracing::info!(%user_id, conn_id, %call_id, "ws command: call_answer");
        }
        ClientMsg::CallIce { call_id, .. } => {
            tracing::info!(%user_id, conn_id, %call_id, "ws command: call_ice");
        }
        ClientMsg::CallEnd { call_id, reason } => {
            tracing::info!(%user_id, conn_id, %call_id, ?reason, "ws command: call_end");
        }
        ClientMsg::CallResume { call_id } => {
            tracing::info!(%user_id, conn_id, %call_id, "ws command: call_resume");
        }
    }
}

async fn handle_client_msg(state: &AppState, user_id: Uuid, conn_id: u64, msg: ClientMsg) {
    log_ws_command(user_id, conn_id, &msg);
    match msg {
        ClientMsg::Auth { .. } => {} // already authed; ignore

        ClientMsg::SendMessage {
            chat_id,
            scheme,
            body,
            client_tag,
            reply_to_id,
            attachment_id,
            unlock_at,
        } => {
            let new = NewMessage {
                scheme: &scheme,
                body: &body,
                client_tag: client_tag.clone(),
                reply_to_id,
                attachment_id,
                unlock_at,
            };
            match persist_and_fanout(state, user_id, chat_id, new).await {
                Ok(message) => state.hub.send_to_conn(
                    user_id,
                    conn_id,
                    &ServerEvent::MessageAck { client_tag, message },
                ),
                Err(e) => state.hub.send_to_conn(
                    user_id,
                    conn_id,
                    &ServerEvent::Error { code: "send_failed".into(), message: e.to_string() },
                ),
            }
        }

        ClientMsg::MarkRead { chat_id, message_id } => {
            if let Err(e) = mark_read(state, user_id, chat_id, message_id).await {
                tracing::warn!(error = %e, "mark_read failed");
            }
        }

        ClientMsg::Typing { chat_id, preview, scheme } => {
            // A live-typing preview is a message body in every respect that
            // matters here, so it gets the same ceiling. Anything larger is a
            // client bug or an attempt to use the typing channel as unmetered
            // transport, and is dropped rather than relayed.
            let preview = preview.filter(|p| p.len() <= MAX_TYPING_PREVIEW_BYTES);
            let scheme = preview.as_ref().and(scheme);
            if let Ok(members) = chat_member_ids(state, chat_id).await {
                if members.contains(&user_id) {
                    let event = ServerEvent::Typing { chat_id, user_id, preview, scheme };
                    for member in members.into_iter().filter(|m| *m != user_id) {
                        state.hub.send_to_user(member, &event);
                    }
                }
            }
        }

        ClientMsg::Focus { chat_id } => {
            if let Err(e) = handle_focus(state, user_id, conn_id, chat_id).await {
                tracing::warn!(error = %e, "focus update failed");
            }
        }

        ClientMsg::CallOffer { call_id, to_user_id, sdp, media } => {
            calls::handle_offer(state, user_id, conn_id, call_id, to_user_id, sdp, media).await;
        }
        ClientMsg::CallAnswer { call_id, sdp } => {
            calls::handle_answer(state, user_id, conn_id, call_id, sdp);
        }
        ClientMsg::CallIce { call_id, candidate } => {
            calls::handle_ice(state, user_id, conn_id, call_id, candidate);
        }
        ClientMsg::CallEnd { call_id, reason } => {
            calls::handle_end(state, user_id, conn_id, call_id, reason);
        }
        ClientMsg::CallResume { call_id } => {
            calls::handle_resume(state, user_id, conn_id, call_id);
        }

        ClientMsg::Ping => state.hub.send_to_conn(user_id, conn_id, &ServerEvent::Pong),
    }
}

/// Move a connection's co-presence marker, announcing both halves of the move.
///
/// Announcing a departure from the *previous* chat is what keeps the other
/// side's "in the chat with you" honest: without it, walking away from a
/// conversation would leave you apparently standing in it until you
/// disconnected entirely.
///
/// Membership is checked before anything is announced, so this can't be used
/// to advertise presence in a stranger's chat — or to discover, by watching
/// who responds, that a chat id exists at all.
async fn handle_focus(
    state: &AppState,
    user_id: Uuid,
    conn_id: u64,
    chat_id: Option<Uuid>,
) -> sqlx::Result<()> {
    if let Some(target) = chat_id {
        let members = chat_member_ids(state, target).await?;
        if !members.contains(&user_id) {
            return Ok(());
        }
    }

    let previous = state.hub.set_focus(user_id, conn_id, chat_id);
    if previous == chat_id {
        return Ok(());
    }

    // Left the old room — but only if no *other* device of mine is still in it.
    if let Some(old) = previous.filter(|old| !state.hub.is_focused_on(user_id, *old)) {
        let event = ServerEvent::Focus { chat_id: old, user_id, present: false };
        for member in chat_member_ids(state, old).await?.into_iter().filter(|m| *m != user_id) {
            state.hub.send_to_user(member, &event);
        }
    }

    if let Some(target) = chat_id {
        let members = chat_member_ids(state, target).await?;
        let event = ServerEvent::Focus { chat_id: target, user_id, present: true };
        for member in members.iter().copied().filter(|m| *m != user_id) {
            state.hub.send_to_user(member, &event);
            // Replay whoever is already here, so arriving second looks the
            // same as arriving first. Only to the connection that just
            // focused — my other devices don't care where this one is.
            if state.hub.is_focused_on(member, target) {
                state.hub.send_to_conn(
                    user_id,
                    conn_id,
                    &ServerEvent::Focus { chat_id: target, user_id: member, present: true },
                );
            }
        }
    }
    Ok(())
}

pub async fn chat_member_ids(state: &AppState, chat_id: Uuid) -> sqlx::Result<Vec<Uuid>> {
    sqlx::query_scalar("SELECT user_id FROM chat_members WHERE chat_id = $1")
        .bind(chat_id)
        .fetch_all(&state.db)
        .await
}

async fn mark_read(
    state: &AppState,
    user_id: Uuid,
    chat_id: Uuid,
    message_id: Uuid,
) -> sqlx::Result<()> {
    // Cursor only moves forward (UUIDv7 ordering), so a delayed/replayed frame
    // can never un-read newer messages.
    let updated = sqlx::query(
        "UPDATE chat_members SET last_read_message_id = $3
         WHERE chat_id = $1 AND user_id = $2
           AND (last_read_message_id IS NULL OR last_read_message_id < $3)",
    )
    .bind(chat_id)
    .bind(user_id)
    .bind(message_id)
    .execute(&state.db)
    .await?;
    if updated.rows_affected() > 0 {
        crate::routes::messages::fanout_read_receipt(state, chat_id, user_id, message_id).await?;
    }
    Ok(())
}

/// Tell everyone who shares a chat with this user that they went on/offline.
///
/// `online` itself is always broadcast — calls depend on knowing whether the
/// other end can ring — but the precise `last_seen_at` stamp is withheld from
/// users who turned "Last seen" off, matching what UserDto exposes over REST.
async fn broadcast_presence(state: &AppState, user_id: Uuid, online: bool) {
    let shares_last_seen: bool =
        sqlx::query_scalar("SELECT last_seen_visible FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .unwrap_or(false);
    let last_seen_at =
        if online || !shares_last_seen { None } else { Some(chrono::Utc::now()) };
    let related: Vec<Uuid> = match sqlx::query_scalar(
        "SELECT DISTINCT b.user_id FROM chat_members a
         JOIN chat_members b ON a.chat_id = b.chat_id
         WHERE a.user_id = $1 AND b.user_id <> $1",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    {
        Ok(ids) => ids,
        Err(e) => {
            tracing::warn!(error = %e, "presence fanout query failed");
            return;
        }
    };
    let event = ServerEvent::Presence { user_id, online, last_seen_at };
    for peer in related {
        state.hub.send_to_user(peer, &event);
    }
}
