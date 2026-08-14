// Atlas plugin SDK.
//
// Installed plugins are persisted by the Rust core (src-tauri/src/plugins.rs)
// and *executed* here, in the webview, because that's the only place their JS
// can interact with the UI. The SDK gives each plugin an explicit capability
// surface (the activate ctx / `atlas` object), gated by a permission model
// declared in the plugin's manifest. Plugins run un-sandboxed inside this
// page (it's `new Function`, not a VM), so they're trusted extensions, same
// as any other app code — permissions are an API contract, not a security
// boundary.
//
// Capabilities (manifest `permissions`):
//   commands        registerCommand
//   messages.read   onMessage                    (incoming)
//   messages.send   beforeSend, onSent, sendMessage
//   chats.read      getChat
//   users.read      me, getUser, searchUsers
//   navigation      navigate, openChat, openUser
//   notifications   notify, toast
//   storage         storage (get/set/remove/getJSON/setJSON)
//   api             api.fetch / api.request
//   events          events.on
//
// Omitting `permissions` grants the legacy default set so existing plugins
// keep working: commands, messages.read, messages.send, storage, api.
//
// When the app runs as a plain web build (no Tauri core), persistence falls
// back to localStorage so the feature still works in a browser — consistent
// with lib/tauri.ts's secrets fallback.

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";
import { apiBase, getToken } from "../data/api";
import { messagesStore } from "../store/messages";
import { chatsStore } from "../store/chats";
import { session } from "../store/session";
import { repository } from "../data/repository";
import type { Chat, User } from "../data/types";
import { pushToast } from "./toasts";
import { pluginNavigate } from "./nav";
import { sendPluginNotification } from "../lib/notify";
import { createLoader } from "./loader";
import { createHostModules } from "./host";
import { mountSlot, clearPluginSlots, registerConfigScreen, clearPluginConfig, type PluginComponent, type ConfigScreenComponent, type UiSlot } from "./ui-slots";

export { getConfigScreen, hasConfigScreen } from "./ui-slots";

// ---------- shared types ----------

export interface PluginRecord {
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  /** Plugin workspace: filename -> source (manifest.json, main.js, helpers). */
  files: Record<string, string>;
  enabled: boolean;
}

export interface PluginCommand {
  id: string;
  label: string;
  description?: string;
  run: () => void | Promise<void>;
}

/** A message this device saw, handed to onMessage / onSent. */
export interface PluginMessage {
  chatId: string;
  text: string;
  mine: boolean;
  authorId?: string;
  messageId?: string;
  sentAt?: string;
}

export interface BeforeSendEvent {
  chatId: string;
}

export type PluginPermission =
  | "commands"
  | "messages.read"
  | "messages.send"
  | "chats.read"
  | "users.read"
  | "navigation"
  | "notifications"
  | "storage"
  | "api"
  | "events"
  | "ui";

export const DEFAULT_PERMISSIONS: PluginPermission[] = [
  "commands",
  "messages.read",
  "messages.send",
  "storage",
  "api",
];

/** Send options mirror the app's own composer, minus attachments. */
export interface SendOptions {
  replyToId?: string;
  /** Time capsule: ISO instant before which the recipient can't read it. */
  unlockAt?: string;
}

export interface PluginEventMap {
  /** The app window became visible / was hidden (visibilitychange). */
  appVisible: void;
  appHidden: void;
  /** The user opened / closed a chat. */
  chatOpened: { chatId: string };
  chatClosed: { chatId: string };
}

export type PluginEventName = keyof PluginEventMap;

export interface PluginContext {
  plugin: { id: string; name: string; version: string; permissions: PluginPermission[] };
  permissions: PluginPermission[];
  hasPermission(permission: PluginPermission): boolean;

  // commands
  registerCommand(command: PluginCommand): void;

  // message hooks
  beforeSend(hook: (text: string, event: BeforeSendEvent) => string | null | void | Promise<string | null | void>): void;
  onMessage(hook: (message: PluginMessage) => void | Promise<void>): void;
  onSent(hook: (message: PluginMessage) => void | Promise<void>): void;

  // messaging
  sendMessage(chatId: string, text: string, opts?: SendOptions): Promise<void>;

  // data access
  me(): User | null;
  getChat(chatId: string): Chat | undefined;
  getUser(userId: string): Promise<User | null>;
  searchUsers(query: string): Promise<User[]>;

  // navigation
  navigate(path: string): void;
  openChat(chatId: string): void;
  openUser(userId: string): void;

