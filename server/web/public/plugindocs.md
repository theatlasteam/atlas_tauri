# Atlas Plugin SDK

Plugins are user-authored workspaces that extend the Atlas messenger. They are
written and published in the **Developer panel** (https://atlasmsg.app/plugins),
stored on the server, and installed from the app's Plugins marketplace.

## AI development via MCP

AI assistants can create, validate and publish plugins against this store
through a Model Context Protocol server:

- Endpoint: `https://atlasmsg.app/mcp` (streamable HTTP)
- Tools: `list_plugins`, `get_plugin`, `validate_plugin`, `create_plugin`,
  `update_plugin`, `delete_plugin`, `read_docs` (this document)
- Write tools require an Atlas session token passed as the `token` argument
  (the plugin is tied to that account; edits are owner-only).

Connect with any MCP client, e.g.:
`mcp --transport streamable-http https://atlasmsg.app/mcp`

A plugin is a folder of files: `manifest.json` plus source code in folders
(`src/main.tsx`, `components/Nav.tsx`, helpers, ...). The runtime compiles
TypeScript/TSX (Solid JSX) on the fly, wires imports together with a small
module loader, then calls the entry module's `activate(ctx)` export.

```text
my-plugin/
  manifest.json
  src/
    main.tsx        <- entry point (manifest "main")
    Nav.tsx         <- a Solid component you import from main.tsx
    helper.ts
```

## Modules & TSX

Each `.ts`/`.tsx`/`.js`/`.jsx` file is its own module. Use `import`/`export`
or CommonJS `require` — relative imports resolve within the plugin's folders
(with extension + `index.*` fallback), and bare imports resolve to the host:

| Specifier       | What you get |
|-----------------|--------------|
| `solid-js`      | The app's own Solid runtime (`createSignal`, `createEffect`, ...) |
| `solid-js/web`  | Solid DOM runtime (`render`, `Portal`, ...) |
| `solid-js/store`| `createStore`, `produce`, ... |
| `atlas`         | Your plugin's SDK context (same as `ctx`) |
| `atlas/ui`      | App UI components: `Avatar`, `Dialog`, `Switch`, `Popover`, `Menu`, `Picker`, `EmptyState`, `BackHeader`, `Icons` |

```tsx
// src/main.tsx
import { createSignal } from "solid-js";
import { Switch } from "atlas/ui";
import { NavBar } from "./Nav";

export function activate(ctx) {
  ctx.log("hi");
}
```

Because components share the app's Solid runtime, a component exported by a
plugin can be rendered into app chrome via a UI slot.

---

## Manifest

`manifest.json` is the source of truth for identity, versioning and the
capability surface. Fields:

| Field         | Type     | Required | Description |
|---------------|----------|----------|-------------|
| `id`          | string   | yes      | The install key: lowercase `a-z`, `0-9`, `-`, `_`, `.`. Cannot change after publishing. |
| `name`        | string   | yes      | Display name shown in the app and store. |
| `version`     | string   | yes      | Semver-ish version string. |
| `description` | string   | no       | One-line description for the store card. |
| `main`        | string   | yes      | Entry file the runtime evaluates (`src/main.tsx` by convention). |
| `permissions` | string[] | no       | Capabilities your plugin needs. Defaults to the legacy set when omitted. |
| `icon`        | string   | no       | Path to an image file in the workspace (`icon.svg`, `icon.png`, ...) shown instead of the initial-letter tile. |

```json
{
  "id": "dev.signature",
  "name": "Signature",
  "version": "0.1.0",
  "description": "Adds a signature to every message you send.",
  "main": "main.js",
  "permissions": ["messages.send", "navigation"]
}
```

Authorship is NOT in the manifest. It comes from the Atlas account that
published the plugin (the store shows the developer's handle and profile photo).

---

## Permissions

Every capability is gated by a permission string. Omitting `permissions`
grants the legacy default set so existing plugins keep working.

**Default (when `permissions` is omitted):**
`commands`, `messages.read`, `messages.send`, `storage`, `api`

| Permission      | Unlocks |
|-----------------|---------|
| `commands`      | `ctx.registerCommand` |
| `messages.read` | `ctx.onMessage` |
| `messages.send` | `ctx.beforeSend`, `ctx.onSent`, `ctx.sendMessage` |
| `chats.read`    | `ctx.getChat` |
| `users.read`    | `ctx.me`, `ctx.getUser`, `ctx.searchUsers` |
| `navigation`    | `ctx.navigate`, `ctx.openChat`, `ctx.openUser` |
| `notifications` | `ctx.notify`, `ctx.toast` |
| `storage`       | `ctx.storage` |
| `api`           | `ctx.api.fetch`, `ctx.api.request` |
| `events`        | `ctx.events` |
| `ui`            | `ctx.ui.mount` |

`ctx.hasPermission(name)` and `ctx.permissions` let your plugin react to what
was granted. Denied capabilities throw at call time (not load time), so a
plugin can degrade gracefully.

---

## UI slots

With the `ui` permission, a plugin can replace parts of the app chrome with
its own Solid components. `ctx.ui.mount(slot, component)` registers one; the
app falls back to its built-in UI when the slot is unset. The component
receives `{ navigate, pathname }` so it can move around the app.

| Slot         | Replaces |
|--------------|----------|
| `nav.bottom` | The mobile bottom nav bar |
| `nav.side`   | The desktop left rail |
| `dialog`     | The shared modal container (backdrop + sheet) |

> **Styling**: plugins are fetched at runtime, so Tailwind classes are never
> compiled into the app's CSS. Use **inline styles** with the app's CSS
> variables (`var(--color-surface-raised)`, `var(--color-ink)`,
> `var(--color-border)`, `var(--color-accent)`, ...) so plugin UI themes
> correctly. Animate with `onMount` + inline `transition` properties.

```tsx
// src/main.tsx
import { onMount, Show, type JSX } from "solid-js";

export function activate(ctx) {
  ctx.ui.mount("dialog", (props) => <CenteredDialog {...props} />);
}

function CenteredDialog(props: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
}) {
  let entered = false;
  onMount(() => requestAnimationFrame(() => (entered = true)));
  return (
    <Show when={props.open}>
      <div style={{ position: "fixed", inset: "0", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
        <div
          style={{
            position: "absolute", inset: "0", background: "rgba(0,0,0,0.4)",
            opacity: entered ? 1 : 0, transition: "opacity 200ms ease-out",
          }}
          onClick={() => props.onOpenChange(false)}
        />
        <div
          role="dialog" aria-modal="true" aria-label={props.title}
          style={{
            position: "relative", zIndex: 10, width: "100%", maxWidth: "24rem",
            background: "var(--color-surface-raised, #fff)",
            border: "1px solid var(--color-border, rgba(0,0,0,0.1))",
            borderRadius: "24px",
            padding: "20px",
            opacity: entered ? 1 : 0,
            transform: entered ? "scale(1)" : "scale(0.95)",
            transition: "opacity 200ms ease-out, transform 200ms ease-out",
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: "1.125rem", fontWeight: 600, color: "var(--color-ink)" }}>
            {props.title}
          </h2>
          {props.children}
        </div>
      </div>
    </Show>
  );
}
```

A `dialog` slot component receives `{ title, open, onOpenChange, children }`
(it owns its backdrop and positioning). Unmount slots yourself via
`deactivate(ctx)` if you want to restore the built-in UI while the plugin
stays loaded — the runtime clears a plugin's slots on uninstall/disable
automatically.

---

## Configuration screen

A plugin can provide a settings screen. Register it with
`ctx.ui.configScreen(component)` (requires `ui`). When it's registered, the
Plugins screen shows a sliders button on the plugin's row that opens the
screen full-screen. The component receives `{ plugin, onClose }`.

```tsx
// src/main.tsx
import { Settings } from "./Settings";

export function activate(ctx) {
  ctx.ui.configScreen(({ plugin, onClose }) => <Settings plugin={plugin} onClose={onClose} />);
}
```

```tsx
// src/Settings.tsx
import { createSignal } from "solid-js";

export function Settings(props: { plugin: { id: string; name: string }; onClose: () => void }) {
  const [signature, setSignature] = createSignal(""); // load persisted state via ctx.storage
  return (
    <div style={{ padding: "20px", maxWidth: "480px", margin: "0 auto", color: "var(--color-ink)" }}>
      <label style={{ display: "block", margin: "12px 0 4px", fontSize: "14px" }}>Signature</label>
      <input
        value={signature()}
        onInput={(e) => setSignature(e.currentTarget.value)}
        style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink)" }}
      />
      <p style={{ fontSize: "12px", color: "var(--color-ink-subtle)" }}>
        Save via ctx.storage.set("signature", signature()) — see Storage.
      </p>
    </div>
  );
}
```

The screen replaces the whole Plugins list while open; use `props.onClose()`
to return. Persist values with `ctx.storage` (or `ctx.api`).

---

## Entry point

The entry file must export an `activate(ctx)` function. It may also export
`deactivate(ctx)` to run when the plugin is disabled or uninstalled.

```js
// main.js
module.exports = {
  activate(ctx) {
    ctx.log("Hello from my plugin!");
  },
  deactivate(ctx) {
    ctx.log("Goodbye");
  },
};
```

`module.exports = function activate(ctx) { ... }` (a bare function) is also
accepted. For one-liners, the `atlas` object is available at the top level
without exporting anything.

---

## Commands

Register a command the user can run from the app's Plugins screen.

```js
ctx.registerCommand({
  id: "hello",
  label: "Say hello",
  description: "Logs a greeting",
  run() {
    ctx.log("Hello from the command!");
  },
});
```

---

## Message hooks

`beforeSend` rewrites or vetoes outgoing text before anything is sent. Return
a string to replace the text, or `null` to block the message entirely.

```js
ctx.beforeSend((text, event) => {
  if (event.chatId && text.includes("draft")) return null; // block
  return text + "\n- via Atlas";
});
```

`onMessage` observes incoming messages (never your own echo).

```js
ctx.onMessage((message) => {
  ctx.log(message.chatId, message.text, message.authorId);
});
```

`onSent` observes messages that were actually sent (yours included).

```js
ctx.onSent((message) => {
  ctx.log("sent:", message.messageId, message.text);
});
```

**Message shape:** `{ chatId, text, mine, authorId?, messageId?, sentAt? }`

---

## Sending messages

`sendMessage` sends through the app's own pipeline: `beforeSend` hooks run,
DMs get E2EE-sealed, rows are optimistic. Plugins can't bypass encryption or
hooks.

```js
await ctx.sendMessage(chatId, "Hello from a plugin");
await ctx.sendMessage(chatId, "Reply!", { replyToId: messageId });
await ctx.sendMessage(chatId, "A time capsule", { unlockAt: new Date(Date.now() + 60_000).toISOString() });
```

Throws if the send fails. Requires `messages.send`.

---

## Data access

Read-only access to the app's live state and the server.

```js
const me = ctx.me();                     // your User, or null before sign-in
const chat = ctx.getChat(chatId);        // Chat snapshot or undefined (chats.read)
const user = await ctx.getUser(userId);  // User or null (users.read)
const results = await ctx.searchUsers("atlas"); // User[] (users.read)
```

`Chat` shape includes `id`, `kind` (`"dm" | "group"`), `name`, `peerUserId`,
`unreadCount`, `muted`, `online`, `lastMessage`, `lastMessageAt`, `memberCount`.
`User` shape includes `id`, `name`, `handle`, `bio`, `status`, `verified`,
`hasAvatar`, `avatarColor`, `avatarInitial`.

---

## Navigation

Move the app around.

```js
ctx.navigate("/settings");
ctx.openChat(chatId);     // opens a conversation
ctx.openUser(userId);     // opens a profile
```

Requires `navigation`. Paths are the app's router paths.

---

## Notifications

`notify` raises an OS notification (respecting permission); `toast` shows an
in-app pill. Both require `notifications`.

```js
ctx.notify({ title: "Price dropped!", body: "BTC is down 5%." });
ctx.toast("Saved.");
```

---

## Storage

Scoped key-value storage that survives restarts. Keys are namespaced per
plugin; values are strings or JSON.

```js
ctx.storage.set("count", String(n));
const n = Number(ctx.storage.get("count") ?? "0");
ctx.storage.remove("count");

ctx.storage.setJSON("settings", { theme: "dark" });
const s = ctx.storage.getJSON("settings"); // { theme: "dark" } | null
```

---

## HTTP API

Authenticated HTTP client rooted at the Atlas API. The current session token
is attached automatically.

```js
const res = await ctx.api.fetch("/api/users?q=atlas");
const users = await res.json();

const users = await ctx.api.request("/api/users?q=atlas");
```

`request<T>` throws on non-2xx. Requires `api`.

---

## Events

Subscribe to app events. Returns an unsubscribe function.

```js
const off = ctx.events.on("chatOpened", ({ chatId }) => ctx.log("opened", chatId));
// later:
off();
```

Events: `appVisible`, `appHidden`, `chatOpened` (`{ chatId }`), `chatClosed`
(`{ chatId }`). Requires `events`.

---

## Logging

`ctx.log(...args)` writes to the developer console, prefixed with the plugin id.

---

## Security

Plugins are trusted extensions running with full access to the webview.
The permission model is an API contract, not a sandbox. Only install plugins
you trust, and only grant the permissions a plugin actually needs.
