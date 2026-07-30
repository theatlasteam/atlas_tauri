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

export function initAnalytics() {
  const session = crypto.randomUUID();
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