  // notifications
  notify(options: { title: string; body?: string }): void;
  toast(message: string): void;

  // key-value storage scoped to this plugin (survives restarts)
  storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    getJSON<T>(key: string): T | null;
    setJSON(key: string, value: unknown): void;
  };

  // authenticated HTTP client rooted at the Atlas API
  api: {
    fetch(path: string, init?: RequestInit): Promise<Response>;
    request<T>(path: string, init?: RequestInit): Promise<T>;
  };

  // app event bus
  events: {
    on<K extends PluginEventName>(name: K, callback: (payload: PluginEventMap[K]) => void | Promise<void>): () => void;
    off<K extends PluginEventName>(name: K, callback: (payload: PluginEventMap[K]) => void | Promise<void>): void;
  };

  // UI: register a Solid component to replace an app chrome slot (nav.bottom
  // = bottom nav bar, nav.side = desktop rail, dialog = the shared modal
  // container). The app falls back to its built-in UI when a slot is unset.
  // configScreen registers the plugin's settings screen, opened from the
  // sliders button on its row in the Plugins screen.
  ui: {
    mount(slot: UiSlot, component: PluginComponent): void;
    configScreen(component: ConfigScreenComponent): void;
  };

  log(...args: unknown[]): void;
}

export interface AtlasPluginModule {
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(ctx: PluginContext): void | Promise<void>;
}

// ---------- persistence ----------

const WEB_STORE_KEY = "atlas.plugins.installed";
const STORAGE_PREFIX = "atlas.plugin.";

export async function listInstalled(): Promise<PluginRecord[]> {
  if (isTauri) {
    try {
      return await invoke<PluginRecord[]>("plugin_list");
    } catch (e) {
      console.warn("[atlas] plugin_list failed, falling back to web store:", e);
    }
  }
  try {
    const raw = localStorage.getItem(WEB_STORE_KEY);
    return raw ? (JSON.parse(raw) as PluginRecord[]) : [];
  } catch {
    return [];
  }
}

async function saveRecord(record: PluginRecord): Promise<void> {
  if (isTauri) {
    await invoke("plugin_save", { record });
    return;
  }
  const list = await listInstalled();
  const idx = list.findIndex((p) => p.pluginId === record.pluginId);
  if (idx >= 0) list[idx] = record;
  else list.push(record);
  localStorage.setItem(WEB_STORE_KEY, JSON.stringify(list));
}

async function removeRecord(pluginId: string): Promise<void> {
  if (isTauri) {
    await invoke("plugin_remove", { pluginId });
    return;
  }
  const list = await listInstalled();
  localStorage.setItem(
    WEB_STORE_KEY,
    JSON.stringify(list.filter((p) => p.pluginId !== pluginId)),
  );
}

// ---------- runtime state ----------

interface LoadedPlugin {
  record: PluginRecord;
  ctx: PluginContext;
  module: AtlasPluginModule;
}

type BeforeSendHook = PluginContext["beforeSend"] extends (hook: infer H) => void ? H : never;
type OnMessageHook = PluginContext["onMessage"] extends (hook: infer H) => void ? H : never;
type OnSentHook = PluginContext["onSent"] extends (hook: infer H) => void ? H : never;
type EventCallback<K extends PluginEventName> = PluginContext["events"]["on"] extends (n: K, cb: infer C) => unknown ? C : never;

const loaded = new Map<string, LoadedPlugin>();
const commands = new Map<string, PluginCommand[]>();
const beforeSendHooks = new Map<string, BeforeSendHook[]>();
const onMessageHooks = new Map<string, OnMessageHook[]>();
const onSentHooks = new Map<string, OnSentHook[]>();
const eventListeners = new Map<PluginEventName, Map<string, EventCallback<PluginEventName>[]>>();

const ALL_PERMISSIONS: PluginPermission[] = [
  "commands", "messages.read", "messages.send", "chats.read",
  "users.read", "navigation", "notifications", "storage", "api", "events", "ui",
];

/** Resolve the declared permissions from a plugin workspace (files map).
 *  Public so the marketplace can list them before install/activate. */
export function permissionsOf(files: Record<string, string>): PluginPermission[] {
  try {
    const manifest = JSON.parse(files?.["manifest.json"] ?? "{}") as {
      permissions?: unknown;
    };
    if (Array.isArray(manifest.permissions)) {
      const known = new Set<PluginPermission>(ALL_PERMISSIONS);
      const declared = manifest.permissions.filter(
        (p): p is PluginPermission => typeof p === "string" && known.has(p as PluginPermission),
      );
      if (declared.length > 0) return [...new Set(declared)];
    }
  } catch {
    /* fall through to defaults */
  }
  return [...DEFAULT_PERMISSIONS];
}

