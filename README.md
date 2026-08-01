<p align="center">
  <img src="src/assets/logo.svg" alt="Atlas logo" width="160" />
</p>

<h1 align="center">Atlas</h1>

<p align="center">
  A modern, end-to-end encrypted chat app built with Tauri, Solid.js, and Rust.<br />
  Desktop and mobile from one codebase.
</p>

## Features

- **Live typing** — opt in and the other side watches your message form as you write it, instead of a
  flat "typing…". Drafts are sealed with the same X25519 key as your messages, so the server relays
  ciphertext it can't read, and nothing is ever stored. Reciprocal: the app doesn't render anyone
  else's draft while yours are private. (This half is the client's own rule — unlike read receipts
  below, the preference is device-local, so the server can't enforce it.)
- **Time capsules** — hold Send to pick a moment instead of sending now. Both of you get a sealed
  bubble with a live countdown, and the body stays in the database until it opens. Sealed from its
  author too: you bury it, you don't get to keep lifting the lid. It isn't in your history, it isn't
  in your search results, and it can't be edited while it counts down — an early peek would take
  database access, not a patched client.
- **Co-presence** — the chat header tells you when the other person has *this* conversation open,
  not merely that they're online somewhere. Tracked per device, so a phone and a laptop are each
  reported where they actually are, and vacated the moment you navigate away or drop off.
- **Atlas Spaces** — generate small, self-contained HTML mini-apps by prompting an AI, share them in a
  chat, and remix anyone else's into a new one linked back to the original. Rendered in a sandboxed
  iframe (`allow-scripts` only) on the viewer's device — the real security boundary, not just the
  generation prompt.
- **Direct messages & groups** — folders, mute, typing indicators, read receipts
- **Edit & unsend** — rewrite a message (marked as edited) or take it back for everyone. An unsent
  message leaves a tombstone rather than a hole, so quoted replies and unread counts stay correct,
  and the body is wiped in the same statement that marks it.
- **End-to-end encryption** for DMs (X25519 + HKDF-SHA256, private keys never leave the device)
- **Voice & video calls** over WebRTC, with TURN relay support
- **Rich messages** — replies, reactions, attachments (images, voice notes, files)
- **Privacy switches that bind** — read receipts and last-seen are account settings enforced on the
  server, not local toggles. Read receipts are reciprocal in both directions: turn yours off and you
  stop receiving other people's.
- **Runtime-themeable UI** — light/dark, accent color, font, wallpaper, all switchable without a rebuild
- Cross-platform: Windows, Linux, and Android from a single Tauri app

## Tech Stack

- **Frontend**: Solid.js + TypeScript + Tailwind CSS
- **App shell**: Tauri v2 (Rust)
- **Server**: Rust (Axum + SQLx/Postgres), WebSocket-based realtime sync
- **Package manager**: Bun

## Project Structure

```
atlas_tauri/
├── src/                    # Solid.js frontend
│   ├── screens/            # Page components (ChatList, ChatView, Settings, Profile, ...)
│   ├── components/         # Shared UI components
│   ├── store/               # Reactive app state
│   └── data/                # API client + repository layer
├── src-tauri/               # Tauri app shell (Rust)
│   ├── src/                 # Rust source (E2EE, secure storage, ...)
│   └── tauri.conf.json      # Tauri configuration (desktop + mobile)
├── server/                  # Backend server (Rust/Axum)
│   ├── src/
│   └── migrations/
└── package.json
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- [Rust](https://www.rust-lang.org/) (for Tauri)
- [Android Studio](https://developer.android.com/studio) (for Android development)

### Install

```bash
bun install
```

### Run (desktop)

```bash
bun run tauri:dev
```

### Run (Android)

```bash
bun run tauri:android
```

## Building

```bash
bun run build
bun run tauri build
```

```bash
bun run tauri android build
```

See [`server/README.md`](server/README.md) for running the backend.

## Releases

Prebuilt Windows, Linux, and Android (debug-signed APK) builds are published via the
[Release workflow](.github/workflows/release.yml), triggered manually from the Actions
tab. Grab the latest build from the [Releases page](../../releases).

## License

MIT
