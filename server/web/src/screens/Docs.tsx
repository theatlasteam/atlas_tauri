import { createMemo, For, type JSX } from "solid-js";
import { highlightCode } from "../lib/highlight";
import logo from "../assets/logo.svg";

type Book = "plugins" | "bots";

function bookFromPath(): Book {
  const path = window.location.pathname.replace(/\/+$/, "") || "/docs";
  if (path.startsWith("/docs/bots")) return "bots";
  return "plugins";
}

function Code(props: { code: string; file?: string }) {
  const html = createMemo(() => highlightCode(props.code, props.file ?? "main.js"));
  return (
    <pre
      class="my-4 overflow-x-auto rounded-xl border border-border bg-[#14110d] p-4 font-mono text-[12.5px] leading-[1.7] text-[#d4d4d4]"
      innerHTML={html()}
    />
  );
}

function H(props: { id: string; children: JSX.Element }) {
  return (
    <h2 id={props.id} class="mb-3 mt-12 scroll-mt-24 font-heading text-2xl font-semibold text-ink first:mt-0">
      {props.children}
    </h2>
  );
}

function P(props: { children: JSX.Element }) {
  return <p class="mb-4 text-[15px] leading-relaxed text-ink-muted">{props.children}</p>;
}

function Table(props: { columns: string[]; rows: string[][] }) {
  return (
    <div class="mb-6 overflow-x-auto rounded-xl border border-border">
      <table class="w-full text-left text-sm">
        <thead class="bg-surface text-ink">
          <tr>
            <For each={props.columns}>
              {(c) => <th class="border-b border-border px-3 py-2 font-semibold">{c}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr class="border-b border-border/70 last:border-0">
                <For each={row}>
                  {(cell, i) => (
                    <td class="px-3 py-2 align-top text-ink-muted">
                      {i() === 0 ? <code class="font-mono text-[12px] text-ink">{cell}</code> : cell}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

const PLUGIN_NAV = [
  ["overview", "Overview"],
  ["workspace", "Workspace"],
  ["manifest", "Manifest"],
  ["permissions", "Permissions"],
  ["activate", "activate()"],
  ["commands", "Commands"],
  ["messages", "Messages"],
  ["data", "Data & nav"],
  ["ui", "UI slots"],
  ["mcp", "MCP"],
] as const;

const BOT_NAV = [
  ["overview", "Overview"],
  ["create", "Create a bot"],
  ["manifest", "Manifest"],
  ["reply", "reply()"],
  ["buttons", "Buttons & mini apps"],
  ["polling", "Long polling"],
  ["webhook", "Webhook"],
  ["token", "Token"],
  ["send", "Send API"],
  ["limits", "Limits"],
] as const;

function PluginsBody() {
  return (
    <div>
      <H id="overview">Plugins</H>
      <P>
        Plugins are workspaces you write at{" "}
        <a class="text-accent underline-offset-2 hover:underline" href="/plugins">
          atlasmsg.app/plugins
        </a>
        , publish to the store, and install in the Atlas app. They run in the
        messenger as trusted extensions: TypeScript/TSX compiles on the fly, then
        the runtime calls <code class="font-mono text-ink">activate(ctx)</code>.
      </P>
      <P>
        There is no sandbox VM. Permissions in the manifest are an API contract —
        missing a permission throws when you call that API, it does not hide the
        rest of the page.
      </P>

      <H id="workspace">Workspace</H>
      <P>A plugin is a folder of files. The editor is the same VS Code-style tree you publish from.</P>
      <Code
        file="README.md"
        code={`my-plugin/
  manifest.json
  icon.svg
  src/
    main.tsx      ← entry (manifest "main")
    Nav.tsx
    helper.ts`}
      />
      <P>
        Each <code class="font-mono text-ink">.ts/.tsx/.js/.jsx</code> file is a
        module. Relative imports resolve inside the plugin; these bare imports
        resolve to the host:
      </P>
      <Table
        columns={["Import", "What you get"]}
        rows={[
          ["solid-js", "The app's Solid runtime"],
          ["solid-js/web", "render, Portal, …"],
          ["solid-js/store", "createStore, produce, …"],
          ["atlas", "The plugin SDK (same as ctx)"],
          ["atlas/ui", "Avatar, Dialog, Switch, Menu, …"],
        ]}
      />
      <P>
        Tailwind classes in plugin files are never compiled. Use inline styles and
        CSS variables: <code class="font-mono text-[12px] text-ink">var(--color-accent)</code>,{" "}
        <code class="font-mono text-[12px] text-ink">var(--color-ink)</code>,{" "}
        <code class="font-mono text-[12px] text-ink">var(--color-surface)</code>,{" "}
        <code class="font-mono text-[12px] text-ink">var(--color-border)</code>.
      </P>

      <H id="manifest">manifest.json</H>
      <Table
        columns={["Field", "Required", "Description"]}
        rows={[
          ["id", "yes", "Install key: lowercase a-z, 0-9, . _ -. Frozen after publish."],
          ["name", "yes", "Display name in the store and the app."],
          ["version", "yes", "Semver-ish version string."],
          ["main", "yes", "Entry file, usually src/main.tsx."],
          ["description", "no", "One line on the store card."],
          ["permissions", "no", "Capabilities. Omitted → legacy default set."],
          ["icon", "no", "Path to icon.svg / icon.png in the workspace."],
        ]}
      />
      <Code
        file="manifest.json"
        code={`{
  "id": "dev.signature",
  "name": "Signature",
  "version": "0.1.0",
  "description": "Append a signature to outgoing messages.",
  "main": "src/main.tsx",
  "icon": "icon.svg",
  "permissions": ["commands", "messages.send", "storage"]
}`}
      />
      <P>Authorship is not in the manifest. It comes from the Atlas account that published the plugin.</P>

      <H id="permissions">Permissions</H>
      <P>
        Default when <code class="font-mono text-ink">permissions</code> is omitted:{" "}
        <code class="font-mono text-[12px] text-ink">commands</code>,{" "}
        <code class="font-mono text-[12px] text-ink">messages.read</code>,{" "}
        <code class="font-mono text-[12px] text-ink">messages.send</code>,{" "}
        <code class="font-mono text-[12px] text-ink">storage</code>,{" "}
        <code class="font-mono text-[12px] text-ink">api</code>.
      </P>
      <Table
        columns={["Permission", "Unlocks"]}
        rows={[
          ["commands", "ctx.registerCommand"],
          ["messages.read", "ctx.onMessage"],
          ["messages.send", "ctx.beforeSend, ctx.onSent, ctx.sendMessage"],
          ["chats.read", "ctx.getChat"],
          ["users.read", "ctx.me, ctx.getUser, ctx.searchUsers"],
          ["navigation", "ctx.navigate, ctx.openChat, ctx.openUser"],
          ["notifications", "ctx.notify, ctx.toast"],
          ["storage", "ctx.storage"],
          ["api", "ctx.api.fetch / ctx.api.request"],
          ["events", "ctx.events.on"],
          ["ui", "ctx.ui.mount, ctx.ui.configScreen"],
        ]}
      />
      <Code
        code={`if (ctx.hasPermission("users.read")) {
  const me = ctx.me();
}
try {
  ctx.notify({ title: "Hi" });
} catch {
  // notifications not granted
}`}
      />

      <H id="activate">activate(ctx)</H>
      <P>The entry file must export activate. Optional deactivate runs on disable/uninstall.</P>
      <Code
        file="src/main.tsx"
        code={`import { createSignal } from "solid-js";

export function activate(ctx) {
  ctx.log("loaded", ctx.plugin.id);
}

export function deactivate(ctx) {
  ctx.log("bye");
}`}
      />
      <P>
        CommonJS <code class="font-mono text-ink">module.exports = {"{ activate }"}</code> also
        works. The global <code class="font-mono text-ink">atlas</code> object is the same SDK
        for one-liners.
      </P>

      <H id="commands">Commands</H>
      <P>Commands show as buttons on the in-app Plugins screen.</P>
      <Code
        code={`ctx.registerCommand({
  id: "hello",
  label: "Say hello",
  description: "Logs a greeting",
  run() {
    ctx.log("Hello from the command");
  },
});`}
      />

      <H id="messages">Messages</H>
      <P>
        Sends go through the real composer pipeline: beforeSend hooks, E2EE on DMs,
        optimistic rows. Plugins cannot bypass encryption.
      </P>
      <Code
        code={`ctx.beforeSend((text, event) => {
  return text + "\\n— via Atlas";
});

ctx.onMessage((message) => {
  ctx.log(message.chatId, message.text);
});

ctx.onSent((message) => {
  ctx.log("sent", message.messageId);
});

await ctx.sendMessage(chatId, "Hello");
await ctx.sendMessage(chatId, "Reply", { replyToId });
await ctx.sendMessage(chatId, "Later", {
  unlockAt: new Date(Date.now() + 60_000).toISOString(),
});`}
      />

      <H id="data">Data, navigation, storage, HTTP</H>
      <Code
        code={`const me = ctx.me();
const chat = ctx.getChat(chatId);
const user = await ctx.getUser(userId);
const hits = await ctx.searchUsers("atlas");

ctx.openChat(chatId);
ctx.openUser(userId);
ctx.navigate("/settings");

ctx.storage.set("n", "1");
ctx.storage.setJSON("prefs", { theme: "dark" });
const prefs = ctx.storage.getJSON("prefs");

const users = await ctx.api.request("/api/users?q=atlas");
ctx.notify({ title: "Done", body: "Saved." });
ctx.toast("Saved.");

const off = ctx.events.on("chatOpened", ({ chatId }) => {
  ctx.log("opened", chatId);
});
off();`}
      />

      <H id="ui">UI slots</H>
      <P>
        With the <code class="font-mono text-ink">ui</code> permission you can replace chrome.
        Components receive <code class="font-mono text-ink">{"{ navigate, pathname }"}</code>.
        The <code class="font-mono text-ink">dialog</code> slot owns its own backdrop.
      </P>
      <Table
        columns={["Slot", "Replaces"]}
        rows={[
          ["nav.bottom", "Mobile bottom bar"],
          ["nav.side", "Desktop left rail"],
          ["dialog", "Shared modal (backdrop + sheet)"],
        ]}
      />
      <Code
        file="src/main.tsx"
        code={`ctx.ui.mount("nav.bottom", ({ navigate, pathname }) => {
  return (
    <div style={{ position: "fixed", inset: "auto 0 0 0", display: "flex" }}>
      <button onClick={() => navigate("/")}>Chats</button>
      <button onClick={() => navigate("/settings")}>Settings</button>
    </div>
  );
});

ctx.ui.configScreen(({ plugin, onClose }) => (
  <div style={{ padding: "20px", color: "var(--color-ink)" }}>
    <h2>{plugin.name}</h2>
    <button onClick={onClose}>Close</button>
  </div>
));`}
      />

      <H id="mcp">MCP</H>
      <P>
        Assistants can publish plugins over Model Context Protocol at{" "}
        <code class="font-mono text-ink">https://atlasmsg.app/mcp</code> (streamable HTTP).
      </P>
      <Table
        columns={["Tool", "Notes"]}
        rows={[
          ["list_plugins", "Public store browse"],
          ["get_plugin", "Files + metadata"],
          ["validate_plugin", "No write"],
          ["create_plugin", "Needs Atlas session token"],
          ["update_plugin", "Owner only"],
          ["delete_plugin", "Owner only"],
          ["read_docs", "This SDK, as markdown"],
        ]}
      />
      <P>
        Pass the session token as the <code class="font-mono text-ink">token</code> argument
        (or Authorization: Bearer). Example:{" "}
        <code class="font-mono text-[12px] text-ink">mcp --transport streamable-http https://atlasmsg.app/mcp</code>
      </P>
    </div>
  );
}

function BotsBody() {
  return (
    <div>
      <H id="overview">Bots</H>
      <P>
        A bot is a special Atlas user you own. People search the handle and DM it
        in plaintext (bots have no E2EE keys). You reply from{" "}
        <code class="font-mono text-ink">src/bot.js</code> rules, from a webhook, or
        by long-polling like aiogram (<code class="font-mono text-ink">GET /api/bot/updates</code>).
      </P>
      <P>
        Create and edit bots at{" "}
        <a class="text-accent underline-offset-2 hover:underline" href="/bots">
          atlasmsg.app/bots
        </a>
        . The editor is the same file tree as plugins: manifest, icon, source,
        README.
      </P>

      <H id="create">Create a bot</H>
      <P>
        Sign in with your Atlas account, click New bot, pick a handle (3–32
        letters, digits, underscore) and a display name. The handle is the
        username people message. It cannot be a handle that already exists.
      </P>
      <P>
        Atlas mints a token immediately and shows it in the editor title bar.
        Copy it. You can always open Token in the toolbar to copy or regenerate.
      </P>

      <H id="manifest">Workspace & manifest</H>
      <Code
        file="README.md"
        code={`my-bot/
  manifest.json
  icon.svg
  src/
    bot.js
  README.md`}
      />
      <Code
        file="manifest.json"
        code={`{
  "id": "bot.weather",
  "name": "Weather Bot",
  "version": "0.1.0",
  "main": "src/bot.js"
}`}
      />
      <P>
        <code class="font-mono text-ink">main</code> should point at the file that
        contains <code class="font-mono text-ink">reply()</code> calls. The server
        also looks at <code class="font-mono text-ink">src/bot.js</code> and{" "}
        <code class="font-mono text-ink">bot.js</code>. Extra files are stored with
        the bot but only the JS entry is executed as rules (not a Node process).
      </P>

      <H id="reply">reply(), keyboard(), image()</H>
      <P>
        First matching rule wins. Comparison is case-insensitive. A trigger matches
        if it equals the message, or the message starts with it.{" "}
        <code class="font-mono text-ink">*</code> matches everything.{" "}
        <code class="font-mono text-ink">{"{{text}}"}</code> is replaced with the
        incoming DM.
      </P>
      <Code
        file="src/bot.js"
        code={`welcome("Hi — tap Start to talk to me.");

reply("/start", "Welcome! Pick something.");
keyboard("/start", [
  [
    { "label": "Weather", "data": "/weather", "icon": "☀️", "edit": true },
    { "label": "Help", "data": "/help", "icon": "❓", "edit": true }
  ],
  [{ "label": "Open app", "app": "https://s.atlasmsg.app/s/YOUR_SPACE" }]
]);

reply("/weather", "Fetching…");
fetch("/weather", "https://wttr.in/?format=3");
keyboard("/weather", [[{ "label": "Back", "data": "/start", "edit": true }]]);

reply("*", "You said {{text}}");`}
      />
      <Table
        columns={["Call", "Does"]}
        rows={[
          ["reply(on, text)", "Caption. Markdown allowed, including ![alt](https://…) images."],
          ["keyboard(on, rows)", "Grid under the bubble. Each inner array is a row."],
          ["image(on, https url)", "Atlas fetches the image (https, ≤5 MiB) and attaches it."],
          ["icon(on, emoji)", "Puts that emoji at the top of the reply."],
          ["welcome(text)", "Shown in an empty chat with a Start button."],
          ["fetch(on, https)", "Atlas GETs the URL and uses the body as the reply."],
        ]}
      />

      <H id="buttons">Buttons, navigation, mini apps</H>
      <P>
        Tapping a button with <code class="font-mono text-ink">data</code> runs that
        trigger and, with <code class="font-mono text-ink">edit: true</code>, rewrites
        the same bubble (menus, wizards). <code class="font-mono text-ink">url</code>{" "}
        opens a link. <code class="font-mono text-ink">app</code> opens a mini-app
        iframe; the page can <code class="font-mono text-ink">parent.postMessage({"{ atlasWebAppData: \"…\" }"})</code>{" "}
        to send a callback. <code class="font-mono text-ink">fetch</code> on a button
        loads live text into the bubble.
      </P>
      <P>
        Bot-to-bot loops are ignored: if the author is already a bot, Atlas does
        not dispatch. Rules only run on plaintext DMs, not groups or encrypted
        chats.
      </P>

      <H id="polling">Long polling (aiogram-style)</H>
      <P>
        In Token & delivery, choose Long polling. Atlas will not auto-run script
        replies. Your process holds the token and calls:
      </P>
      <Code
        file="python"
        code={`import time, requests
TOKEN = "atlasbot_…"
API = "https://atlasmsg.app/api/bot"
H = {"Authorization": f"Bearer {TOKEN}"}
offset = 0
while True:
    r = requests.get(f"{API}/updates", headers=H, params={"offset": offset, "timeout": 25}, timeout=30)
    for u in r.json().get("result", []):
        offset = u["updateId"] + 1
        chat = u["chatId"]
        text = u.get("text") or u.get("data") or ""
        requests.post(f"{API}/messages", headers=H, json={
            "chatId": chat,
            "text": f"you said {text}",
            "messageId": u.get("messageId"),  # set to edit that bubble
        })`}
      />
      <P>
        <code class="font-mono text-ink">GET /api/bot/updates?offset=&timeout=</code>{" "}
        waits up to 30s. Pass the next <code class="font-mono text-ink">updateId + 1</code>{" "}
        as offset to ack. Send with <code class="font-mono text-ink">POST /api/bot/messages</code>.
        Include <code class="font-mono text-ink">messageId</code> to edit an existing
        message instead of posting a new one.
      </P>

      <H id="webhook">Webhook</H>
      <P>
        In Token & webhook, set a URL. On every human DM, Atlas POSTs JSON. You
        still get reply() matches as well if you defined them.
      </P>
      <Code
        file="webhook.json"
        code={`POST https://your.server/hook
Content-Type: application/json

{
  "chatId": "8f3c…",
  "from": "user-uuid",
  "text": "/start"
}`}
      />
      <P>Respond to that POST however you like. To send a chat message back, use the Send API below — the webhook response body is not a reply.</P>

      <H id="token">Token</H>
      <P>
        Format: <code class="font-mono text-ink">atlasbot_</code> plus hex. Stored
        on the bot so you can copy it whenever you open the editor. Regenerating
        invalidates the previous token immediately.
      </P>
      <P>Send it as a Bearer token. Never put it in the plugin store or a public repo.</P>

      <H id="send">Send API</H>
      <Code
        file="sh"
        code={`curl -X POST https://atlasmsg.app/api/bot/messages \\
  -H "Authorization: Bearer atlasbot_…" \\
  -H "Content-Type: application/json" \\
  -d '{"chatId":"8f3c…","text":"Hello from the bot"}'`}
      />
      <Table
        columns={["Field", "Notes"]}
        rows={[
          ["chatId", "UUID of the DM. Same value as the webhook payload."],
          ["text", "Caption, 0–8000 characters (required unless image)."],
          ["buttons", "[{ label, url?, data?, icon?, row? }]"],
          ["imageUrl", "https image Atlas fetches and attaches (≤5 MiB)."],
          ["attachmentId", "An attachment you already uploaded as the bot user."],
        ]}
      />
      <P>
        The bot must be a member of that chat (it is, once someone DMs it). HTTP
        401 means a bad token. Manage bots with the same Atlas session you use for
        plugins:
      </P>
      <Table
        columns={["Method", "Path", "Auth"]}
        rows={[
          ["GET", "/api/bots", "Atlas session — list yours"],
          ["POST", "/api/bots", "session — { handle, name }"],
          ["PATCH", "/api/bots/{id}", "session — { name, webhookUrl, script }"],
          ["DELETE", "/api/bots/{id}", "session"],
          ["POST", "/api/bots/{id}/token", "session — rotate"],
          ["POST", "/api/bot/messages", "bot token — send (messageId edits)"],
          ["GET", "/api/bot/updates", "bot token — long poll"],
        ]}
      />

      <H id="limits">Limits</H>
      <Table
        columns={["Rule", "Value"]}
        rows={[
          ["Handle", "3–32, [a-z0-9_]"],
          ["Display name", "1–80 characters"],
          ["Message body", "1–8000 characters via bot send"],
          ["Dispatch", "Plaintext DMs only"],
          ["Encryption", "None — bots cannot open olm-v1"],
        ]}
      />
    </div>
  );
}

export default function Docs() {
  const book = bookFromPath();
  const nav = book === "bots" ? BOT_NAV : PLUGIN_NAV;
  const prefix = book === "bots" ? "/docs/bots" : "/docs/plugins";

  return (
    <div class="min-h-screen bg-bg text-ink">
      <div class="grain-overlay" />
      <header class="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div class="flex items-center gap-2">
            <a href="/" class="flex items-center gap-2 font-heading text-base font-semibold">
              <img src={logo} alt="" width="22" height="16" />
              <span class="hidden sm:inline">Atlas</span>
            </a>
            <span class="text-ink-subtle/60">/</span>
            <span class="font-heading text-base font-semibold">Docs</span>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <a href="/plugins" class="text-ink-subtle transition hover:text-ink">
              Plugins
            </a>
            <a href="/bots" class="text-ink-subtle transition hover:text-ink">
              Bots
            </a>
            <a
              href="/"
              class="rounded-pill border border-border bg-surface px-4 py-1.5 font-medium transition hover:border-accent/40 hover:text-accent"
            >
              Home
            </a>
          </div>
        </div>
      </header>

      <div class="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        <aside class="sticky top-20 hidden h-[calc(100vh-6rem)] w-52 shrink-0 overflow-y-auto md:block">
          <p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">Developers</p>
          <a
            href="/docs/plugins"
            class="mb-1 block rounded-lg px-2 py-1.5 text-sm"
            classList={{
              "bg-surface font-semibold text-ink": book === "plugins",
              "text-ink-muted hover:text-ink": book !== "plugins",
            }}
          >
            Plugins
          </a>
          <a
            href="/docs/bots"
            class="mb-4 block rounded-lg px-2 py-1.5 text-sm"
            classList={{
              "bg-surface font-semibold text-ink": book === "bots",
              "text-ink-muted hover:text-ink": book !== "bots",
            }}
          >
            Bots
          </a>
          <p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">On this page</p>
          <nav class="flex flex-col gap-0.5">
            <For each={[...nav]}>
              {([id, label]) => (
                <a href={`${prefix}#${id}`} class="rounded-md px-2 py-1 text-[13px] text-ink-muted hover:bg-surface hover:text-ink">
                  {label}
                </a>
              )}
            </For>
          </nav>
        </aside>

        <main class="min-w-0 max-w-3xl flex-1 pb-24">
          <div class="mb-8 flex gap-2 md:hidden">
            <a
              href="/docs/plugins"
              class="rounded-pill border px-3 py-1 text-sm"
              classList={{
                "border-accent bg-accent-soft text-accent": book === "plugins",
                "border-border text-ink-muted": book !== "plugins",
              }}
            >
              Plugins
            </a>
            <a
              href="/docs/bots"
              class="rounded-pill border px-3 py-1 text-sm"
              classList={{
                "border-accent bg-accent-soft text-accent": book === "bots",
                "border-border text-ink-muted": book !== "bots",
              }}
            >
              Bots
            </a>
          </div>
          {book === "bots" ? <BotsBody /> : <PluginsBody />}
        </main>
      </div>
    </div>
  );
}