/** Resolve a plugin's declared permissions from its manifest. */
function permissionsOfRecord(record: PluginRecord): PluginPermission[] {
  return permissionsOf(record.files ?? {});
}

function createContext(record: PluginRecord): PluginContext {
  const pluginId = record.pluginId;
  const permissions = permissionsOfRecord(record);

  const require = (permission: PluginPermission) => {
    if (!permissions.includes(permission)) {
      throw new Error(
        `plugin "${record.name}" needs the "${permission}" permission — add it to manifest.json's "permissions".`,
      );
    }
  };

  const ctx: PluginContext = {
    plugin: { id: pluginId, name: record.name, version: record.version, permissions },
    permissions,
    hasPermission: (p) => permissions.includes(p),

    registerCommand: (cmd) => {
      require("commands");
      commands.get(pluginId)?.push(cmd);
    },
    beforeSend: (hook) => {
      require("messages.send");
      beforeSendHooks.get(pluginId)?.push(hook);
    },
    onMessage: (hook) => {
      require("messages.read");
      onMessageHooks.get(pluginId)?.push(hook);
    },
    onSent: (hook) => {
      require("messages.send");
      onSentHooks.get(pluginId)?.push(hook);
    },

    sendMessage: async (chatId, text, opts) => {
      require("messages.send");
      const chat = chatsStore.chat(chatId);
      // DMs need the peer id so the body can be encrypted before it goes out.
      const peerUserId = chat?.peerUserId;
      await messagesStore.send(chatId, text, {
        replyToId: opts?.replyToId,
        unlockAt: opts?.unlockAt,
        peerUserId,
      });
    },

    me: () => session.user(),
    getChat: (chatId) => {
      require("chats.read");
      return chatsStore.chat(chatId);
    },
    getUser: async (userId) => {
      require("users.read");
      try {
        return await repository.getUser(userId);
      } catch {
        return null;
      }
    },
    searchUsers: async (query) => {
      require("users.read");
      try {
        return await repository.searchUsers(query);
      } catch {
        return [];
      }
    },

    navigate: (path) => {
      require("navigation");
      pluginNavigate(path);
    },
    openChat: (chatId) => {
      require("navigation");
      pluginNavigate(`/chat/${chatId}`);
    },
    openUser: (userId) => {
      require("navigation");
      pluginNavigate(`/user/${userId}`);
    },

    notify: ({ title, body }) => {
      require("notifications");
      sendPluginNotification(title, body ?? "");
      pushToast(title);
    },
    toast: (message) => {
      require("notifications");
      pushToast(message);
    },

    storage: {
      get: (key) => localStorage.getItem(STORAGE_PREFIX + pluginId + "." + key),
      set: (key, value) => localStorage.setItem(STORAGE_PREFIX + pluginId + "." + key, value),
      remove: (key) => localStorage.removeItem(STORAGE_PREFIX + pluginId + "." + key),
      getJSON: <T,>(key: string) => {
        try {
          const raw = localStorage.getItem(STORAGE_PREFIX + pluginId + "." + key);
          return raw ? (JSON.parse(raw) as T) : null;
        } catch {
          return null;
        }
      },
      setJSON: (key, value) =>
        localStorage.setItem(STORAGE_PREFIX + pluginId + "." + key, JSON.stringify(value)),
    },

    api: {
      fetch: (path, init) => {
        require("api");
        const headers = new Headers(init?.headers);
        const token = getToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(`${apiBase()}${path}`, { ...init, headers });
      },
      request: async <T,>(path: string, init?: RequestInit) => {
        require("api");
        const res = await ctx.api.fetch(path, init);
        if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
        return res.json() as Promise<T>;
      },
    },

    events: {
      on: (name, callback) => {
        require("events");
        let list = eventListeners.get(name);
        if (!list) {
          list = new Map();
          eventListeners.set(name, list);
        }
        const callbacks = list.get(pluginId) ?? [];
        callbacks.push(callback as EventCallback<PluginEventName>);
        list.set(pluginId, callbacks);
        return () => {
          const cur = list?.get(pluginId) ?? [];
          list?.set(pluginId, cur.filter((c) => c !== (callback as EventCallback<PluginEventName>)));
        };
      },
      off: (name, callback) => {
        const list = eventListeners.get(name);
        if (!list) return;
        const cur = list.get(pluginId) ?? [];
        list.set(pluginId, cur.filter((c) => c !== (callback as EventCallback<PluginEventName>)));
      },
    },

    ui: {
      mount: (slot, component) => {
        require("ui");
        mountSlot(slot, pluginId, component as PluginComponent);
      },
      configScreen: (component) => {
        require("ui");
        registerConfigScreen(pluginId, component);
      },
    },

    log: (...args) => console.log(`[plugin:${pluginId}]`, ...args),
  };
  return ctx;
}

