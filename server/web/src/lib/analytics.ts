// First-party, anonymous pageview + time-on-page tracking for the marketing
// site. No third-party requests, no cookies, no localStorage: the session
// token is generated per page load, lives only in memory for this tab, and
// is used solely to correlate this pageview with its own heartbeats so the
// backend can estimate time-on-page — see server/src/routes/metrics.rs.

const HEARTBEAT_MS = 15_000;

type EventKind = "pageview" | "heartbeat";

function send(session: string, path: string, type: EventKind) {
  const body = JSON.stringify({
    type,
    session,
    path,
    ...(type === "pageview" ? { referrer: document.referrer } : {}),
  });
  fetch("/api/metrics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort — a dropped analytics ping shouldn't surface anywhere.
  });
}

// crypto.randomUUID exists only in secure contexts (https/localhost); the
// site also gets opened over plain http on LANs, so fall back to a
// getRandomValues-based v4 UUID there.
function newSessionId(): string {
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export function initAnalytics() {
  const session = newSessionId();
  const path = window.location.pathname;

  send(session, path, "pageview");

  let timer: ReturnType<typeof setInterval> | undefined;
  const startHeartbeat = () => {
    if (timer !== undefined) return;
    timer = setInterval(() => send(session, path, "heartbeat"), HEARTBEAT_MS);
  };
  const stopHeartbeat = () => {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  };

  // Only count time while the tab is actually visible/focused, so an idle
  // background tab doesn't inflate time-on-page.
  if (document.visibilityState === "visible") startHeartbeat();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      send(session, path, "heartbeat");
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  });
}
