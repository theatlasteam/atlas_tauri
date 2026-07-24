// WebSocket client: one multiplexed socket for messages, presence, typing,
// read receipts and call signaling.
//
// Reliability model (matches the server contract): frames are best-effort
// notifications; the durable source of truth is REST. On every (re)connect the
// stores run a resync (chat list + per-open-chat `after` cursor), so a dropped
// socket can delay events but never lose them. Reconnect uses exponential
// backoff with jitter, capped at 30s, and resets once a connection succeeds.

import { createSignal } from "solid-js";
import type { ClientMsg, ServerEvent } from "./generated";
import { getToken, wsUrl } from "./api";
import type { ConnectionState } from "./types";

const [connectionState, setConnectionState] = createSignal<ConnectionState>("offline");
export { connectionState };

type Handler = (event: ServerEvent) => void;

let ws: WebSocket | null = null;
let handlers: Handler[] = [];
let shouldRun = false;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let resyncListeners: (() => void)[] = [];

export function onServerEvent(handler: Handler): () => void {
  handlers.push(handler);
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}

/** Called after each successful (re)connect — stores refetch here. */
export function onResync(listener: () => void): () => void {
  resyncListeners.push(listener);
  return () => {
    resyncListeners = resyncListeners.filter((l) => l !== listener);
  };
}

/** Best-effort send; drops silently when the socket is down (callers that
 * need delivery guarantees use REST instead). */
export function wsSend(msg: ClientMsg): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

export function connectSocket() {
  shouldRun = true;
  attempt = 0;
  open();
}

export function disconnectSocket() {
  shouldRun = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  ws?.close();
  ws = null;
  setConnectionState("offline");
}

function scheduleReconnect() {
  if (!shouldRun || reconnectTimer) return;
  // 1s, 2s, 4s … capped at 30s, ±25% jitter so a restarting server isn't
  // stampeded by every client at once.
  const base = Math.min(30_000, 1000 * 2 ** attempt);
  const delay = base * (0.75 + Math.random() * 0.5);
  attempt += 1;
  setConnectionState(attempt > 1 ? "offline" : "connecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    open();
  }, delay);
}

function open() {
  const token = getToken();
  if (!shouldRun || !token) return;
  setConnectionState("connecting");

  let socket: WebSocket;
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "auth", token } satisfies ClientMsg));
  };

  socket.onmessage = (raw) => {
    let event: ServerEvent;
    try {
      event = JSON.parse(raw.data as string) as ServerEvent;
    } catch {
      return;
    }
    if (event.type === "ready") {
      attempt = 0;
      setConnectionState("online");
      for (const l of [...resyncListeners]) l();
    }
    for (const h of [...handlers]) h(event);
  };

  socket.onclose = () => {
    if (ws === socket) {
      ws = null;
      setConnectionState(shouldRun ? "connecting" : "offline");
      scheduleReconnect();
    }
  };
  socket.onerror = () => {
    socket.close();
  };
}