/** The entry module's workspace path — the manifest's "main" (may be a
 *  nested .ts/.tsx path), or src/main.tsx / main.tsx / main.js by convention. */
function entryPath(record: PluginRecord): string {
  const files = record.files ?? {};
  let main = "main.js";
  try {
    const manifest = JSON.parse(files["manifest.json"] ?? "{}") as { main?: string };
    if (typeof manifest.main === "string" && manifest.main.trim()) main = manifest.main.trim();
  } catch {
    /* fall through to the convention */
  }
  const candidates = [main, "src/main.tsx", "main.tsx", "main.ts", "main.js", "index.js"];
  for (const c of candidates) {
    if (files[c] !== undefined) return c;
  }
  return main;
}

async function activate(record: PluginRecord): Promise<LoadedPlugin> {
  commands.set(record.pluginId, []);
  beforeSendHooks.set(record.pluginId, []);
  onMessageHooks.set(record.pluginId, []);
  onSentHooks.set(record.pluginId, []);

  const ctx = createContext(record);
  const host = createHostModules(ctx);
  const loader = createLoader(record.files ?? {}, record.pluginId, host);
  const entry = entryPath(record);
  if (!(record.files ?? {})[entry]) throw new Error(`plugin has no entry file (manifest "main": ${entry})`);

  await loader.prepare("/" + entry);
  const mod = loader.evaluate("/" + entry);
  const raw = mod.exports as unknown;

  // After the CommonJS transform, a TSX module's `export default` lands on
  // `.default`; `module.exports = activate` is a bare function; and the
  // CommonJS shape is `{ activate }`.
  const exportsRecord = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const exported =
    typeof raw === "function"
      ? raw
      : (exportsRecord.default ?? exportsRecord.activate ?? exportsRecord);
  const module: AtlasPluginModule =
    typeof exported === "function"
      ? { activate: exported as AtlasPluginModule["activate"] }
      : (exported as unknown as AtlasPluginModule);

  if (!module || typeof module.activate !== "function") {
    throw new Error("plugin must export an activate(ctx) function");
  }

  void Promise.resolve(module.activate(ctx)).catch((e) =>
    console.error(`[atlas] plugin "${record.name}" activate failed:`, e),
  );

  return { record, ctx, module };
}

function deactivateAll() {
  for (const p of loaded.values()) {
    try {
      p.module.deactivate?.(p.ctx);
    } catch (e) {
      console.warn(`[atlas] plugin "${p.record.name}" deactivate failed:`, e);
    }
    clearPluginSlots(p.record.pluginId);
    clearPluginConfig(p.record.pluginId);
  }
  loaded.clear();
  commands.clear();
  beforeSendHooks.clear();
  onMessageHooks.clear();
  onSentHooks.clear();
  eventListeners.clear();
}

// ---------- public API ----------

let booted = false;

/** Load every enabled installed plugin. Called once at app start, and again
 *  whenever the plugin set changes. */
export async function init(): Promise<void> {
  booted = true;
  await reload();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      const visible = document.visibilityState === "visible";
      emitPluginEvent(visible ? "appVisible" : "appHidden", undefined);
    });
  }
}

export async function reload(): Promise<void> {
  deactivateAll();
  const records = await listInstalled();
  await Promise.all(
    records.map(async (record) => {
      if (!record.enabled) return;
      try {
        loaded.set(record.pluginId, await activate(record));
      } catch (e) {
        console.error(`[atlas] plugin "${record.name}" failed to load:`, e);
      }
    }),
  );
}

export async function installPlugin(record: PluginRecord): Promise<void> {
  await saveRecord(record);
  await reload();
}

