/**
 * Places a real call over the WebSocket, to test incoming-call notifications.
 *
 *   bun scripts/place-test-call.ts [calleeHandle] [ringSeconds]
 *
 * Env overrides:
 *   BASE            API base URL          (default http://127.0.0.1:8080)
 *   CALLER_HANDLE   account placing it    (default verifytest1)
 *   CALLER_PASSWORD                       (default test_pw_123456)
 *
 * The server is a validated relay and never parses SDP, so a placeholder offer
 * is enough to exercise ring -> push -> notification. Media won't connect —
 * this tests the notification path, not WebRTC.
 *
 * For the *push* path (rather than delivery over an open socket) the callee's
 * app must be fully closed: a live socket means the server delivers CallOffer
 * directly and deliberately sends no push.
 */
const BASE = (process.env.BASE ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const CALLER_HANDLE = process.env.CALLER_HANDLE ?? "verifytest1";
const CALLER_PASSWORD = process.env.CALLER_PASSWORD ?? "test_pw_123456";

const calleeHandle = process.argv[2] ?? "atlas";
const ringSeconds = Number(process.argv[3] ?? 35);

const die = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const res = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ handle: CALLER_HANDLE, password: CALLER_PASSWORD }),
}).catch(() => die(`cannot reach ${BASE} — is the server running?`));
if (!res.ok) die(`login as ${CALLER_HANDLE} failed: HTTP ${res.status}`);
const { token, user } = (await res.json()) as { token: string; user: { id: string; name: string } };

// Resolve the callee by handle so this works against any deployment.
const found = await fetch(`${BASE}/api/users?q=${encodeURIComponent(calleeHandle)}`, {
  headers: { authorization: `Bearer ${token}` },
});
const callee = ((await found.json()) as Array<{ id: string; handle: string; name: string }>).find(
  (u) => u.handle === calleeHandle,
);
if (!callee) die(`no user with handle "${calleeHandle}" on ${BASE}`);

console.log(`caller : ${user.name} (@${CALLER_HANDLE})`);
console.log(`callee : ${callee.name} (@${callee.handle})`);
console.log(`ringing for ${ringSeconds}s — Ctrl-C to hang up early\n`);

const callId = crypto.randomUUID();
const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws`);
let placed = false;

ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "auth", token })));

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data));

  if (msg.type === "ready") {
    ws.send(
      JSON.stringify({
        type: "call_offer",
        call_id: callId,
        to_user_id: callee.id,
        sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=atlas-test\r\nt=0 0\r\n",
        media: "audio",
      }),
    );
    placed = true;
    console.log(`→ call placed (call_id ${callId})`);
    return;
  }

  if (msg.type === "presence") {
    // online=true arriving *after* the offer means a push woke the device.
    console.log(`   presence: ${callee.handle} online=${msg.online}`);
    return;
  }

  if (msg.type === "call_answer") {
    console.log("✓ ANSWERED — the device accepted the call");
    return;
  }

  if (msg.type === "call_end" || msg.type === "call_unavailable") {
    const reason = msg.reason ?? "?";
    console.log(`\n${msg.type}: ${reason}`);
    if (reason === "busy") {
      console.log(
        "  The server thinks the callee is already in a call. If they aren't,\n" +
          "  it's leaked call state — the reaper clears it within ~2 minutes,\n" +
          "  or restart the server.",
      );
    }
    if (reason === "declined") console.log("  ✓ Decline worked (this is the path with no socket).");
    process.exit(0);
  }

  console.log(`   ${JSON.stringify(msg).slice(0, 160)}`);
});

ws.addEventListener("error", () => die("websocket error"));

const hangUp = (why: string) => {
  console.log(`\n${why} — hanging up`);
  if (placed) ws.send(JSON.stringify({ type: "call_end", call_id: callId, reason: "hangup" }));
  setTimeout(() => process.exit(0), 300);
};

process.on("SIGINT", () => hangUp("interrupted"));
setTimeout(() => hangUp(`${ringSeconds}s elapsed`), ringSeconds * 1000);
