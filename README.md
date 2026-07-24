# atlas-server

Standalone Rust backend for the Atlas messenger: HTTP API, realtime WebSocket
(messaging, presence, typing, read receipts), WebRTC call signaling, ephemeral
TURN credentials, and E2EE key distribution. Deployed on a server, spoken to by
the Tauri clients on Windows/macOS/Linux/iOS/Android.

## Stack and why

| Concern | Choice | Why |
| --- | --- | --- |
| Async runtime | **tokio** | The de-facto production runtime; everything else in the stack (axum, sqlx, tungstenite) is built on it. |
| Web framework | **axum 0.8** | First-class WebSocket support in the same router as HTTP, tower middleware ecosystem (tracing, CORS, body limits), no bespoke actor system to learn, maintained by the tokio team. |
| Database | **PostgreSQL** via **sqlx** | Chat workloads are append-heavy writes + keyset-paginated reads, which one `(chat_id, id DESC)` btree serves at index speed. Transactions make membership/DM-dedup race-free. sqlx is pure-async with connection pooling and embedded migrations. |
| Realtime | **One multiplexed WebSocket** | Chat events and call signaling share a single authenticated, ordered connection — one radio wakeup path on mobile, no cross-channel race conditions. |
| Calls | **WebRTC (P2P) + coturn** | Media never touches this server for 1:1 calls; the server is a validated signaling relay and mints ephemeral HMAC TURN credentials (coturn `use-auth-secret`). |
| Message E2EE | **Opaque scheme-tagged payloads + key-package distribution** | The server transports/stores ciphertext it cannot read and never depends on plaintext. Clients implement MLS (or Signal-style) on top; the key directory endpoints are here. |
| Auth | **argon2id + opaque rotating bearer tokens (hashed at rest)** | Instant revocation per device (unlike JWTs), no signing-key management, DB leak yields no usable credentials. |

## Running

```bash
cd server
docker compose up -d postgres          # dev database
cp .env.example .env                   # adjust if needed
cargo run                              # migrations run automatically on boot
```

Production: `docker build -t atlas-server .`, run behind a TLS-terminating
reverse proxy (caddy/nginx). **TLS is mandatory in production** — bearer tokens
and signaling ride on this connection. The server itself binds plain HTTP and
expects the proxy to own certificates.

For calls across real networks, deploy coturn (see `turnserver.conf.example`)
on a host with a public IP, set the same secret in `TURN_SECRET` and
`static-auth-secret`, and list your `turn:`/`turns:` URLs in `TURN_URLS`.

## HTTP API

All endpoints under `/api`, JSON bodies, `Authorization: Bearer <token>` unless
noted.

- `POST /auth/register` `{handle, name, password, deviceName?}` → `{token, user}` (no auth)
- `POST /auth/login` `{handle, password, deviceName?}` → `{token, user}` (no auth)
- `POST /auth/logout` — revokes the current session and kicks its sockets
- `GET /sessions` / `DELETE /sessions/{id}` — device management
- `GET /me` / `PATCH /me` — profile
- `GET /users?q=` — search; `GET /users/{id}`
- `GET /chats` — chat list with per-viewer DM naming, last message, unread count, mute, presence, folders
- `POST /chats` `{kind:"dm", userId}` or `{kind:"group", name, memberIds}` (DMs dedupe race-free)
- `GET /chats/{id}`; `POST /chats/{id}/mute` `{muted}`
- `GET /chats/{id}/messages?before=&after=&limit=` — keyset pagination; `after` is the reconnect-resync cursor
- `POST /chats/{id}/messages` `{scheme?, body, clientTag?}` — idempotent on `clientTag`
- `POST /chats/{id}/read` `{messageId?}` — advances the read cursor (never backwards)
- `GET/POST /folders`, `DELETE /folders/{id}`, `PUT|DELETE /folders/{fid}/chats/{cid}`
- `POST /keys/identity` (first-write-wins), `GET /keys/identity/{userId}`
- `POST /keys/packages`, `GET /keys/packages/count`, `POST /keys/packages/{userId}/claim`
- `GET /calls/ice-servers` — STUN/TURN config with ephemeral credentials
- `GET /api/health` (no auth)

## WebSocket protocol (`/ws`)

JSON frames tagged with `type`. First frame must be
`{"type":"auth","token":"..."}` within 10 s (token in a frame, not the URL, so
it never reaches access logs). Server replies `ready`.

Client → server: `send_message`, `mark_read`, `typing`, `call_offer`,
`call_answer`, `call_ice`, `call_end`, `ping`.

Server → client: `message`, `message_ack`, `read`, `typing`, `presence`,
`chat_created`, `call_offer`, `call_answer`, `call_ice`, `call_end`,
`call_unavailable`, `pong`, `error`.

Delivery contract: messages are **persisted before fan-out**; realtime frames
are best-effort notifications. A client that reconnects must resync
(`GET /chats`, then `messages?after=<last seen id>` per chat). Server pings
every 30 s; sockets idle for 75 s are dropped; per-connection outbound queues
are bounded (256) and slow consumers are disconnected rather than buffered
indefinitely.

## Call flow

1. Caller: `GET /api/calls/ice-servers` → build `RTCPeerConnection`, then WS
   `call_offer {call_id, to_user_id, sdp}`.
2. Server validates (shared chat, callee online, callee not in an active call)
   and rings **all** the callee's devices; 60 s ring timeout.
3. First device to `call_answer` wins; others get `call_end
   {reason:"answered_elsewhere"}`. Subsequent signaling routes only between the
   two live device connections.
4. `call_ice` frames relay trickle candidates both ways (only between call
   participants — the server drops anything else).
5. `call_end` or a participant socket death tears the call down for both sides.

Glare (simultaneous calls) is handled client-side with perfect negotiation:
the peer with the lexicographically smaller user id is the polite peer.

Media is P2P DTLS-SRTP: for 1:1 calls it is end-to-end encrypted and a TURN
relay only ever sees ciphertext. Caveat: the signaling server (this code) could
in principle MITM DTLS by swapping certificate fingerprints in SDP — once
message E2EE lands, clients should exchange fingerprint digests over the
E2EE channel and verify.

## Scaling notes

Single-process design: the WS hub (presence, connections, call state) is
in-memory, DB is the durable source of truth. One node on a decent VM handles
tens of thousands of concurrent sockets. To go multi-node later: put fan-out on
Redis/NATS pub-sub keyed by user id and move call state to Redis — the
`Hub` API (`send_to_user`/`send_to_conn`) is the seam; callers don't change.

Not yet implemented, by design order: rate limiting (add `tower_governor` or
enforce at the proxy), push notifications for offline recipients (APNs/FCM
need per-platform credentials), media/attachment uploads (S3-style presigned),
group-call SFU (LiveKit is the pragmatic choice when needed), MLS client
crypto (openmls in the Tauri Rust core; server-side infra for it is done).
