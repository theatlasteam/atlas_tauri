import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  createBot,
  deleteBot,
  fetchMe,
  getPluginToken,
  listBots,
  loginDeveloper,
  logoutDeveloper,
  registerDeveloper,
  rotateBotToken,
  setPluginToken,
  updateBot,
  type BotDto,
  type DeveloperAccount,
} from "../lib/api";
import { t } from "../lib/i18n";
import { highlightCode, isValidFileName, languageOf } from "../lib/highlight";
import PluginAuth from "../components/PluginAuth";
import DevAvatar from "../components/DevAvatar";
import Reveal from "../components/Reveal";
import { CaretRight, Folder, PencilLine, Plus, Sparkle, X } from "phosphor-solid-js";
import logo from "../assets/logo.svg";

const DEFAULT_FILES: Record<string, string> = {
  "manifest.json": JSON.stringify(
    {
      id: "bot.example",
      name: "My bot",
      version: "0.1.0",
      main: "src/bot.js",
    },
    null,
    2,
  ),
  "icon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#c9772e"/>
  <text x="32" y="42" text-anchor="middle" font-size="28" fill="#fff">B</text>
</svg>
`,
  "src/bot.js": `// First matching reply() wins. "*" matches anything.
// keyboard(trigger, rows) — grid under the bubble. image(trigger, https url).

reply("/start", "Welcome! Pick something.");
keyboard("/start", [
  [{ "label": "Weather", "data": "/weather", "icon": "☀️" }, { "label": "Help", "data": "/help", "icon": "❓" }],
  [{ "label": "Atlas", "url": "https://atlasmsg.app", "icon": "✨" }]
]);

reply("/weather", "Looks clear from here.");
reply("/help", "Tap a button or send /start.");
reply("*", "You said {{text}}");
`,
  "README.md": `# My bot

People DM this handle. Replies come from \`src/bot.js\`, or POST your webhook
\`{ chatId, from, text }\` and reply with:

\`POST /api/bot/messages\`
\`Authorization: Bearer <token>\`
`,
};

function encodeScript(files: Record<string, string>): string {
  return JSON.stringify({ files });
}

function decodeScript(script: string): Record<string, string> {
  try {
    const v = JSON.parse(script) as { files?: Record<string, string>; replies?: unknown };
    if (v.files && typeof v.files === "object") {
      return { ...DEFAULT_FILES, ...v.files };
    }
    if (Array.isArray(v.replies)) {
      const js = (v.replies as { on: string; say: string }[])
        .map((r) => `reply(${JSON.stringify(r.on)}, ${JSON.stringify(r.say)});`)
        .join("\n");
      return { ...DEFAULT_FILES, "src/bot.js": js ? `${js}\n` : DEFAULT_FILES["src/bot.js"] };
    }
  } catch {
    if (script.trim()) return { ...DEFAULT_FILES, "src/bot.js": script };
  }
  return { ...DEFAULT_FILES };
}