export async function installFromStore(storePlugin: {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  files: Record<string, string>;
}): Promise<void> {
  await installPlugin({
    pluginId: storePlugin.pluginId,
    name: storePlugin.name,
    version: storePlugin.version,
    description: storePlugin.description,
    author: storePlugin.author,
    files: storePlugin.files,
    enabled: true,
  });
  // Best-effort download counter for the store.
  try {
    await fetch(`${apiBase()}/api/plugins/${storePlugin.id}/install`, { method: "POST" });
  } catch {
    /* analytics only */
  }
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  await removeRecord(pluginId);
  await reload();
}

export async function setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
  const record = (await listInstalled()).find((p) => p.pluginId === pluginId);
  if (!record) return;
  await saveRecord({ ...record, enabled });
  await reload();
}

export function isBooted(): boolean {
  return booted;
}

export function commandList(): { pluginId: string; pluginName: string; command: PluginCommand }[] {
  const out: { pluginId: string; pluginName: string; command: PluginCommand }[] = [];
  for (const [pluginId, list] of commands) {
    const name = loaded.get(pluginId)?.record.name ?? pluginId;
    for (const command of list) out.push({ pluginId, pluginName: name, command });
  }
  return out;
}

export function runCommand(pluginId: string, commandId: string): void {
  const command = commands.get(pluginId)?.find((c) => c.id === commandId);
  if (!command) return;
  void Promise.resolve(command.run()).catch((e) =>
    console.error(`[atlas] plugin command "${commandId}" failed:`, e),
  );
}

/** Run every plugin's beforeSend hook in order. A hook returning null/undefined
 *  leaves the text as-is; returning a string replaces it for all later hooks
 *  and for the message that actually goes out. */
export async function transformBeforeSend(chatId: string, text: string): Promise<string | null> {
  let result: string | null = text;
  for (const hooks of beforeSendHooks.values()) {
    for (const hook of hooks) {
      try {
        const next = await hook(result, { chatId });
        if (next === null) return null; // plugin vetoed the send
        if (typeof next === "string") result = next;
      } catch (e) {
        console.error("[atlas] plugin beforeSend hook failed:", e);
      }
    }
  }
  return result;
}

/** Fire-and-forget notification of an incoming (not self-sent) message. */
export function emitMessageReceived(message: PluginMessage): void {
  for (const hooks of onMessageHooks.values()) {
    for (const hook of hooks) {
      void Promise.resolve(hook(message)).catch((e) =>
        console.error("[atlas] plugin onMessage hook failed:", e),
      );
    }
  }
}

/** Fire-and-forget notification of a message that was actually sent. */
export function emitMessageSent(message: PluginMessage): void {
  for (const hooks of onSentHooks.values()) {
    for (const hook of hooks) {
      void Promise.resolve(hook(message)).catch((e) =>
        console.error("[atlas] plugin onSent hook failed:", e),
      );
    }
  }
}

/** Fan out an app event to every subscribed plugin. */
export function emitPluginEvent<K extends PluginEventName>(
  name: K,
  payload: PluginEventMap[K],
): void {
  const list = eventListeners.get(name);
  if (!list) return;
  for (const callbacks of list.values()) {
    for (const cb of callbacks) {
      void Promise.resolve((cb as (p: PluginEventMap[K]) => void | Promise<void>)(payload)).catch(
        (e) => console.error(`[atlas] plugin "${name}" event handler failed:`, e),
      );
    }
  }
}

/** Where the marketing site's plugin editor lives, for the "Create plugin"
 *  entry point that redirects there. In production the server serves both the
 *  API and the site, so apiBase() (or "") is exactly the right origin. */
export function pluginEditorUrl(): string {
  return `${apiBase()}/plugins`;
}

/** A plugin's icon, if the manifest names an icon file in its workspace.
 *  Returns a data URL (SVG/PNG/etc. from the file's content) or null. A file
 *  that's already a data URL (e.g. an uploaded image) passes through as-is. */
export function pluginIcon(record: PluginRecord): string | null {
  return pluginIconFromFiles(record.files ?? {});
}

/** Same as pluginIcon, but takes a raw workspace file map (e.g. a store
 *  plugin's files) instead of a persisted record. */
export function pluginIconFromFiles(files: Record<string, string>): string | null {
  try {
    const manifest = JSON.parse(files?.["manifest.json"] ?? "{}") as { icon?: string };
    const path = typeof manifest.icon === "string" ? manifest.icon : null;
    if (!path) return null;
    const content = files?.[path];
    if (!content) return null;
    if (content.startsWith("data:")) return content;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/svg+xml";
    return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  } catch {
    return null;
  }
}
