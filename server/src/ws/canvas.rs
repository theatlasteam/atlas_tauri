//! Collaborative whiteboard rooms. Optional auth: logged-in users keep their
//! name and avatar color; everyone else joins as a Guest.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

use crate::auth::authenticate;
use crate::state::AppState;

const MAX_STROKES: usize = 8_000;
const MAX_POINTS: usize = 256;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Peer {
    id: String,
    name: String,
    color: String,
    handle: Option<String>,
    user_id: Option<Uuid>,
    guest: bool,
}

struct Room {
    peers: Mutex<HashMap<u64, Peer>>,
    tx: broadcast::Sender<String>,
}

#[derive(Default)]
pub struct CanvasHub {
    rooms: Mutex<HashMap<Uuid, Arc<Room>>>,
    next_id: AtomicU64,
}

impl CanvasHub {
    async fn room(&self, id: Uuid) -> Arc<Room> {
        let mut g = self.rooms.lock().await;
        g.entry(id)
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(256);
                Arc::new(Room {
                    peers: Mutex::new(HashMap::new()),
                    tx,
                })
            })
            .clone()
    }
}

#[derive(Deserialize)]
struct Join {
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct Incoming {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(flatten)]
    rest: serde_json::Value,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(id): Path<Uuid>,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| session(socket, id, state))
}

async fn session(mut socket: WebSocket, canvas_id: Uuid, state: AppState) {
    let exists: (bool,) = match sqlx::query_as("SELECT EXISTS(SELECT 1 FROM canvases WHERE id = $1)")
        .bind(canvas_id)
        .fetch_one(&state.db)
        .await
    {
        Ok(v) => v,
        Err(_) => return,
    };
    if !exists.0 {
        let _ = socket.send(Message::Text(json!({"type":"error","message":"not found"}).to_string().into())).await;
        return;
    }

    let first = match tokio::time::timeout(Duration::from_secs(10), socket.recv()).await {
        Ok(Some(Ok(Message::Text(t)))) => t,
        _ => return,
    };
    let parsed = serde_json::from_str::<Incoming>(&first).ok();
    let join = match parsed {
        Some(v) if v.kind == "join" => v,
        _ => Join { token: None, name: None }.into_incoming(),
    };

    let auth = if let Some(token) = join.token.as_deref().filter(|s| !s.is_empty()) {
        authenticate(&state.db, token).await.ok()
    } else {
        None
    };

    let peer = if let Some(user) = auth {
        let row: Option<(String, String, String)> = sqlx::query_as(
            "SELECT name, handle, avatar_color FROM users WHERE id = $1",
        )
        .bind(user.user_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        let (name, handle, color) = row.unwrap_or_else(|| ("User".into(), "user".into(), "#888888".into()));
        Peer {
            id: user.user_id.to_string(),
            name,
            color,
            handle: Some(handle),
            user_id: Some(user.user_id),
            guest: false,
        }
    } else {
        let guest = format!("{:04}", rand::random::<u16>() % 10000);
        let hue = (rand::random::<u16>() % 360) as u16;
        Peer {
            id: format!("guest-{guest}"),
            name: join.name.filter(|s| !s.trim().is_empty()).unwrap_or_else(|| format!("Guest {guest}")),
            color: format!("hsl({hue} 70% 48%)"),
            handle: None,
            user_id: None,
            guest: true,
        }
    };

    let room = state.canvas.room(canvas_id).await;
    let conn_id = state.canvas.next_id.fetch_add(1, Ordering::Relaxed);
    {
        let mut peers = room.peers.lock().await;
        peers.insert(conn_id, peer.clone());
    }
    let mut rx = room.tx.subscribe();

    let strokes: serde_json::Value = sqlx::query_as::<_, (serde_json::Value,)>(
        "SELECT strokes FROM canvases WHERE id = $1",
    )
    .bind(canvas_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(|r| r.0)
    .unwrap_or_else(|| json!([]));

    let peers_now: Vec<Peer> = room.peers.lock().await.values().cloned().collect();
    let _ = socket
        .send(Message::Text(
            json!({"type":"ready","self": peer, "peers": peers_now, "strokes": strokes}).to_string().into(),
        ))
        .await;
    let _ = room.tx.send(json!({"type":"presence","peers": peers_now}).to_string());

    let (mut sink, mut stream) = socket.split();
    let writer = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    if sink.send(Message::Text(msg.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });

    while let Some(Ok(Message::Text(text))) = stream.next().await {
        let Ok(msg) = serde_json::from_str::<Incoming>(&text) else { continue };
        match msg.kind.as_str() {
            "cursor" => {
                let mut out = msg.rest;
                out["type"] = json!("cursor");
                out["from"] = json!(peer.id);
                out["name"] = json!(peer.name);
                out["color"] = json!(peer.color);
                let _ = room.tx.send(out.to_string());
            }
            "stroke" => {
                let mut stroke = msg.rest.get("stroke").cloned().unwrap_or(msg.rest.clone());
                if let Some(pts) = stroke.get_mut("points").and_then(|p| p.as_array_mut()) {
                    pts.truncate(MAX_POINTS);
                }
                stroke["from"] = json!(peer.id);
                stroke["color"] = stroke.get("color").cloned().unwrap_or(json!(peer.color));
                let _ = sqlx::query(
                    "UPDATE canvases SET strokes = (
                        CASE WHEN jsonb_array_length(strokes) >= $2 THEN strokes
                        ELSE strokes || $3::jsonb END
                     ) WHERE id = $1",
                )
                .bind(canvas_id)
                .bind(MAX_STROKES as i32)
                .bind(json!([stroke]))
                .execute(&state.db)
                .await;
                let _ = room.tx.send(json!({"type":"stroke","stroke": stroke}).to_string());
            }
            "clear" => {
                let _ = sqlx::query("UPDATE canvases SET strokes = '[]'::jsonb WHERE id = $1")
                    .bind(canvas_id)
                    .execute(&state.db)
                    .await;
                let _ = room.tx.send(json!({"type":"clear"}).to_string());
            }
            _ => {}
        }
    }

    writer.abort();
    {
        let mut peers = room.peers.lock().await;
        peers.remove(&conn_id);
        let list: Vec<Peer> = peers.values().cloned().collect();
        let _ = room.tx.send(json!({"type":"presence","peers": list}).to_string());
    }
}

impl Join {
    fn into_incoming(self) -> Incoming {
        Incoming {
            kind: "join".into(),
            token: self.token,
            name: self.name,
            rest: json!({}),
        }
    }
}