function go(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function locationMode(): { id: string | null; creating: boolean } {
  const q = new URLSearchParams(window.location.search);
  if (q.get("new") === "1") return { id: null, creating: true };
  const id = q.get("id");
  return { id: id && id.length > 0 ? id : null, creating: false };
}

type TreeEntry = string | { name: string; children: TreeEntry[] };

const FILE_TYPE_ICONS: { match: RegExp; glyph: string; color: string }[] = [
  { match: /^manifest\.json$/, glyph: "ffont-settings", color: "#c9772e" },
  { match: /\.json$/, glyph: "ffont-json", color: "#9cdcfe" },
  { match: /\.js$/, glyph: "ffont-javascript", color: "#f7df1e" },
  { match: /\.css$/, glyph: "ffont-css", color: "#42a5f5" },
  { match: /\.html?$/, glyph: "ffont-html", color: "#e44d26" },
  { match: /\.tsx?$/, glyph: "ffont-typescript", color: "#3178c6" },
  { match: /\.md$/, glyph: "ffont-markdown", color: "#519aba" },
  { match: /\.svg$/, glyph: "ffont-svg", color: "#ffb13b" },
  { match: /\.ya?ml$/, glyph: "ffont-yaml", color: "#cb171e" },
];

function FileIcon(props: { name: string; active: boolean }) {
  const hit = FILE_TYPE_ICONS.find((f) => f.match.test(props.name));
  return (
    <i
      class={`ffont ${hit?.glyph ?? "ffont-file"} shrink-0 not-italic`}
      classList={{ "opacity-50": !props.active }}
      style={{ color: hit?.color ?? "#8a8171", "font-size": "15px", "line-height": "1" }}
      aria-hidden="true"
    />
  );
}

function TreeRow(props: {
  entry: TreeEntry;
  prefix: string;
  collapsed: Set<string>;
  activeName: string;
  mainFile: string;
  onSelect: (name: string) => void;
  onToggle: (prefix: string) => void;
  onDelete: (name: string) => void;
}) {
  if (typeof props.entry === "string") {
    const name = props.entry;
    return (
      <div class="group relative flex items-center" classList={{ "bg-white/10": props.activeName === name }}>
        <button
          type="button"
          onClick={() => props.onSelect(name)}
          class="flex w-full items-center gap-2 truncate px-3 py-1.5 text-left font-mono text-xs transition"
          classList={{
            "text-[#f2ede2]": props.activeName === name,
            "text-[#8a8171] hover:text-[#f2ede2]": props.activeName !== name,
          }}
        >
          <FileIcon name={name} active={props.activeName === name} />
          <span class="truncate">{name.split("/").pop()}</span>
        </button>
        <Show when={name !== "manifest.json" && name !== props.mainFile && name !== "icon.svg"}>
          <button
            type="button"
            onClick={() => props.onDelete(name)}
            class="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-[#5c554a] hover:text-red-400 group-hover:block"
          >
            <X size={12} />
          </button>
        </Show>
      </div>
    );
  }
  const dir = props.entry;
  const folderPath = props.prefix ? `${props.prefix}/${dir.name}` : dir.name;
  const isCollapsed = () => props.collapsed.has(folderPath);
  return (
    <div>
      <button
        type="button"
        onClick={() => props.onToggle(folderPath)}
        class="flex w-full items-center gap-1.5 truncate px-3 py-1.5 text-left font-mono text-xs text-[#8a8171] transition hover:text-[#f2ede2]"
      >
        <span class="inline-block transition-transform duration-150" classList={{ "rotate-90": !isCollapsed() }}>
          <CaretRight size={12} />
        </span>
        <Folder size={15} class="text-[#9cdcfe]" />
        <span class="truncate">{dir.name.includes("/") ? dir.name.split("/").pop() : dir.name}</span>
      </button>
      <Show when={!isCollapsed()}>
        <div class="ml-3 border-l border-[#2a241c]/50 pl-1">
          <For each={dir.children}>
            {(child) => (
              <TreeRow
                entry={child}
                prefix={folderPath}
                collapsed={props.collapsed}
                activeName={props.activeName}
                mainFile={props.mainFile}
                onSelect={props.onSelect}
                onToggle={props.onToggle}
                onDelete={props.onDelete}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default function BotEditor() {
  const [token, setToken] = createSignal<string | null>(getPluginToken());
  const [me, setMe] = createSignal<DeveloperAccount | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [editId, setEditId] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  const [fileMenuOpen, setFileMenuOpen] = createSignal(false);
  const [addingFile, setAddingFile] = createSignal(false);
  const [newFileName, setNewFileName] = createSignal("");
  const [collapsedFolders, setCollapsedFolders] = createSignal<Set<string>>(new Set());

  const [handle, setHandle] = createSignal("");
  const [name, setName] = createSignal("");
  const [webhook, setWebhook] = createSignal("");
  const [delivery, setDelivery] = createSignal<"script" | "webhook" | "polling">("script");
  const [botToken, setBotToken] = createSignal<string | null>(null);
  const [files, setFiles] = createSignal<Record<string, string>>({ ...DEFAULT_FILES });
  const [activeName, setActiveName] = createSignal("src/bot.js");
  const [lastSaved, setLastSaved] = createSignal<string | null>(null);

  let editorRef: HTMLTextAreaElement | undefined;
  let overlayRef: HTMLPreElement | undefined;
  let gutterRef: HTMLDivElement | undefined;
  let newFileRef: HTMLInputElement | undefined;

  const [bots, { refetch }] = createResource(token, (tok) => (tok ? listBots() : Promise.resolve([] as BotDto[])));

  const sortedFiles = () =>
    Object.keys(files()).sort((a, b) => {
      const rank = (n: string) =>
        n === "manifest.json" ? 0 : n === "icon.svg" ? 1 : n.endsWith(".md") ? 2 : 3;
      const da = a.includes("/") ? 1 : 0;
      const db = b.includes("/") ? 1 : 0;
      return da - db || rank(a) - rank(b) || a.localeCompare(b);
    });

  const tree = (): TreeEntry[] => {
    const root = new Map<string, unknown>();
    const fileNodes = new Map<string, { name: string; children: Map<string, unknown> }>();
    for (const full of sortedFiles()) {
      const parts = full.split("/");
      let map = root;
      let prefix = "";
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        let dir = fileNodes.get(prefix);
        if (!dir) {
          dir = { name: parts[i], children: new Map() };
          fileNodes.set(prefix, dir);
          map.set(prefix, dir);
        }
        map = dir.children;
      }
      map.set(parts[parts.length - 1], full);
    }
    const render = (map: Map<string, unknown>): TreeEntry[] => {
      const dirs: TreeEntry[] = [];
      const filesList: string[] = [];
      for (const [key, value] of map) {
        if (typeof value === "string") filesList.push(value);
        else {
          const dir = value as { name: string; children: Map<string, unknown> };
          dirs.push({ name: key, children: render(dir.children) });
        }
      }
      dirs.sort((a, b) => (a as { name: string }).name.localeCompare((b as { name: string }).name));
      filesList.sort();
      return [...dirs, ...filesList];
    };
    return render(root);
  };

  const current = () => files()[activeName()] ?? "";
  const mainFile = () => {
    try {
      const m = JSON.parse(files()["manifest.json"] ?? "{}") as { main?: string };
      return typeof m.main === "string" && m.main ? m.main : "src/bot.js";
    } catch {
      return "src/bot.js";
    }
  };

  const doLogin = async (h: string, password: string) => {
    const { token: tok, user } = await loginDeveloper(h, password);
    setPluginToken(tok);
    setToken(tok);
    setMe(user);
    void refetch();
  };

  const doRegister = async (h: string, n: string, password: string) => {
    const { token: tok, user } = await registerDeveloper(h, n, password);
    setPluginToken(tok);
    setToken(tok);
    setMe(user);
    void refetch();
  };

  const doLogout = async () => {
    const tok = token();
    if (tok) await logoutDeveloper(tok);
    setPluginToken(null);
    setToken(null);
    setMe(null);
    go("/bots");
  };

  const syncFromLocation = () => {
    const { id, creating: isCreating } = locationMode();
    setEditId(id);
    setCreating(isCreating);
    setError(null);
    setNotice(null);
    setSettingsOpen(false);
    if (isCreating && !id) {
      setHandle("");
      setName("");
      setWebhook("");
      setBotToken(null);
      setFiles({ ...DEFAULT_FILES });
      setActiveName("src/bot.js");
      setLastSaved(null);
    }
  };

  onMount(() => {
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    onCleanup(() => window.removeEventListener("popstate", syncFromLocation));
    const tok = getPluginToken();
    if (tok) {
      void fetchMe(tok)
        .then(setMe)
        .catch(() => {
          setPluginToken(null);
          setToken(null);
        });
    }
  });

  createEffect(() => {
    const id = editId();
    const bot = (bots() ?? []).find((b) => b.id === id);
    if (!bot) return;
    setHandle(bot.handle);
    setName(bot.name);
    setWebhook(bot.webhookUrl);
    setDelivery((bot.delivery as "script" | "webhook" | "polling") || "script");
    setBotToken(bot.token ?? null);
    const next = decodeScript(bot.script);
    setFiles(next);
    setActiveName(next["src/bot.js"] ? "src/bot.js" : next["bot.js"] ? "bot.js" : "manifest.json");
    setLastSaved(encodeScript(next) + "\n" + bot.webhookUrl + "\n" + bot.name);
  });

  createEffect(() => {
    if (addingFile()) newFileRef?.focus();
  });

  const syncScroll = () => {
    if (!editorRef || !overlayRef || !gutterRef) return;
    overlayRef.scrollTop = editorRef.scrollTop;
    overlayRef.scrollLeft = editorRef.scrollLeft;
    gutterRef.scrollTop = editorRef.scrollTop;
  };

  const lines = () => current().split("\n").length;
  const gutterText = () => Array.from({ length: lines() }, (_, i) => String(i + 1)).join("\n") + "\n";
  const highlighted = () => highlightCode(current(), activeName());
  const snapshot = () => encodeScript(files()) + "\n" + webhook() + "\n" + name() + "\n" + delivery();
  const dirty = () => lastSaved() === null || snapshot() !== lastSaved();

  createEffect(() => {
    const html = highlighted();
    if (overlayRef) overlayRef.innerHTML = `${html}\n`;
  });

  const addFile = () => {
    const n = newFileName().trim();
    if (!isValidFileName(n) || files()[n] !== undefined) return;
    const ext = n.split(".").pop() ?? "";
    const content = ext === "json" ? "{\n\n}\n" : ext === "md" ? `# ${n}\n` : `// ${n}\n`;
    setFiles((f) => ({ ...f, [n]: content }));
    setActiveName(n);
    setAddingFile(false);
    setNewFileName("");
  };

  const deleteFile = (n: string) => {
    if (n === "manifest.json" || n === mainFile() || n === "icon.svg") return;
    setFiles((f) => {
      const next = { ...f };
      delete next[n];
      return next;
    });
    if (activeName() === n) setActiveName(mainFile());
  };

  const onCreate = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const bot = await createBot(handle(), name() || handle());
      setBotToken(bot.token ?? null);
      await updateBot(bot.id, {
        script: encodeScript(files()),
        webhookUrl: webhook(),
        name: name() || handle(),
        delivery: delivery(),
      });
      await refetch();
      history.replaceState({}, "", `/bots?id=${encodeURIComponent(bot.id)}`);
      setCreating(false);
      setEditId(bot.id);
      setLastSaved(snapshot());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const id = editId();
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      await updateBot(id, {
        script: encodeScript(files()),
        webhookUrl: webhook(),
        name: name(),
        delivery: delivery(),
      });
      setLastSaved(snapshot());
      setNotice("Saved");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const id = editId();
    if (!id) return;
    setSaving(true);
    try {
      await deleteBot(id);
      go("/bots");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const rotate = async () => {
    const id = editId();
    if (!id) return;
    setSaving(true);
    try {
      const bot = await rotateBotToken(id);
      setBotToken(bot.token ?? null);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const copyToken = async () => {
    const tok = botToken();
    if (!tok) return;
    try {
      await navigator.clipboard.writeText(tok);
      setNotice("Token copied");
    } catch {
      setError("Couldn't copy");
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (!creating()) void save();
    }
  };

  const headerBar = (extra?: { showUser?: boolean }) => (
    <header class="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div class="flex items-center gap-2">
          <a href="/" class="flex items-center gap-2 font-heading text-base font-semibold text-ink">
            <img src={logo} alt="" width="22" height="16" />
            <span class="hidden sm:inline">Atlas</span>
          </a>
          <span class="text-ink-subtle/60">/</span>
          <span class="font-heading text-base font-semibold text-ink">{t("botsEditor.title")}</span>
        </div>
        <div class="flex items-center gap-3">
          <Show when={extra?.showUser && me()}>
            <span class="hidden items-center gap-2 rounded-pill border border-border bg-surface py-1 pl-1 pr-3 text-sm md:flex">
              <span class="h-7 w-7 shrink-0">
                <DevAvatar developer={me()!} token={token()} size={28} />
              </span>
              <span class="font-medium text-ink">@{me()!.handle}</span>
            </span>
          </Show>
          <Show when={extra?.showUser}>
            <button type="button" onClick={() => void doLogout()} class="text-sm font-medium text-ink-subtle transition hover:text-ink">
              {t("pluginsAuth.logout")}
            </button>
          </Show>
          <a href="/plugins" class="text-sm font-medium text-ink-subtle transition hover:text-ink">
            {t("nav.plugins")}
          </a>
          <a href="/docs/bots" class="text-sm font-medium text-ink-subtle transition hover:text-ink">
            {t("botsEditor.docs")}
          </a>
          <a
            href="/"
            class="rounded-pill border border-border bg-surface px-4 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:text-accent"
          >
            {t("botsEditor.backHome")}
          </a>
        </div>
      </div>
    </header>
  );

  const iconSrc = (script: string) => {
    const files = decodeScript(script);
    const svg = files["icon.svg"];
    if (!svg) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  return (
    <div class="min-h-screen">
      <div class="grain-overlay" />
      <Show
        when={token()}
        fallback={
          <div>
            {headerBar()}
            <div class="px-6 py-12 sm:py-16">
              <PluginAuth onLogin={doLogin} onRegister={doRegister} />
            </div>
          </div>
        }
      >
        <Show
          when={!creating() && !editId()}
          fallback={
            <div class="flex h-screen flex-col">
              <Show when={error()}>
                <div class="border-b border-[#2a241c] bg-red-500/10 px-4 py-1.5 text-center font-mono text-xs text-red-300">
                  {error()}
                </div>
              </Show>
              <Show when={notice()}>
                <div class="border-b border-[#2a241c] bg-[#14110d] px-4 py-1.5 text-center font-mono text-xs text-[#8a8171]">
                  {notice()}
                </div>
              </Show>

              <form
                class="flex min-h-0 flex-1 flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (creating()) void onCreate(e);
                  else void save();
                }}
              >
                <div class="flex items-center gap-3 border-b border-[#2a241c] bg-[#0f0d0b] px-3 py-2">
                  <span class="flex gap-1.5">
                    <span class="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span class="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span class="h-3 w-3 rounded-full bg-[#28c840]" />
                  </span>
                  <span class="truncate font-mono text-xs text-[#8a8171]">@{handle() || "bot"}.atlas</span>
                  <span class="relative">
                    <button
                      type="button"
                      onClick={() => setFileMenuOpen((v) => !v)}
                      class="rounded-md px-2.5 py-1 text-xs font-medium text-[#d4d4d4] transition hover:bg-white/5"
                    >
                      {t("botsEditor.fileMenu")}
                    </button>
                    <Show when={fileMenuOpen()}>
                      <div class="fixed inset-0 z-30" onClick={() => setFileMenuOpen(false)} />
                      <div class="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-[#2a241c] bg-[#1a1712] py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]">
                        <button
                          type="button"
                          onClick={() => {
                            setFileMenuOpen(false);
                            setSettingsOpen(true);
                          }}
                          class="flex w-full items-center px-3 py-2 text-left text-xs text-[#d4d4d4] hover:bg-white/5"
                        >
                          Token & webhook
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFileMenuOpen(false);
                            if (!creating()) void save();
                          }}
                          class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-[#d4d4d4] hover:bg-white/5"
                        >
                          {t("botsEditor.save")}
                          <span class="text-[10px] text-[#5c554a]">Ctrl+S</span>
                        </button>
                      </div>
                    </Show>
                  </span>
                  <Show when={botToken()}>
                    <button
                      type="button"
                      title="Copy bot token"
                      onClick={() => void copyToken()}
                      class="hidden max-w-[14rem] truncate rounded-md border border-[#c9772e]/30 bg-[#c9772e]/10 px-2 py-0.5 font-mono text-[10px] text-[#f5c98a] hover:border-[#c9772e]/60 sm:block"
                    >
                      {botToken()}
                    </button>
                  </Show>
                  <span class="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => go("/bots")}
                      class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] hover:bg-white/5"
                    >
                      {t("botsEditor.back")}
                    </button>
                    <a
                      href="/docs/bots"
                      class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] hover:bg-white/5"
                    >
                      {t("botsEditor.docs")}
                    </a>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] hover:bg-white/5"
                    >
                      Token
                    </button>
                    <Show when={!creating() && editId()}>
                      <button
                        type="button"
                        onClick={() => void remove()}
                        class="rounded-md px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
                      >
                        {t("botsEditor.delete")}
                      </button>
                    </Show>
                    <button
                      type="submit"
                      disabled={saving()}
                      class="rounded-md bg-[#c9772e] px-4 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                    >
                      {saving()
                        ? t("botsEditor.saving")
                        : creating()
                          ? t("botsEditor.create")
                          : t("botsEditor.save")}
                    </button>
                  </span>
                </div>

                <Show when={creating()}>
                  <div class="flex gap-3 border-b border-[#2a241c] bg-[#12100d] px-4 py-3">
                    <input
                      class="min-w-0 flex-1 rounded-md border border-[#2a241c] bg-[#0f0d0b] px-3 py-2 font-mono text-xs text-[#d4d4d4] outline-none focus:border-[#c9772e]/50"
                      placeholder={t("botsEditor.handle")}
                      value={handle()}
                      onInput={(e) => setHandle(e.currentTarget.value)}
                    />
                    <input
                      class="min-w-0 flex-1 rounded-md border border-[#2a241c] bg-[#0f0d0b] px-3 py-2 font-mono text-xs text-[#d4d4d4] outline-none focus:border-[#c9772e]/50"
                      placeholder={t("botsEditor.name")}
                      value={name()}
                      onInput={(e) => setName(e.currentTarget.value)}
                    />
                  </div>
                </Show>

                <div class="flex min-h-0 flex-1">
                  <aside class="flex w-48 shrink-0 flex-col overflow-hidden border-r border-[#2a241c] bg-[#12100d]">
                    <div class="flex items-center justify-between border-b border-[#2a241c] px-3 py-2">
                      <span class="text-[10px] font-bold uppercase tracking-wider text-[#5c554a]">Files</span>
                      <button
                        type="button"
                        onClick={() => setAddingFile(true)}
                        class="grid h-5 w-5 place-items-center rounded text-[#8a8171] hover:bg-white/10 hover:text-[#f2ede2]"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <Show when={addingFile()}>
                      <input
                        ref={newFileRef}
                        value={newFileName()}
                        onInput={(e) => setNewFileName(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addFile();
                          } else if (e.key === "Escape") {
                            setAddingFile(false);
                            setNewFileName("");
                          }
                        }}
                        placeholder="src/utils.js"
                        spellcheck={false}
                        class="mx-2 mt-2 rounded border border-[#c9772e]/60 bg-[#1a1712] px-2 py-1 font-mono text-xs text-[#f2ede2] outline-none"
                      />
                    </Show>
                    <div class="flex-1 overflow-y-auto py-1">
                      <For each={tree()}>
                        {(entry) => (
                          <TreeRow
                            entry={entry}
                            prefix=""
                            collapsed={collapsedFolders()}
                            activeName={activeName()}
                            mainFile={mainFile()}
                            onSelect={setActiveName}
                            onToggle={(prefix) =>
                              setCollapsedFolders((set) => {
                                const next = new Set(set);
                                if (next.has(prefix)) next.delete(prefix);
                                else next.add(prefix);
                                return next;
                              })
                            }
                            onDelete={deleteFile}
                          />
                        )}
                      </For>
                    </div>
                  </aside>
                  <div class="code-editor flex min-w-0 flex-1 bg-[#14110d] font-mono">
                    <div ref={gutterRef} class="shrink-0 overflow-hidden border-r border-[#2a241c]/60 bg-[#12100d]">
                      <pre class="gutter-pre">{gutterText()}</pre>
                    </div>
                    <div class="relative min-w-0 flex-1">
                      <pre ref={overlayRef} class="editor-overlay" />
                      <textarea
                        ref={editorRef}
                        value={current()}
                        class="editor-input"
                        onInput={(e) => {
                          const v = e.currentTarget.value;
                          setFiles((f) => ({ ...f, [activeName()]: v }));
                        }}
                        onScroll={syncScroll}
                        onKeyDown={onKeyDown}
                        spellcheck={false}
                        wrap="off"
                        aria-label={activeName()}
                      />
                    </div>
                  </div>
                </div>

                <footer class="flex items-center gap-4 border-t border-[#2a241c] bg-[#0f0d0b] px-4 py-1.5 font-mono text-[11px] text-[#6b6357]">
                  <span class="truncate">{activeName()}</span>
                  <span class="hidden sm:inline">{languageOf(activeName())}</span>
                  <span class="hidden sm:inline">
                    {lines()} {t("botsEditor.lines")}
                  </span>
                  <span class="ml-auto flex items-center gap-1.5">
                    <Show when={dirty()}>
                      <span class="h-1.5 w-1.5 rounded-full bg-[#f5c98a]" />
                      {t("botsEditor.unsaved")}
                    </Show>
                    <Show when={!dirty()}>{t("botsEditor.saved")}</Show>
                  </span>
                </footer>
              </form>

              <Show when={settingsOpen()}>
                <div class="fixed inset-0 z-40 bg-black/60" onClick={() => setSettingsOpen(false)} />
                <div class="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-[#2a241c] bg-[#14110d] p-5 shadow-2xl">
                  <div class="flex items-center justify-between">
                    <p class="font-heading text-sm font-semibold text-[#f2ede2]">Token & delivery</p>
                    <button type="button" class="text-xs text-[#8a8171] hover:text-[#f2ede2]" onClick={() => setSettingsOpen(false)}>
                      Esc
                    </button>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs text-[#8a8171]">{t("botsEditor.name")}</label>
                    <input
                      class="w-full rounded-md border border-[#2a241c] bg-[#0f0d0b] px-3 py-2 text-sm text-[#d4d4d4] outline-none focus:border-[#c9772e]/50"
                      value={name()}
                      onInput={(e) => setName(e.currentTarget.value)}
                    />
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs text-[#8a8171]">Bot token</label>
                    <Show when={botToken()} fallback={<p class="text-xs text-[#8a8171]">Save the bot to mint a token.</p>}>
                      <code class="block break-all rounded-md border border-[#2a241c] bg-[#0f0d0b] px-3 py-2 font-mono text-[11px] text-[#f5c98a]">
                        {botToken()}
                      </code>
                      <div class="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void copyToken()}
                          class="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#d4d4d4] hover:bg-white/5"
                        >
                          Copy
                        </button>
                        <Show when={editId() && !creating()}>
                          <button
                            type="button"
                            disabled={saving()}
                            onClick={() => void rotate()}
                            class="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[#d4d4d4] hover:bg-white/5"
                          >
                            Regenerate
                          </button>
                        </Show>
                      </div>
                    </Show>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs text-[#8a8171]">{t("botsEditor.delivery")}</label>
                    <select
                      class="w-full rounded-md border border-[#2a241c] bg-[#0f0d0b] px-3 py-2 text-sm text-[#d4d4d4]"
                      value={delivery()}
                      onChange={(e) => setDelivery(e.currentTarget.value as "script" | "webhook" | "polling")}
                    >
                      <option value="script">Built-in script (reply / keyboard)</option>
                      <option value="webhook">Webhook POST</option>
                      <option value="polling">Long polling (aiogram-style)</option>
                    </select>
                    <p class="mt-1.5 text-xs leading-relaxed text-[#6b6357]">{t("botsEditor.deliveryHint")}</p>
                  </div>
                  <div>
                    <label class="mb-1.5 block text-xs text-[#8a8171]">{t("botsEditor.webhook")}</label>
                    <input
                      class="w-full rounded-md border border-[#2a241c] bg-[#0f0d0b] px-3 py-2 font-mono text-xs text-[#d4d4d4] outline-none focus:border-[#c9772e]/50"
                      placeholder="https://…"
                      value={webhook()}
                      onInput={(e) => setWebhook(e.currentTarget.value)}
                    />
                    <p class="mt-1.5 text-xs leading-relaxed text-[#6b6357]">{t("botsEditor.webhookHint")}</p>
                  </div>
                </div>
              </Show>


            </div>
          }
        >
          {headerBar({ showUser: true })}
          <div class="mx-auto max-w-6xl px-6 py-12 sm:py-16">
            <div class="mb-12 flex flex-wrap items-end justify-between gap-6">
              <div>
                <h1 class="font-heading text-4xl font-semibold sm:text-5xl">{t("botsEditor.title")}</h1>
                <p class="mt-3 max-w-xl text-ink-muted">{t("botsEditor.sub")}</p>
              </div>
              <button
                type="button"
                onClick={() => go("/bots?new=1")}
                class="flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_10px_30px_-10px_rgba(201,119,46,0.7)] transition hover:brightness-105 active:scale-[0.97]"
              >
                <Plus size={16} />
                {t("botsEditor.new")}
              </button>
            </div>
            <Show when={bots.loading}>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={[0, 1, 2]}>{() => <div class="h-44 animate-pulse rounded-2xl border border-border bg-surface" />}</For>
              </div>
            </Show>
            <Show when={bots.error}>
              <div class="rounded-2xl border border-border bg-surface p-10 text-center">
                <p class="text-ink-muted">{t("botsEditor.listError")}</p>
              </div>
            </Show>
            <Show when={bots() && bots()!.length === 0}>
              <Reveal>
                <div class="rounded-2xl border border-dashed border-border bg-surface/60 px-10 py-16 text-center">
                  <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                    <Sparkle size={26} />
                  </div>
                  <p class="font-heading text-lg font-semibold">{t("botsEditor.emptyTitle")}</p>
                  <p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{t("botsEditor.emptySub")}</p>
                </div>
              </Reveal>
            </Show>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={bots() ?? []}>
                {(b, i) => (
                  <Reveal delay={i() * 40}>
                    <article class="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 transition duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)]">
                      <div class="flex items-start gap-3">
                        <Show
                          when={iconSrc(b.script)}
                          fallback={
                            <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent font-heading text-lg font-semibold text-white">
                              {b.name.charAt(0).toUpperCase()}
                            </div>
                          }
                        >
                          <img src={iconSrc(b.script)!} alt="" class="h-11 w-11 shrink-0 rounded-xl object-cover" />
                        </Show>
                        <div class="min-w-0">
                          <p class="font-heading text-base font-semibold text-ink">{b.name}</p>
                          <p class="font-mono text-[11px] text-ink-subtle">@{b.handle}</p>
                        </div>
                      </div>
                      <p class="mt-3 line-clamp-2 text-sm text-ink-muted">{b.webhookUrl || "src/bot.js"}</p>
                      <div class="mt-4 flex items-center justify-end border-t border-border pt-3">
                        <button
                          type="button"
                          onClick={() => go(`/bots?id=${encodeURIComponent(b.id)}`)}
                          class="grid h-9 w-9 shrink-0 place-items-center rounded-pill border border-border bg-bg text-ink transition group-hover:border-accent/40 group-hover:text-accent"
                        >
                          <PencilLine size={16} />
                        </button>
                      </div>
                    </article>
                  </Reveal>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  );
}
