# AGENTS.md

## Package manager / frontend

- Use **Bun**, not npm/node directly: `bun install`, `bun run <script>`.
- Scripts (`package.json`): `dev` = web-only Vite; `tauri:dev` = desktop shell; `tauri:android` / `tauri:ios` = mobile; `build` = `vite build`; `tauri build` via `bun run tauri ...`.
- Verify with `bun run check` (`tsc --noEmit`, strict + `noUnusedLocals`/`noUnusedParameters`) and `bun run test:messages` (must keep `node --conditions=browser` prefix).
- No linter/formatter config; no test runner besides `scripts/test-message-regressions.mjs`.

## Backend (`server/`, Axum + Postgres + tokio)

- Run: `cd server && docker compose up -d postgres && cp .env.example .env && cargo run`. Migrations (`server/migrations/`) apply automatically on boot.
- Layout: `src/main.rs` owns the router; `src/routes/*.rs` one file per domain (chats/messages/keys/calls/minds/bots/plugins/spaces/canvas/...); `src/ws/` is the socket hub; `src/state.rs` is `AppState`. Check `main.rs` first for route shapes.
- Body limits: global `DefaultBodyLimit(512 * 1024)`; attachments/emoji/plugin-icons opt out with a larger explicit layer — don't add raw-bytes endpoints without one.
- TLS/crypto: `reqwest` must stay on `rustls-tls-webpki-roots` — the runtime image is `debian-slim` with no CA store, so native roots work locally and fail in prod.
- Deploy: Docker build context is `server/` (`Dockerfile` + `amvera.yml`, port 8080, `/data` persistence). Stage 1 `bun run build` in `web/` → `dist/`; stage 2 `cargo build --release`; runtime sets `STATIC_DIR=/app/web-dist` (served by the `static_or_api_only` fallback in `main.rs`).
- Single-process WS hub is in-memory; DB is source of truth. No multi-node support.
- Env gotchas: unset `FCM_SERVICE_ACCOUNT` = push silently disabled, but set-but-unparseable aborts startup. Non-LAN calls need TURN (`TURN_SECRET` + `TURN_URLS`); STUN default is LAN-only.

## Server web (`server/web/`, marketing site + PWA, own Bun project)

- Separate `package.json`/`bun.lock` — run its scripts from `server/web`, not the repo root. `dev`/`build` always run `build:wasm` first (Rust `wasm/atlas-e2ee` → `../../src/lib/e2ee-wasm` via `wasm-bindgen` + `patch-safari.mjs`); needs the `wasm32-unknown-unknown` target.
- Multi-entry Vite build (`main/ru/en/privacy/terms/oferta/canvas/app`); output `dist/` is what the backend serves via `STATIC_DIR`. `/app` is the messenger PWA shell, not a second app.
- `/app` (`src/pwa/main.tsx`) reuses the Tauri client via the `@messenger` alias (`../../src/App`, store, plugins) — fix shared logic in `src/`, not here. Root site (`src/index.tsx`) uses plain pathname checks, no router, because the server fallback already serves `index.html`.
- Aliases (`server/web/vite.config.ts`): `@atlas/ui` → `design-system/index.ts` (shared barrel imported by both clients — edits affect desktop + web); `@tauri-apps/api/core` → `tauri-stub.ts` (`isTauri()=false`, `invoke` throws); `assert` → root polyfill. `fs.allow` covers the repo root — required for `@messenger` imports outside the app root. Keep `dedupe: solid-js`.

## Wire types / shared code (do not guess wrong)

- `src/data/generated/*.ts` is ts-rs output — **never edit by hand**. Regen: `cd server && TS_RS_EXPORT_DIR=$PWD/../src/data/generated cargo test export_bindings`.
- `@atlas/ui` alias = `server/web/design-system/index.ts` (defined in both `vite.config.ts` and `tsconfig.json`). Vite also `dedupe`s `solid-js` — never bundle a second reactive runtime.
- `src/index.tsx` stubs `globalThis.process.env` and `src/lib/assert-polyfill.cjs` shims `assert`/`node:assert` as CJS for `@babel/standalone` in the webview. Keep both; the polyfill must stay CommonJS (module itself is the function).

## Architecture

- `src/`: Solid.js SPA (`App.tsx` routes; `screens/`, `components/`, `store/` reactive state, `data/` API+socket+repository, `plugins/` `.atp` runtime). Entry `src/index.tsx` → `src/App.tsx`.
- `src-tauri/`: Tauri v2 shell; frontend dist `../dist`, dev URL `http://127.0.0.1:1420`. Auth token in OS keychain on desktop, app-private storage on mobile.
- `server/src/main.rs` owns all routes (`/api/*`, `/ws`, `/ws/canvas/*`, `/v1/*` AI proxy, `/mcp`). Fallback serves `STATIC_DIR` site, `/app/*` gets PWA shell.
- Realtime contract: server persists messages **before** fan-out; WS frames are best-effort. Clients must resync after reconnect (`GET /api/chats`, then `messages?after=<last id>`). WS auth = `{"type":"auth","token":"..."}` first frame within 10s, never in URL.
- E2EE: server transports/stores opaque ciphertext (`scheme`/`body`) and key packages; it never sees plaintext. Message edits replace text, unsends leave tombstones.

## Releases

- Both workflows are manual `workflow_dispatch` only. `release.yml` deletes/recreates the given tag — destructive. `canary.yml` uploads to the run only, never a GitHub Release.
