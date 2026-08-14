import { createMemo, type JSX } from "solid-js";
import { t } from "../lib/i18n";
import { highlightCode } from "../lib/highlight";
import { X } from "phosphor-solid-js";

function CodeBlock(props: { code: string; file?: string }) {
  const html = createMemo(() => highlightCode(props.code, props.file ?? "main.js"));
  return (
    <pre
      class="my-3 overflow-x-auto rounded-lg border border-white/10 bg-[#14110d] p-3 font-mono text-[12px] leading-[1.7] text-[#d4d4d4]"
      innerHTML={html()}
    />
  );
}

function Doc({ title, children }: { title: string; children: JSX.Element }) {
  return (
    <section class="mb-8">
      <h3 class="mb-2 font-heading text-base font-semibold text-ink">{title}</h3>
      <div class="space-y-2 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

const MANIFEST = `{
  "id": "dev.signature",        // key installs are keyed by — lowercase a-z, 0-9, . _ -
  "name": "Signature",          // shown in the app and the store
  "version": "0.1.0",
  "description": "Adds a signature to every message you send.",
  "main": "main.js",            // the entry file the runtime evaluates
  "permissions": [              // the capabilities this plugin needs
    "commands",                 //   registerCommand
    "messages.read",            //   onMessage
    "messages.send",            //   beforeSend / onSent / sendMessage
    "navigation"                //   navigate / openChat / openUser
  ]
}`;

const PERMISSIONS = `// Omitting "permissions" grants the legacy default set:
//   commands, messages.read, messages.send, storage, api
//
// Everything else must be declared. ctx.hasPermission() tells you what you got:
if (ctx.hasPermission("users.read")) {
  const me = ctx.me();
}

// Denied capabilities throw at call time — degrade gracefully:
try {
  ctx.notify({ title: "Hi!" });
} catch {
  // notifications permission not granted — skip silently
}`;

const ACTIVATE = `// main.js — evaluated once when the plugin loads.
module.exports = {
  activate(ctx) {
    // ctx = the full plugin SDK. Register everything here.
  },
  deactivate(ctx) {
    // optional — runs when the plugin is disabled or uninstalled.
  },
};`;

const COMMAND = `ctx.registerCommand({
  id: "hello",
  label: "Say hello",           // appears as a button in the app's Plugins screen
  description: "Logs a greeting",
  run() {
    ctx.log("Hello from the command!");
  },
});`;

const SEND = `// Send through the app's own pipeline: beforeSend hooks run, DMs are
// E2EE-sealed, and the row is optimistic — plugins can't bypass any of it.
await ctx.sendMessage(chatId, "Hello from a plugin");
await ctx.sendMessage(chatId, "Reply!", { replyToId: messageId });
await ctx.sendMessage(chatId, "A capsule", {
  unlockAt: new Date(Date.now() + 60_000).toISOString(),
});

// Observe messages that actually made it out (yours included):
ctx.onSent((message) => {
  ctx.log("sent:", message.messageId, message.text);
});`;

const BEFORESEND = `// Rewrite text before it is sent. Return a string to replace it,
// return null to veto the message entirely.
ctx.beforeSend((text, event) => {
  if (event.chatId && text.includes("@compass")) return text;
  return text + "\\n— sent via Atlas";
});`;

const ONMESSAGE = `// Observe incoming messages (never your own echo). Fire-and-forget:
// the return value is ignored, so use this for counters, notifications, logs.
ctx.onMessage((message) => {
  ctx.log(message.chatId, message.text, message.authorId);
});`;

const DATA = `// Read-only access to live app state and the server.
const me = ctx.me();                     // your User, or null before sign-in
const chat = ctx.getChat(chatId);        // Chat snapshot or undefined
const user = await ctx.getUser(userId);  // User or null
const results = await ctx.searchUsers("atlas"); // User[]

// Move around the app.
ctx.openChat(chatId);
ctx.openUser(userId);
ctx.navigate("/settings");`;

const NOTIFY = `// OS notification (respects permission) + in-app pill.
ctx.notify({ title: "Price dropped!", body: "BTC is down 5%." });
ctx.toast("Saved.");`;

const STORAGE = `// Key-value storage scoped to your plugin, survives restarts.
ctx.storage.set("count", String(n));
const count = Number(ctx.storage.get("count") ?? "0");
ctx.storage.remove("count");

ctx.storage.setJSON("settings", { theme: "dark" });
const s = ctx.storage.getJSON("settings"); // { theme: "dark" } | null`;

const API = `// HTTP client rooted at the Atlas API, auth token attached.
const res = await ctx.api.fetch("/api/users?q=atlas");
const users = await res.json();

// Typed convenience — throws on non-2xx:
const users = await ctx.api.request("/api/users?q=atlas");`;

const EVENTS = `// Subscribe to app events; returns an unsubscribe function.
const off = ctx.events.on("chatOpened", ({ chatId }) => {
  ctx.log("opened", chatId);
});
off(); // later`;

const UI = `// Replace app chrome with your own Solid component (permission "ui").
// .tsx files compile on the fly; import solid-js and atlas/ui freely.
ctx.ui.mount("nav.bottom", ({ navigate, pathname }) => {
  return (
    <div style={{ position: "fixed", inset: "auto 0 0 0", display: "flex" }}>
      <button onClick={() => navigate("/")}>Chats</button>
      <button onClick={() => navigate("/settings")}>Settings</button>
    </div>
  );
});`;

const ATLAS = `// The atlas object is also available at the top level for one-liners:
atlas.registerCommand({ id: "x", label: "Run", run() { atlas.log("hi"); } });
atlas.log("plugin loaded");`;

export default function PluginDocs(props: { onClose: () => void }) {
  return (
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
        <h2 class="font-heading text-lg font-semibold text-ink">{t("pluginsEditor.docsTitle")}</h2>
        <button
          type="button"
          onClick={props.onClose}
          aria-label={t("pluginsEditor.docsClose")}
          class="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-bg hover:text-ink"
        >
          <X size={18} />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-5 py-6">
        <Doc title={t("pluginsEditor.docsOverview")}>
          <p>{t("pluginsEditor.docsOverviewBody")}</p>
          <CodeBlock code={ACTIVATE} />
          <a
            href="/plugindocs.md"
            target="_blank"
            rel="noopener"
            class="inline-block rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5"
          >
            Full SDK reference (plugindocs.md) ↗
          </a>
        </Doc>

        <Doc title={t("pluginsEditor.docsManifest")}>
          <p>{t("pluginsEditor.docsManifestBody")}</p>
          <CodeBlock code={MANIFEST} file="manifest.json" />
        </Doc>

        <Doc title={t("pluginsEditor.docsPermissions")}>
          <p>{t("pluginsEditor.docsPermissionsBody")}</p>
          <CodeBlock code={PERMISSIONS} />
        </Doc>

        <Doc title={t("pluginsEditor.docsApi")}>
          <p>
            <code class="rounded bg-surface px-1 py-0.5 font-mono text-[12px] text-ink">ctx</code>{" "}
            {t("pluginsEditor.docsApiBody")}
          </p>
          <CodeBlock code={COMMAND} />
          <CodeBlock code={ATLAS} />
        </Doc>

        <Doc title={t("pluginsEditor.docsHooks")}>
          <p>{t("pluginsEditor.docsHooksBody")}</p>
          <CodeBlock code={BEFORESEND} />
          <CodeBlock code={ONMESSAGE} />
        </Doc>

        <Doc title={t("pluginsEditor.docsSend")}>
          <p>{t("pluginsEditor.docsSendBody")}</p>
          <CodeBlock code={SEND} />
        </Doc>

        <Doc title={t("pluginsEditor.docsData")}>
          <p>{t("pluginsEditor.docsDataBody")}</p>
          <CodeBlock code={DATA} />
        </Doc>

        <Doc title={t("pluginsEditor.docsNotify")}>
          <p>{t("pluginsEditor.docsNotifyBody")}</p>
          <CodeBlock code={NOTIFY} />
        </Doc>

        <Doc title={t("pluginsEditor.docsStorage")}>
          <p>{t("pluginsEditor.docsStorageBody")}</p>
          <CodeBlock code={STORAGE} />
          <CodeBlock code={API} />
        </Doc>

        <Doc title={t("pluginsEditor.docsEvents")}>
          <p>{t("pluginsEditor.docsEventsBody")}</p>
          <CodeBlock code={EVENTS} />
        </Doc>

        <Doc title={t("pluginsEditor.docsUi")}>
          <p>{t("pluginsEditor.docsUiBody")}</p>
          <CodeBlock code={UI} file="src/main.tsx" />
        </Doc>

        <p class="text-xs text-ink-subtle">{t("pluginsEditor.docsTrust")}</p>
      </div>
    </div>
  );
}