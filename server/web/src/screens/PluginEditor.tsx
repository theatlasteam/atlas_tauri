import {
  createEffect,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  createPlugin,
  deletePlugin,
  fetchMe,
  getPlugin,
  getPluginToken,
  listMyPlugins,
  loginDeveloper,
  logoutDeveloper,
  registerDeveloper,
  setPluginToken,
  updatePlugin,
  type DeveloperAccount,
  type PluginPayload,
} from "../lib/api";
import { API_BASE } from "../lib/api";
import { t } from "../lib/i18n";
import { GITHUB_REPO_URL } from "../lib/repo";
import { highlightCode, isValidFileName, languageOf } from "../lib/highlight";
import PluginDocs from "../components/PluginDocs";
import PluginAuth from "../components/PluginAuth";
import ProjectSettings from "../components/ProjectSettings";
import McpSettings from "../components/McpSettings";
import DevAvatar, { tileGradient, pluginIconSource } from "../components/DevAvatar";
import Reveal from "../components/Reveal";
import { CaretRight, Folder, PencilLine, Plus, Sparkle, X } from "phosphor-solid-js";
import logo from "../assets/logo.svg";

const DEFAULT_FILES: Record<string, string> = {
  "manifest.json": JSON.stringify(
    {
      id: "dev.myplugin",
      name: "My plugin",
      version: "0.1.0",
      description: "",
      main: "src/main.tsx",
      icon: "icon.svg",
      permissions: ["commands", "messages.read", "messages.send", "ui"],
    },
    null,
    2,
  ),
  "icon.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#c9772e"/>
  <path d="M18 44V20l28 24V20" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`,
  "src/main.tsx": `// Atlas plugin — activate(ctx) runs when the plugin loads.
// Entry point; you can import other files and Solid components.
// import { createSignal } from "solid-js";
// import { Switch } from "atlas/ui";
// import { NavBar } from "./Nav";

export function activate(ctx) {
  ctx.log("Hello from my plugin!");

  // A command the user can run from the app's Plugins screen.
  ctx.registerCommand({
    id: "hello",
    label: "Say hello",
    run() {
      ctx.log("Hello from the command!");
    },
  });

  // Rewrite every message you send, e.g. append a signature.
  ctx.beforeSend((text) => {
    return text + " — sent via Atlas";
  });

  // Replace the bottom nav bar with your own component (requires "ui"):
  // ctx.ui.mount("nav.bottom", (props) => <NavBar {...props} />);

  // Provide a configuration screen (requires "ui") — opened from the
  // sliders button on the plugin's row in the app:
  // ctx.ui.configScreen(({ plugin, onClose }) => <MySettings onClose={onClose} />);

  // Send messages through the app's own pipeline.
  // await ctx.sendMessage(chatId, "Hello from a plugin!");

  // Read the current user, chat list and more (declare permissions).
  // const me = ctx.me();

  // Navigate, notify, store JSON, call the API — see the docs.
}
`,
};

function locationMode(): { id: string | null; creating: boolean } {
  const params = new URLSearchParams(window.location.search);
  return { id: params.get("id"), creating: params.has("new") };
}

function pickFirst(files: Record<string, string>): string {
  const names = Object.keys(files);
  if (names.includes("main.js")) return "main.js";
  if (names.includes("src/main.tsx")) return "src/main.tsx";
  if (names.includes("main.tsx")) return "main.tsx";
  return [...names].sort()[0] ?? "main.js";
}

type TreeEntry =
  | string
  | { name: string; children: TreeEntry[] };

// File-tree icons come from @uiw/file-icons (the `ffont` webfont, loaded in
// the HTML entry points) — same glyphs VS Code ships for file types. Each
// entry picks the glyph + a brand-ish color; unknown files fall back to the
// generic document glyph.
const FILE_TYPE_ICONS: { match: RegExp; glyph: string; color: string }[] = [
  { match: /^manifest\.json$/, glyph: "ffont-settings", color: "#c9772e" },
  { match: /\.json$/, glyph: "ffont-json", color: "#9cdcfe" },
  { match: /\.js$/, glyph: "ffont-javascript", color: "#f7df1e" },
  { match: /\.css$/, glyph: "ffont-css", color: "#42a5f5" },
  { match: /\.html?$/, glyph: "ffont-html", color: "#e44d26" },
  { match: /\.tsx?$/, glyph: "ffont-typescript", color: "#3178c6" },
  { match: /\.md$/, glyph: "ffont-markdown", color: "#519aba" },
  { match: /\.ya?ml$/, glyph: "ffont-yaml", color: "#cb171e" },
];

function FileIcon(props: { name: string; active: boolean }) {
  const hit = FILE_TYPE_ICONS.find((f) => f.match.test(props.name));
  const glyph = hit?.glyph ?? "ffont-file";
  const color = hit?.color ?? "#8a8171";
  return (
    <i
      class={`ffont ${glyph} shrink-0 not-italic`}
      classList={{ "opacity-50": !props.active }}
      style={{ color, "font-size": "15px", "line-height": "1" }}
      aria-hidden="true"
    />
  );
}

/** A single row in the file tree: either a folder (expandable) or a file. */
function TreeRow(props: {
  entry: TreeEntry;
  prefix: string;
  collapsed: Set<string>;
  activeName: string;
  renaming: { old: string; value: string } | null;
  mainFile: string;
  onSelect: (name: string) => void;
  onToggle: (prefix: string) => void;
  onRename: (name: string) => void;
  onRenameInput: (value: string) => void;
  onCommitRename: () => void;
  onDelete: (name: string) => void;
  renameInputRef?: (el: HTMLInputElement) => void;
}) {
  // File row
  if (typeof props.entry === "string") {
    const name = props.entry;
    const isRenaming = () => props.renaming?.old === name;
    return (
      <div class="group relative flex items-center" classList={{ "bg-white/10": props.activeName === name }}>
        <Show
          when={isRenaming()}
          fallback={
            <button
              type="button"
              onClick={() => props.onSelect(name)}
              onDblClick={() => props.onRename(name)}
              class="flex w-full items-center gap-2 truncate px-3 py-1.5 text-left font-mono text-xs transition"
              classList={{
                "text-[#f2ede2]": props.activeName === name,
                "text-[#8a8171] hover:text-[#f2ede2]": props.activeName !== name,
              }}
            >
              <FileIcon name={name} active={props.activeName === name} />
              <span class="truncate">{name.split("/").pop()}</span>
            </button>
          }
        >
          <input
            ref={props.renameInputRef}
            value={props.renaming!.value}
            onInput={(e) => props.onRenameInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                props.onCommitRename();
              } else if (e.key === "Escape") props.onRename("");
            }}
            onBlur={props.onCommitRename}
            spellcheck={false}
            class="mx-2 my-0.5 w-[calc(100%-16px)] rounded border border-[#c9772e]/60 bg-[#1a1712] px-2 py-1 font-mono text-xs text-[#f2ede2] outline-none"
          />
        </Show>

        <Show when={!isRenaming() && name !== "manifest.json" && name !== props.mainFile}>
          <button
            type="button"
            onClick={() => props.onDelete(name)}
            aria-label={t("pluginsEditor.deleteFile", { name })}
            class="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-[#5c554a] transition hover:text-red-400 group-hover:block"
          >
            <X size={12} />
          </button>
        </Show>
      </div>
    );
  }

  // Folder row
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
        <span
          class="inline-block transition-transform duration-150"
          classList={{ "rotate-90": !isCollapsed() }}
        >
          <CaretRight size={12} />
        </span>
        <Folder size={15} class="text-[#9cdcfe]" />
        <span class="truncate">{dir.name}</span>
      </button>
      <Show when={!isCollapsed()}>
        <div class="ml-3 border-l border-[#2a241c]/50 pl-1">
          <For each={dir.children}>
            {(child) => (
              <TreeRow
                entry={child as TreeEntry}
                prefix={folderPath}
                collapsed={props.collapsed}
                activeName={props.activeName}
                renaming={props.renaming}
                mainFile={props.mainFile}
                onSelect={props.onSelect}
                onToggle={props.onToggle}
                onRename={props.onRename}
                onRenameInput={props.onRenameInput}
                onCommitRename={props.onCommitRename}
                onDelete={props.onDelete}
                renameInputRef={props.renameInputRef}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default function PluginEditor() {
  const [editId, setEditId] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);

  // Developer auth — publishing is gated on an Atlas account.
  const [token, setToken] = createSignal<string | null>(getPluginToken());
  const [me, setMe] = createSignal<DeveloperAccount | null>(null);

  const [plugins, { refetch }] = createResource(token, (tok) =>
    tok ? listMyPlugins() : Promise.resolve([]),
  );
  const [plugin] = createResource(editId, (id) => getPlugin(id));

  const doLogin = async (handle: string, password: string) => {
    const { token: tok, user } = await loginDeveloper(handle, password);
    setPluginToken(tok);
    setToken(tok);
    setMe(user);
    void refetch();
  };

  const doRegister = async (handle: string, name: string, password: string) => {
    const { token: tok, user } = await registerDeveloper(handle, name, password);
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
    history.replaceState({}, "", "/plugins");
    syncFromLocation();
  };

  const [files, setFiles] = createSignal<Record<string, string>>(DEFAULT_FILES);
  const [activeName, setActiveName] = createSignal("src/main.tsx");
  const [lastSaved, setLastSaved] = createSignal<Record<string, string> | null>(null);

  const [addingFile, setAddingFile] = createSignal(false);
  const [newFileName, setNewFileName] = createSignal("");
  const [renaming, setRenaming] = createSignal<{ old: string; value: string } | null>(null);
  const [docsOpen, setDocsOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [mcpOpen, setMcpOpen] = createSignal(false);
  const [fileMenuOpen, setFileMenuOpen] = createSignal(false);
  const [collapsedFolders, setCollapsedFolders] = createSignal<Set<string>>(new Set());

  /** Parsed manifest for the Project Settings form. */
  const manifest = () => {
    try {
      return JSON.parse(files()["manifest.json"] ?? "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const applySettings = (nextFiles: Record<string, string>) => {
    setFiles(nextFiles);
    setLastSaved(null);
    setSettingsOpen(false);
    setNotice(t("pluginsEditor.settingsApplied"));
  };

  const toggleFolder = (prefix: string) => {
    setCollapsedFolders((set) => {
      const next = new Set(set);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  let editorRef: HTMLTextAreaElement | undefined;
  let overlayRef: HTMLPreElement | undefined;
  let gutterRef: HTMLDivElement | undefined;
  let newFileRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (addingFile()) newFileRef?.focus();
  });

  // ---------- derived ----------

  const sortedFiles = () =>
    Object.keys(files()).sort((a, b) => {
      const rank = (n: string) =>
        n === "manifest.json" ? 0 : n === "main.js" || n === "main.tsx" || n === "main.ts" ? 1 : n.endsWith(".json") ? 2 : 3;
      const da = a.includes("/") ? 1 : 0;
      const db = b.includes("/") ? 1 : 0;
      return da - db || rank(a) - rank(b) || a.localeCompare(b);
    });

  /** Files grouped into nested folders for the file tree. */
  const tree = (): TreeEntry[] => {
    const root = new Map<string, unknown>();
    const fileNodes = new Map<string, { name: string; children: Map<string, unknown>; full: string }>();
    for (const full of sortedFiles()) {
      const parts = full.split("/");
      let map = root;
      let prefix = "";
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        let dir = fileNodes.get(prefix);
        if (!dir) {
          dir = { name: parts[i], children: new Map(), full: prefix };
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
      return typeof m.main === "string" && m.main ? m.main : "src/main.tsx";
    } catch {
      return "src/main.tsx";
    }
  };

  const lines = () => (current() ? current().split("\n").length : 1);
  const gutterText = () => Array.from({ length: lines() }, (_, i) => String(i + 1)).join("\n") + "\n";
  const highlighted = () => highlightCode(current(), activeName());
  const dirty = () =>
    lastSaved() === null || JSON.stringify(files()) !== JSON.stringify(lastSaved());
  const totalInstalls = () => (plugins() ?? []).reduce((sum, p) => sum + p.downloads, 0);

  const name = () => {
    try {
      const m = JSON.parse(files()["manifest.json"] ?? "{}") as { name?: string };
      return m.name ?? "";
    } catch {
      return "";
    }
  };

  // ---------- routing / loading ----------

  const syncFromLocation = () => {
    const { id, creating: isCreating } = locationMode();
    setEditId(id);
    setCreating(isCreating);
    setError(null);
    setNotice(null);
    setDocsOpen(false);
    if (isCreating && !id) {
      setFiles(DEFAULT_FILES);
      setActiveName("src/main.tsx");
      setLastSaved(null);
    }
  };

  onMount(() => {
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    onCleanup(() => window.removeEventListener("popstate", syncFromLocation));
    // Restore a stored session: validate the token and pick up the account.
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
    const p = plugin();
    if (!p) return;
    setFiles(p.files ?? {});
    setActiveName(pickFirst(p.files ?? {}));
    setLastSaved(p.files ?? {});
    // The form (and textarea) mounts only once the resource resolves, so the
    // activeName focus effect may never fire if the first file is still the
    // default — focus here, after the DOM is committed.
    requestAnimationFrame(() => editorRef?.focus());
  });

  // Focus the editor when the active file changes (and on first mount).
  // value is bound reactively in the JSX (see textarea's value={current()}),
  // so there's no manual value-sync that can race the late-mounted textarea.
  createEffect(() => {
    activeName();
    if (!editorRef) return;
    editorRef.scrollTop = 0;
    editorRef.scrollLeft = 0;
    syncScroll();
    requestAnimationFrame(() => editorRef?.focus());
  });

  const go = (url: string) => {
    history.pushState({}, "", url);
    syncFromLocation();
    void refetch();
  };

  // ---------- file operations ----------

  const addFile = () => {
    const name = newFileName().trim();
    if (!isValidFileName(name)) {
      setError(t("pluginsEditor.invalidFileName"));
      return;
    }
    if (files()[name] !== undefined) {
      setError(t("pluginsEditor.fileExists", { name }));
      return;
    }
    const ext = name.split(".").pop() ?? "";
    const base = name.split("/").pop() ?? name;
    const content =
      ext === "json"
        ? "{\n\n}\n"
        : ext === "tsx"
          ? `export function ${base.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_]/g, "")}() {\n  return <div></div>;\n}\n`
          : `// ${name}\n`;
    setFiles((f) => ({ ...f, [name]: content }));
    setActiveName(name);
    setAddingFile(false);
    setNewFileName("");
    setError(null);
  };

  const deleteFile = (name: string) => {
    if (name === "manifest.json" || name === mainFile()) return;
    setFiles((f) => {
      const next = { ...f };
      delete next[name];
      return next;
    });
    if (activeName() === name) setActiveName(sortedFiles()[0] ?? "");
  };

  const commitRename = () => {
    const r = renaming();
    if (!r) return;
    const next = r.value.trim();
    if (!next || next === r.old) {
      setRenaming(null);
      return;
    }
    if (!isValidFileName(next)) {
      setError(t("pluginsEditor.invalidFileName"));
      return;
    }
    if (files()[next] !== undefined) {
      setError(t("pluginsEditor.fileExists", { name: next }));
      return;
    }
    setFiles((f) => {
      const copy = { ...f };
      copy[next] = f[r.old];
      delete copy[r.old];
      return copy;
    });
    if (activeName() === r.old) setActiveName(next);
    setRenaming(null);
    setError(null);
  };

  // ---------- editor plumbing ----------

  const updateSource = (value: string) => {
    setFiles((f) => ({ ...f, [activeName()]: value }));
  };

  const syncScroll = () => {
    if (!editorRef || !overlayRef || !gutterRef) return;
    overlayRef.scrollTop = editorRef.scrollTop;
    overlayRef.scrollLeft = editorRef.scrollLeft;
    gutterRef.scrollTop = editorRef.scrollTop;
  };

  // The overlay's innerHTML is patched on every edit, which resets its scroll
  // position to 0; patch it here and restore the scroll in the same step so
  // the visible text never jumps back to the top of the file mid-typing.
  createEffect(() => {
    const html = highlighted();
    if (!overlayRef) return;
    overlayRef.innerHTML = html;
    syncScroll();
  });

  const insertText = (text: string, dedent: boolean) => {
    const ta = editorRef;
    if (!ta) return;
    const { selectionStart, selectionEnd } = ta;
    if (dedent) {
      const before = ta.value.slice(0, selectionStart);
      const match = /[ ]{0,2}$/.exec(before);
      const drop = match?.[0]?.length ?? 0;
      if (drop > 0) {
        ta.value = before.slice(0, before.length - drop) + ta.value.slice(selectionStart);
        updateSource(ta.value);
        ta.setSelectionRange(selectionStart - drop, selectionStart - drop);
      }
      return;
    }
    ta.setRangeText(text, selectionStart, selectionEnd, "end");
    updateSource(ta.value);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void save();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      setSettingsOpen(true);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      insertText("  ", e.shiftKey);
    }
  };

  // ---------- save / delete ----------

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: PluginPayload = { files: files() };
      if (creating()) await createPlugin(payload);
      else if (editId()) await updatePlugin(editId()!, payload);
      else throw new Error(t("pluginsEditor.saveError"));
      setLastSaved(files());
      setNotice(t("pluginsEditor.saved"));
      go("/plugins");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pluginsEditor.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editId() || !window.confirm(t("pluginsEditor.deleteConfirm"))) return;
    setError(null);
    try {
      await deletePlugin(editId()!);
      go("/plugins");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pluginsEditor.deleteError"));
    }
  };

  return (
    <div class="min-h-screen">
      <div class="grain-overlay" />

      <Show
        when={token()}
        fallback={
          <div>
            <header class="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md">
              <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
                <div class="flex items-center gap-2">
                  <a href="/" class="flex items-center gap-2 font-heading text-base font-semibold text-ink">
                    <img src={logo} alt="" width="22" height="16" />
                    <span class="hidden sm:inline">Atlas</span>
                  </a>
                  <span class="text-ink-subtle/60">/</span>
                  <span class="font-heading text-base font-semibold text-ink">{t("pluginsEditor.title")}</span>
                </div>
                <a
                  href="/"
                  class="rounded-pill border border-border bg-surface px-4 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:text-accent"
                >
                  {t("pluginsEditor.backHome")}
                </a>
              </div>
            </header>
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

            <Show when={editId() && plugin.loading}>
              <div class="flex-1 animate-pulse bg-[#12100d]" />
            </Show>
            <Show when={editId() && plugin.error}>
              <div class="flex flex-1 flex-col items-center justify-center gap-3 bg-[#14110d]">
                <p class="font-mono text-sm text-red-300">{t("pluginsEditor.loadError")}</p>
                <button
                  type="button"
                  onClick={() => go("/plugins")}
                  class="rounded-md border border-white/10 px-4 py-1.5 text-xs text-[#d4d4d4] transition hover:bg-white/5"
                >
                  {t("pluginsEditor.back")}
                </button>
              </div>
            </Show>

            <Show when={!editId() || plugin() || plugin.error}>
              <form
                class="flex min-h-0 flex-1 flex-col"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                {/* window title bar — VS Code style */}
                <div class="flex items-center gap-3 border-b border-[#2a241c] bg-[#0f0d0b] px-3 py-2">
                  <span class="flex gap-1.5">
                    <span class="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span class="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span class="h-3 w-3 rounded-full bg-[#28c840]" />
                  </span>
                  <span class="truncate font-mono text-xs text-[#8a8171]">
                    {name() || "untitled"}.atlas
                  </span>
                  <span class="relative">
                    <button
                      type="button"
                      onClick={() => setFileMenuOpen((v) => !v)}
                      class="rounded-md px-2.5 py-1 text-xs font-medium text-[#d4d4d4] transition hover:bg-white/5"
                    >
                      {t("pluginsEditor.fileMenu")}
                    </button>
                    <Show when={fileMenuOpen()}>
                      <div
                        class="fixed inset-0 z-30"
                        onClick={() => setFileMenuOpen(false)}
                      />
                      <div class="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-[#2a241c] bg-[#1a1712] py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)]">
                        <button
                          type="button"
                          onClick={() => {
                            setFileMenuOpen(false);
                            setSettingsOpen(true);
                          }}
                          class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-[#d4d4d4] transition hover:bg-white/5"
                        >
                          {t("pluginsEditor.projectSettings")}
                          <span class="text-[10px] text-[#5c554a]">Ctrl+Shift+P</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFileMenuOpen(false);
                            void save();
                          }}
                          class="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-[#d4d4d4] transition hover:bg-white/5"
                        >
                          {t("pluginsEditor.save")}
                          <span class="text-[10px] text-[#5c554a]">Ctrl+S</span>
                        </button>
                      </div>
                    </Show>
                  </span>
                  <Show when={me()}>
                    <span class="hidden items-center gap-1.5 font-mono text-[11px] text-[#6b6357] sm:flex">
                      <span class="h-5 w-5 shrink-0">
                        <DevAvatar developer={me()!} token={token()} size={20} />
                      </span>
                      @{me()!.handle}
                    </span>
                  </Show>
                  <span class="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => go("/plugins")}
                      class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5"
                    >
                      {t("pluginsEditor.back")}
                    </button>
                    <button
                        type="button"
                        onClick={() => setDocsOpen(true)}
                        class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5"
                      >
                        {t("pluginsEditor.docs")}
                      </button>
                      <Show when={!creating() && editId()}>
                        <button
                          type="button"
                          onClick={() => void remove()}
                          class="rounded-md px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                        >
                          {t("pluginsEditor.delete")}
                        </button>
                      </Show>
                      <button
                        type="submit"
                        disabled={saving()}
                        class="rounded-md bg-[#c9772e] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
                      >
                        {saving() ? t("pluginsEditor.saving") : t("pluginsEditor.save")}
                      </button>
                    </span>
                  </div>

                  {/* file tree + editor */}
                  <div class="flex min-h-0 flex-1">
                    <aside class="flex w-44 shrink-0 flex-col overflow-hidden border-r border-[#2a241c] bg-[#12100d]">
                      <div class="flex items-center justify-between border-b border-[#2a241c] px-3 py-2">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-[#5c554a]">
                          {t("pluginsEditor.files")}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAddingFile((v) => !v)}
                          class="grid h-5 w-5 place-items-center rounded text-[#8a8171] transition hover:bg-white/10 hover:text-[#f2ede2]"
                          aria-label={t("pluginsEditor.newFile")}
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
                          onBlur={() => {
                            setAddingFile(false);
                            setNewFileName("");
                          }}
                          placeholder="src/Nav.tsx"
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
                              renaming={renaming()}
                              mainFile={mainFile()}
                              onSelect={setActiveName}
                              onToggle={toggleFolder}
                onRename={(name) => setRenaming({ old: name, value: name })}
                onRenameInput={(value) =>
                  setRenaming((r) => (r ? { ...r, value } : r))
                }
                onCommitRename={commitRename}
                onDelete={deleteFile}
                renameInputRef={(el) => {
                  el.focus();
                  el.select();
                }}
              />
                          )}
                        </For>
                      </div>
                    </aside>

                    <div class="code-editor flex min-w-0 flex-1 bg-[#14110d] font-mono">
                      <div
                        ref={gutterRef}
                        class="shrink-0 overflow-hidden border-r border-[#2a241c]/60 bg-[#12100d]"
                      >
                        <pre class="gutter-pre">{gutterText()}</pre>
                      </div>
                      <div class="relative min-w-0 flex-1">
                        <pre ref={overlayRef} class="editor-overlay" />
                        <textarea
                          ref={editorRef}
                          value={current()}
                          class="editor-input"
                          onInput={(e) => updateSource(e.currentTarget.value)}
                          onScroll={syncScroll}
                          onKeyDown={onKeyDown}
                          spellcheck={false}
                          wrap="off"
                          aria-label={activeName()}
                        />
                      </div>
                    </div>
                  </div>

                  {/* status bar */}
                  <footer class="flex items-center gap-4 border-t border-[#2a241c] bg-[#0f0d0b] px-4 py-1.5 font-mono text-[11px] text-[#6b6357]">
                    <span class="truncate">{activeName()}</span>
                    <span class="hidden sm:inline">{languageOf(activeName())}</span>
                    <span class="hidden sm:inline">
                      {lines()} {t("pluginsEditor.lines")}
                    </span>
                    <span class="ml-auto flex items-center gap-1.5">
                      <Show when={dirty()}>
                        <span class="h-1.5 w-1.5 rounded-full bg-[#f5c98a]" />
                        {t("pluginsEditor.unsaved")}
                      </Show>
                      <Show when={!dirty()}>{t("pluginsEditor.saved")}</Show>
                    </span>
                  </footer>
                </form>
              </Show>
            </div>
          }
        >
          {/* ---------- list view ---------- */}
          <header class="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md">
            <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
              <div class="flex items-center gap-2">
                <a href="/" class="flex items-center gap-2 font-heading text-base font-semibold text-ink">
                  <img src={logo} alt="" width="22" height="16" />
                  <span class="hidden sm:inline">Atlas</span>
                </a>
                <span class="text-ink-subtle/60">/</span>
                <span class="font-heading text-base font-semibold text-ink">{t("pluginsEditor.title")}</span>
              </div>
              <div class="flex items-center gap-3">
                <Show when={me()}>
                  <span class="hidden items-center gap-2 rounded-pill border border-border bg-surface py-1 pl-1 pr-3 text-sm md:flex">
                    <span class="h-7 w-7 shrink-0">
                      <DevAvatar developer={me()!} token={token()} size={28} />
                    </span>
                    <span class="font-medium text-ink">@{me()!.handle}</span>
                  </span>
                </Show>
                <button
                  type="button"
                  onClick={() => void doLogout()}
                  class="text-sm font-medium text-ink-subtle transition hover:text-ink"
                >
                  {t("pluginsAuth.logout")}
                </button>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener"
                  class="hidden text-sm font-medium text-ink-subtle transition hover:text-ink sm:inline"
                >
                  GitHub
                </a>
                <a
                  href="/"
                  class="rounded-pill border border-border bg-surface px-4 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:text-accent"
                >
                  {t("pluginsEditor.backHome")}
                </a>
              </div>
            </div>
          </header>
          <div class="mx-auto max-w-6xl px-6 py-12 sm:py-16">
            <div class="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 class="font-heading text-4xl font-semibold sm:text-5xl">
                {t("pluginsEditor.title")}
              </h1>
              <p class="mt-3 max-w-xl text-ink-muted">{t("pluginsEditor.sub")}</p>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setMcpOpen(true)}
                class="flex items-center gap-2 rounded-pill border border-border bg-surface px-5 py-3 text-sm font-medium text-ink transition hover:border-accent/40 hover:text-accent"
              >
                {t("pluginsEditor.mcp")}
              </button>
              <button
                type="button"
                onClick={() => go("/plugins?new=1")}
                class="flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_10px_30px_-10px_rgba(201,119,46,0.7)] transition hover:brightness-105 active:scale-[0.97]"
              >
                <Plus size={16} />
                {t("pluginsEditor.new")}
              </button>
            </div>
          </div>

          <Show when={plugins()}>
            <div class="mb-8 flex flex-wrap gap-2">
              <span class="rounded-pill border border-border bg-surface px-4 py-1.5 text-xs font-medium text-ink-subtle">
                {plugins()!.length} {t("pluginsEditor.published")}
              </span>
              <span class="rounded-pill border border-border bg-surface px-4 py-1.5 text-xs font-medium text-ink-subtle">
                {totalInstalls()} {t("pluginsEditor.downloads")}
              </span>
            </div>
          </Show>

          <Show when={plugins.loading}>
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={[0, 1, 2, 3, 4, 5]}>
                {() => <div class="h-44 animate-pulse rounded-2xl border border-border bg-surface" />}
              </For>
            </div>
          </Show>

          <Show when={plugins.error}>
            <div class="rounded-2xl border border-border bg-surface p-10 text-center">
              <p class="text-ink-muted">{t("pluginsEditor.listError")}</p>
            </div>
          </Show>

          <Show when={plugins() && plugins()!.length === 0}>
            <Reveal>
              <div class="rounded-2xl border border-dashed border-border bg-surface/60 px-10 py-16 text-center">
                <div class="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                  <Sparkle size={26} />
                </div>
                <p class="font-heading text-lg font-semibold">{t("pluginsEditor.emptyTitle")}</p>
                <p class="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{t("pluginsEditor.emptySub")}</p>
                <button
                  type="button"
                  onClick={() => go("/plugins?new=1")}
                  class="mt-6 rounded-pill border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:text-accent"
                >
                  {t("pluginsEditor.new")}
                </button>
              </div>
            </Reveal>
          </Show>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={plugins()}>
              {(p, i) => (
                <Reveal delay={i() * 40}>
                  <article class="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface p-5 transition duration-200 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.4)]">
                    <div class="flex items-start gap-3">
                      <Show
                        when={pluginIconSource(p.files ?? {})}
                        fallback={
                          <div
                            class="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-heading text-lg font-semibold text-white"
                            style={{ background: tileGradient(p.name) }}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        }
                      >
                        <img
                          src={pluginIconSource(p.files ?? {})!}
                          alt=""
                          class="h-11 w-11 shrink-0 rounded-xl object-cover"
                        />
                      </Show>
                      <div class="min-w-0">
                        <p class="flex flex-wrap items-center gap-2 font-heading text-base font-semibold text-ink">
                          <span class="truncate">{p.name}</span>
                          <span class="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                            v{p.version}
                          </span>
                        </p>
                        <p class="font-mono text-[11px] text-ink-subtle">{p.pluginId}</p>
                      </div>
                    </div>

                    {p.description && (
                      <p class="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">
                        {p.description}
                      </p>
                    )}

                    <div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                      <span class="flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-subtle">
                        <Show when={p.developer}>
                          <span class="h-5 w-5 shrink-0">
                            <DevAvatar developer={p.developer!} token={token()} size={20} />
                          </span>
                          <span class="truncate">@{p.developer!.handle}</span>
                          <Show when={p.downloads > 0 || Object.keys(p.files ?? {}).length > 0}>
                            <span class="text-ink-subtle/70">·</span>
                          </Show>
                        </Show>
                        {p.author && !p.developer ? `by ${p.author}` : ""}
                        {!p.developer && p.downloads > 0 ? " · " : ""}
                        {p.downloads > 0 ? `${p.downloads} ${t("pluginsEditor.downloads")}` : ""}
                        {Object.keys(p.files ?? {}).length > 0
                          ? ` · ${Object.keys(p.files ?? {}).length} ${t("pluginsEditor.filesCount")}`
                          : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => go(`/plugins?id=${encodeURIComponent(p.id)}`)}
                        class="grid h-9 w-9 shrink-0 place-items-center rounded-pill border border-border bg-bg text-ink transition group-hover:border-accent/40 group-hover:text-accent"
                        aria-label={t("pluginsEditor.edit")}
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

      {/* MCP settings drawer */}
      <Show when={mcpOpen()}>
        <div class="fixed inset-0 z-40 bg-black/60" onClick={() => setMcpOpen(false)} />
        <div class="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md border-l border-[#2a241c] bg-[#14110d] shadow-2xl">
          <McpSettings
            endpoint={API_BASE}
            token={getPluginToken() ?? ""}
            onClose={() => setMcpOpen(false)}
          />
        </div>
      </Show>

      {/* Project Settings drawer */}
      <Show when={settingsOpen()}>
        <div class="fixed inset-0 z-40 bg-black/60" onClick={() => setSettingsOpen(false)} />
        <div class="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md border-l border-[#2a241c] bg-[#14110d] shadow-2xl">
          <ProjectSettings
            manifest={manifest()}
            files={files()}
            pluginId={editId()}
            lockId={!creating()}
            onApply={applySettings}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      </Show>

      {/* Documentation drawer */}
      <Show when={docsOpen()}>
        <div class="fixed inset-0 z-40 bg-black/40" onClick={() => setDocsOpen(false)} />
        <div class="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md border-l border-border bg-bg shadow-2xl">
          <PluginDocs onClose={() => setDocsOpen(false)} />
        </div>
      </Show>
    </div>
  );
}