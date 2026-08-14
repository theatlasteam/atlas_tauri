import { createSignal, createMemo, For, onMount, Show } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Dialog from "../../ui/Dialog";
import Switch from "../../ui/Switch";
import { isTauri } from "../../lib/tauri";
import { apiBase } from "../../data/api";
import {
  commandList,
  getConfigScreen,
  hasConfigScreen,
  installFromStore,
  listInstalled,
  permissionsOf,
  pluginEditorUrl,
  pluginIcon,
  pluginIconFromFiles,
  runCommand,
  setPluginEnabled,
  uninstallPlugin,
  type PluginPermission,
  type PluginRecord,
} from "../../plugins/runtime";
import { exportAtp, importAtp } from "../../plugins/atp";
import { preferences } from "../../store/preferences";
import { CheckIcon, DownloadIcon, PlayIcon, PlusIcon, SpinnerIcon, TrashIcon, ExportIcon } from "../../icons";
import { SlidersHorizontal, MagnifyingGlass } from "phosphor-solid-js";
import { t } from "../../lib/i18n";

/** Deterministic gradient for a plugin's initial tile (no image provided). */
function pluginTile(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 72% 46%), hsl(${(hue + 45) % 360} 72% 38%))`;
}

interface StorePlugin {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  files: Record<string, string>;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

function permissionLabel(permission: PluginPermission): string {
  return t(`plugins.perm.${permission}` as never);
}

/** A pending install or activation awaiting the permission confirmation. */
interface ConfirmRequest {
  kind: "install" | "activate";
  pluginId: string;
  name: string;
  permissions: PluginPermission[];
}

/** Icon tile: plugin image, or an initial on a deterministic gradient. */
function PluginTile(props: { name: string; seed: string; icon?: string | null; size?: number }) {
  const size = props.size ?? 40;
  const fallback = () => (
    <span
      class="flex shrink-0 select-none items-center justify-center rounded-xl font-heading font-semibold text-white"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: pluginTile(props.seed),
        "font-size": `${Math.round(size * 0.42)}px`,
      }}
    >
      {(props.name || "?").charAt(0).toUpperCase()}
    </span>
  );
  return (
    <Show when={props.icon} fallback={fallback()}>
      <img
        src={props.icon!}
        alt=""
        class="shrink-0 rounded-xl object-cover"
        style={{ width: `${size}px`, height: `${size}px` }}
      />
    </Show>
  );
}

export default function Plugins() {
  const [installed, setInstalled] = createSignal<PluginRecord[]>([]);
  const [commands, setCommands] = createSignal(commandList());
  const [store, setStore] = createSignal<StorePlugin[]>([]);
  const [storeError, setStoreError] = createSignal<string | null>(null);
  const [storeLoading, setStoreLoading] = createSignal(true);
  const [query, setQuery] = createSignal("");
  const [busy, setBusy] = createSignal<string | null>(null);
  const [removing, setRemoving] = createSignal<PluginRecord | null>(null);
  const [editorOpened, setEditorOpened] = createSignal(false);
  const [confirm, setConfirm] = createSignal<ConfirmRequest | null>(null);
  const [configFor, setConfigFor] = createSignal<PluginRecord | null>(null);
  const [detailsFor, setDetailsFor] = createSignal<StorePlugin | PluginRecord | null>(null);

  const refreshInstalled = async () => {
    setInstalled(await listInstalled());
    setCommands(commandList());
  };

  const loadStore = async () => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const res = await fetch(`${apiBase()}/api/plugins`);
      if (!res.ok) throw new Error(String(res.status));
      setStore(await res.json());
    } catch {
      setStoreError(t("plugins.storeError"));
    } finally {
      setStoreLoading(false);
    }
  };

  onMount(() => {
    void refreshInstalled();
    void loadStore();
  });

  const devMode = () => preferences.developerMode;

  /** Enabling an installed plugin runs it — confirm the trust dialog first. */
  const toggleEnabled = (record: PluginRecord, enabled: boolean) => {
    if (!enabled) {
      void applyEnabled(record.pluginId, false);
      return;
    }
    setConfirm({
      kind: "activate",
      pluginId: record.pluginId,
      name: record.name,
      permissions: permissionsOf(record.files ?? {}),
    });
  };

  const applyEnabled = async (pluginId: string, enabled: boolean) => {
    setBusy(pluginId);
    try {
      await setPluginEnabled(pluginId, enabled);
      await refreshInstalled();
    } finally {
      setBusy(null);
    }
  };

  const doInstall = (plugin: StorePlugin) => {
    setConfirm({
      kind: "install",
      pluginId: plugin.pluginId,
      name: plugin.name,
      permissions: permissionsOf(plugin.files ?? {}),
    });
  };

  /** Actually perform the confirmed install or activation. */
  const doConfirmed = async () => {
    const request = confirm();
    if (!request) return;
    setConfirm(null);
    if (request.kind === "install") {
      const plugin = store().find((p) => p.pluginId === request.pluginId);
      if (!plugin) return;
      setBusy(plugin.pluginId);
      try {
        await installFromStore(plugin);
        await refreshInstalled();
      } finally {
        setBusy(null);
      }
    } else {
      await applyEnabled(request.pluginId, true);
    }
  };

  const doUninstall = async () => {
    const record = removing();
    if (!record) return;
    setRemoving(null);
    setBusy(record.pluginId);
    try {
      await uninstallPlugin(record.pluginId);
      await refreshInstalled();
    } finally {
      setBusy(null);
    }
  };

  const createPlugin = () => {
    const url = pluginEditorUrl();
    if (isTauri) {
      void openUrl(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
    setEditorOpened(true);
  };

  const installedById = () =>
    new Map<string, PluginRecord>(installed().map((p) => [p.pluginId, p]));

  const filteredStore = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return store();
    return store().filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.pluginId.toLowerCase().includes(q),
    );
  });

  const doExport = async (record: PluginRecord) => {
    if (!isTauri) {
      // Web build: download the .atp as a blob.
      const blob = new Blob([JSON.stringify({ atp: 1, plugin: record }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${record.pluginId}.atp`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    await exportAtp(record);
  };

  const doImport = async () => {
    await importAtp();
    await refreshInstalled();
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title={t("plugins.title")} />

      {/* Header actions */}
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 px-4">
        <div class="relative flex-1">
          <MagnifyingGlass
            size={16}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder={t("plugins.search")}
            class="w-full rounded-pill border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-accent"
          />
        </div>
        <div class="flex items-center gap-2">
          <Show when={devMode()}>
            <button
              type="button"
              onClick={() => void doImport()}
              class="flex items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent"
            >
              <ExportIcon size={14} />
              {t("plugins.import")}
            </button>
          </Show>
          <button
            type="button"
            onClick={createPlugin}
            class="flex items-center gap-1.5 rounded-pill bg-accent-soft px-3 py-2 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
          >
            <PlusIcon size={14} />
            {t("plugins.create")}
          </button>
        </div>
      </div>
      <Show when={editorOpened()}>
        <p class="mb-4 px-4 text-xs text-ink-subtle">{t("plugins.createOpened")}</p>
      </Show>

      {/* Installed */}
      <SettingsSection title={t("plugins.installed")}>
        <Show
          when={installed().length > 0}
          fallback={
            <SettingsRow
              label={t("plugins.noPluginsTitle")}
              description={t("plugins.noPluginsSubtitle")}
            />
          }
        >
          <For each={installed()}>
            {(record) => (
              <div class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailsFor(record)}
                    class="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div class="flex min-w-0 items-center gap-3">
                      <PluginTile
                        name={record.name}
                        seed={record.pluginId}
                        icon={pluginIcon(record)}
                      />
                      <div class="min-w-0">
                        <p class="flex items-center gap-2 text-sm font-medium text-ink">
                          <span class="truncate">{record.name}</span>
                          <span class="rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
                            v{record.version}
                          </span>
                        </p>
                        <Show when={record.description}>
                          <p class="mt-0.5 truncate text-xs text-ink-subtle">{record.description}</p>
                        </Show>
                        <Show when={record.author}>
                          <p class="mt-0.5 text-[11px] text-ink-subtle/70">by {record.author}</p>
                        </Show>
                      </div>
                    </div>
                  </button>
                  <div class="flex shrink-0 items-center gap-2">
                    <Show when={busy() === record.pluginId}>
                      <SpinnerIcon size={16} class="animate-spin text-ink-subtle" />
                    </Show>
                    <Show when={devMode()}>
                      <button
                        type="button"
                        onClick={() => void doExport(record)}
                        aria-label={t("plugins.export")}
                        class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
                      >
                        <ExportIcon size={16} />
                      </button>
                    </Show>
                    <Show when={hasConfigScreen(record.pluginId)}>
                      <button
                        type="button"
                        onClick={() => setConfigFor(record)}
                        aria-label={t("plugins.configure")}
                        class="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
                      >
                        <SlidersHorizontal size={18} />
                      </button>
                    </Show>
                    <Switch
                      checked={record.enabled}
                      onChange={(v) => void toggleEnabled(record, v)}
                      label={record.name}
                    />
                  </div>
                </div>

                <Show when={record.enabled}>
                  <For
                    each={commands().filter((c) => c.pluginId === record.pluginId)}
                    fallback={<></>}
                  >
                    {(entry) => (
                      <button
                        type="button"
                        onClick={() => runCommand(entry.pluginId, entry.command.id)}
                        class="mt-2 flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
                      >
                        <PlayIcon size={13} />
                        {entry.command.label}
                      </button>
                    )}
                  </For>
                </Show>

                <button
                  type="button"
                  onClick={() => setRemoving(record)}
                  class="mt-2 flex items-center gap-1.5 text-xs font-medium text-ink-subtle transition hover:text-red-500"
                >
                  <TrashIcon size={13} />
                  {t("plugins.uninstall")}
                </button>
              </div>
            )}
          </For>
        </Show>
      </SettingsSection>

      {/* Store */}
      <SettingsSection title={t("plugins.store")}>
        <Show when={storeLoading()}>
          <SettingsRow label={t("plugins.storeLoading")} />
        </Show>
        <Show when={!storeLoading() && storeError()}>
          <SettingsRow label={storeError()!} />
        </Show>
        <Show when={!storeLoading() && !storeError() && filteredStore().length === 0}>
          <SettingsRow label={t("plugins.storeEmpty")} />
        </Show>
        <Show when={!storeLoading() && !storeError() && filteredStore().length > 0}>
          <div class="px-4 py-1">
            <For each={filteredStore()}>
              {(plugin) => {
                const installedRecord = installedById().get(plugin.pluginId);
                return (
                  <div class="flex items-center gap-3 border-b border-border/60 py-3 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setDetailsFor(plugin)}
                      class="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <PluginTile
                        name={plugin.name}
                        seed={plugin.pluginId}
                        icon={pluginIconFromFiles(plugin.files ?? {})}
                      />
                      <div class="min-w-0">
                        <p class="flex items-center gap-2 font-medium text-ink">
                          <span class="truncate">{plugin.name}</span>
                          <span class="text-[10px] font-medium text-ink-subtle">v{plugin.version}</span>
                        </p>
                        <p class="truncate text-xs text-ink-subtle">{plugin.description}</p>
                        <p class="mt-0.5 text-[11px] text-ink-subtle/70">
                          {plugin.author ? `by ${plugin.author}` : plugin.pluginId}
                          {plugin.downloads > 0 ? ` · ${plugin.downloads} installs` : ""}
                        </p>
                      </div>
                    </button>
                    <div class="flex shrink-0 items-center gap-2">
                      <Show when={busy() === plugin.pluginId}>
                        <SpinnerIcon size={16} class="animate-spin text-ink-subtle" />
                      </Show>
                      <Show when={installedRecord}>
                        <span class="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white">
                          <CheckIcon size={13} />
                          {t("plugins.installedBadge")}
                        </span>
                      </Show>
                      <Show when={!installedRecord && busy() !== plugin.pluginId}>
                        <button
                          type="button"
                          onClick={() => doInstall(plugin)}
                          class="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
                        >
                          <DownloadIcon size={14} />
                          {t("plugins.install")}
                        </button>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </SettingsSection>

      <Dialog
        open={!!removing()}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={t("plugins.uninstallTitle")}
      >
        <p class="mb-5 text-sm text-ink-muted">
          {t("plugins.uninstallBody", { name: removing()?.name ?? "" })}
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setRemoving(null)}
            class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg"
          >
            {t("plugins.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void doUninstall()}
            class="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            {t("plugins.remove")}
          </button>
        </div>
      </Dialog>

      {/* Trust dialog: community plugin + its declared permissions. */}
      <Dialog
        open={!!confirm()}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={t("plugins.trustTitle")}
      >
        <p class="mb-3 text-sm text-ink-muted">
          {t("plugins.trustBody", { name: confirm()?.name ?? "" })}
        </p>
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          {t("plugins.trustPermissions")}
        </p>
        <ul class="mb-5 max-h-44 space-y-1.5 overflow-y-auto rounded-2xl border border-border bg-bg p-3">
          <For each={confirm()?.permissions ?? []}>
            {(permission) => (
              <li class="flex items-start gap-2 text-sm text-ink">
                <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {permissionLabel(permission)}
              </li>
            )}
          </For>
        </ul>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirm(null)}
            class="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg"
          >
            {t("plugins.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void doConfirmed()}
            class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:opacity-90"
          >
            {confirm()?.kind === "activate"
              ? t("plugins.trustActivate")
              : t("plugins.trustContinue")}
          </button>
        </div>
      </Dialog>

      {/* Plugin details bottom sheet */}
      <Dialog
        open={!!detailsFor()}
        onOpenChange={(open) => {
          if (!open) setDetailsFor(null);
        }}
        title={detailsFor()?.name ?? ""}
      >
        {(() => {
          const item = detailsFor();
          if (!item) return null;
          const isInstalled = "enabled" in item;
          const record = isInstalled ? (item as PluginRecord) : null;
          const storePlugin = isInstalled ? null : (item as StorePlugin);
          const permissions = permissionsOf(item.files ?? {});
          const icon = isInstalled
            ? pluginIcon(record!)
            : pluginIconFromFiles(storePlugin!.files ?? {});
          const name = item.name;
          const version = item.version;
          const author = item.author;
          const description = item.description;
          const downloads = "downloads" in item ? (item as StorePlugin).downloads : 0;

          return (
            <div class="-m-5 flex flex-col">
              <div class="flex items-start gap-4 px-5 pt-5">
                <PluginTile name={name} seed={item.pluginId} icon={icon} size={56} />
                <div class="min-w-0 flex-1">
                  <h3 class="font-heading text-lg font-semibold text-ink">{name}</h3>
                  <p class="text-xs text-ink-subtle">
                    v{version}
                    {author ? ` · by ${author}` : ""}
                    {downloads > 0 ? ` · ${downloads} installs` : ""}
                  </p>
                  {description && <p class="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>}
                </div>
              </div>

              <div class="mt-4 border-t border-border px-5 py-4">
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                  {t("plugins.trustPermissions")}
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <For each={permissions}>
                    {(permission) => (
                      <span class="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                        {permission}
                      </span>
                    )}
                  </For>
                </div>
              </div>

              <div class="flex items-center gap-2 border-t border-border px-5 py-4">
                <Show when={isInstalled && record!.enabled}>
                  <For
                    each={commands().filter((c) => c.pluginId === record!.pluginId)}
                    fallback={<></>}
                  >
                    {(entry) => (
                      <button
                        type="button"
                        onClick={() => runCommand(entry.pluginId, entry.command.id)}
                        class="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-2 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
                      >
                        <PlayIcon size={13} />
                        {entry.command.label}
                      </button>
                    )}
                  </For>
                </Show>

                <div class="ml-auto flex items-center gap-2">
                  <Show when={isInstalled && devMode()}>
                    <button
                      type="button"
                      onClick={() => void doExport(record!)}
                      class="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent"
                    >
                      <ExportIcon size={14} />
                      {t("plugins.export")}
                    </button>
                  </Show>
                  <Show when={isInstalled && hasConfigScreen(record!.pluginId)}>
                    <button
                      type="button"
                      onClick={() => {
                        setConfigFor(record!);
                        setDetailsFor(null);
                      }}
                      class="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent"
                    >
                      <SlidersHorizontal size={14} />
                      {t("plugins.configure")}
                    </button>
                  </Show>
                  <Show when={isInstalled}>
                    <button
                      type="button"
                      onClick={() => {
                        setRemoving(record!);
                        setDetailsFor(null);
                      }}
                      class="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:border-red-500/40 hover:text-red-500"
                    >
                      <TrashIcon size={14} />
                      {t("plugins.uninstall")}
                    </button>
                  </Show>
                  <Show when={!isInstalled}>
                    <button
                      type="button"
                      onClick={() => {
                        doInstall(storePlugin!);
                        setDetailsFor(null);
                      }}
                      class="flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-2 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
                    >
                      <DownloadIcon size={14} />
                      {t("plugins.install")}
                    </button>
                  </Show>
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>

      {/* Plugin config screen — a Solid component the plugin registered via
          ctx.ui.configScreen(...). Full-screen overlay above the list. */}
      <Show when={configFor()}>
        {(() => {
          const record = configFor()!;
          const Comp = getConfigScreen(record.pluginId);
          return (
            <div class="fixed inset-0 z-50 flex flex-col bg-bg">
              <header class="flex shrink-0 items-center justify-between border-b border-border bg-appbar px-4 pb-3 pt-[max(var(--safe-top),1.5rem)]">
                <h1 class="font-heading text-xl font-bold">{record.name}</h1>
                <button
                  type="button"
                  onClick={() => setConfigFor(null)}
                  aria-label={t("plugins.configClose")}
                  class="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
                >
                  ✕
                </button>
              </header>
              <div class="min-h-0 flex-1 overflow-y-auto">
                {Comp ? Comp({ plugin: { id: record.pluginId, name: record.name }, onClose: () => setConfigFor(null) }) : null}
              </div>
            </div>
          );
        })()}
      </Show>
    </div>
  );
}
