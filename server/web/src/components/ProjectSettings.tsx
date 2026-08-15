import { createSignal, For, Show, type JSX } from "solid-js";
import { t } from "../lib/i18n";
import { X } from "phosphor-solid-js";
import Checkbox from "./Checkbox";
import { uploadPluginIcon } from "../lib/api";

/** Every permission the SDK understands, with a hint for the settings list. */
const KNOWN_PERMISSIONS = [
  { id: "commands", label: "plugins.perm.commands" },
  { id: "messages.read", label: "plugins.perm.messages.read" },
  { id: "messages.send", label: "plugins.perm.messages.send" },
  { id: "chats.read", label: "plugins.perm.chats.read" },
  { id: "users.read", label: "plugins.perm.users.read" },
  { id: "navigation", label: "plugins.perm.navigation" },
  { id: "notifications", label: "plugins.perm.notifications" },
  { id: "storage", label: "plugins.perm.storage" },
  { id: "api", label: "plugins.perm.api" },
  { id: "events", label: "plugins.perm.events" },
  { id: "ui", label: "plugins.perm.ui" },
];

export interface ManifestShape {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  icon?: string;
  permissions?: string[];
  [key: string]: unknown;
}

interface ProjectSettingsProps {
  manifest: ManifestShape;
  files: Record<string, string>;
  /** The plugin's store id (null when creating a brand-new plugin). */
  pluginId?: string | null;
  /** Manifest id can't change after publish (disabled when editing). */
  lockId: boolean;
  onApply: (files: Record<string, string>) => void;
  onClose: () => void;
}

const inputCls =
  "w-full rounded-lg border border-[#2a241c] bg-[#1a1712] px-3 py-2 text-sm text-[#f2ede2] outline-none transition focus:border-[#c9772e]/70 placeholder:text-[#5c554a]";

function Field(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <label class="block">
      <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
        {props.label}
      </span>
      {props.children}
      <Show when={props.hint}>
        <span class="mt-1 block text-[11px] text-[#5c554a]">{props.hint}</span>
      </Show>
    </label>
  );
}

/** Right-hand "Project Settings" drawer: edit the manifest visually, upload
 *  a plugin icon (PFP), pick permissions. Writes back into the file map. */
export default function ProjectSettings(props: ProjectSettingsProps) {
  const [id, setId] = createSignal(props.manifest.id ?? "");
  const [name, setName] = createSignal(props.manifest.name ?? "");
  const [version, setVersion] = createSignal(props.manifest.version ?? "");
  const [description, setDescription] = createSignal(props.manifest.description ?? "");
  const [main, setMain] = createSignal(props.manifest.main ?? "src/main.tsx");
  const [iconPath, setIconPath] = createSignal(props.manifest.icon ?? "");
  const [permissions, setPermissions] = createSignal<string[]>(props.manifest.permissions ?? []);
  // Newly picked icon: keep the File (uploaded on apply for existing plugins)
  // plus a data-URL preview; for brand-new plugins we fall back to writing
  // the data URL into the workspace file so the icon ships with the create.
  const [iconFile, setIconFile] = createSignal<File | null>(null);
  const [iconData, setIconData] = createSignal<string | null>(null);
  const [iconName, setIconName] = createSignal<string | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string | null>(null);

  const togglePermission = (perm: string) => {
    setPermissions((list) =>
      list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm],
    );
  };

  const onPickImage = (file: File | undefined) => {
    if (!file) return;
    setIconFile(file);
    setIconName(file.name);
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => setIconData(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const currentIconSource = () => {
    if (iconData()) return iconData()!;
    const path = iconPath();
    if (!path) return null;
    // URL-based icon (server upload) or legacy workspace file.
    if (path.startsWith("/api/") || /^https?:\/\//.test(path)) return path;
    const content = props.files[path];
    if (!content) return null;
    return content.startsWith("data:")
      ? content
      : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  };

  const apply = async () => {
    setUploading(true);
    setUploadError(null);
    const nextManifest: ManifestShape = {
      id: id().trim(),
      name: name().trim(),
      version: version().trim(),
      description: description().trim(),
      main: main().trim() || "src/main.tsx",
      ...(iconPath().trim() ? { icon: iconPath().trim() } : {}),
      permissions: permissions(),
    };
    const nextFiles = { ...props.files };

    // Newly picked icon:
    //  - existing plugin  -> upload to the server, reference the URL
    //  - brand-new plugin -> write the data URL into the workspace so the
    //    icon ships with the create (no server row to attach it to yet)
    if (iconFile() && iconData() && iconName()) {
      if (props.pluginId) {
        try {
          const url = await uploadPluginIcon(props.pluginId, iconFile()!);
          setIconPath(url);
          nextManifest.icon = url;
        } catch (e) {
          setUploading(false);
          setUploadError(e instanceof Error ? e.message : t("pluginsEditor.settingsUploadError"));
          return;
        }
      } else {
        const ext = iconName()!.split(".").pop()?.toLowerCase() ?? "png";
        const path = iconPath().trim() || `icon.${ext}`;
        nextFiles[path] = iconData()!;
        setIconPath(path);
        nextManifest.icon = path;
      }
    }

    nextFiles["manifest.json"] = JSON.stringify(nextManifest, null, 2);
    setUploading(false);
    props.onApply(nextFiles);
  };

  return (
    <div class="flex h-full flex-col">
      <header class="flex items-center justify-between border-b border-[#2a241c] bg-[#0f0d0b] px-4 py-3">
        <h2 class="font-heading text-sm font-semibold text-[#f2ede2]">
          {t("pluginsEditor.projectSettings")}
        </h2>
        <button
          type="button"
          onClick={props.onClose}
          aria-label={t("pluginsEditor.settingsClose")}
          class="grid h-8 w-8 place-items-center rounded-full text-[#8a8171] transition hover:bg-white/5 hover:text-[#f2ede2]"
        >
          <X size={16} />
        </button>
      </header>

      <div class="flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {/* Icon upload */}
        <section>
          <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.settingsIcon")}
          </span>
          <div class="flex items-center gap-3">
            <Show
              when={currentIconSource()}
              fallback={
                <span class="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[#2a241c] bg-[#1a1712] font-heading text-xl font-semibold text-[#8a8171]">
                  {(name() || "?").charAt(0).toUpperCase()}
                </span>
              }
            >
              <img src={currentIconSource()!} alt="" class="h-14 w-14 shrink-0 rounded-xl object-cover" />
            </Show>
            <label class="cursor-pointer rounded-lg border border-[#2a241c] bg-[#1a1712] px-3 py-2 text-xs font-medium text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5">
              {t("pluginsEditor.settingsUploadIcon")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                class="hidden"
                onChange={(e) => onPickImage(e.currentTarget.files?.[0])}
              />
            </label>
            <Show when={iconName()}>
              <span class="truncate text-[11px] text-[#5c554a]">{iconName()}</span>
            </Show>
          </div>
          <Show when={uploadError()}>
            <p class="mt-2 text-[11px] text-red-400">{uploadError()}</p>
          </Show>
        </section>

        {/* Manifest fields */}
        <section class="space-y-4">
          <span class="block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.settingsManifest")}
          </span>
          <Field label={t("pluginsEditor.settingsId")} hint={t("pluginsEditor.settingsIdHint")}>
            <input
              value={id()}
              onInput={(e) => setId(e.currentTarget.value)}
              disabled={props.lockId}
              spellcheck={false}
              class={`${inputCls} disabled:cursor-not-allowed disabled:opacity-50`}
            />
          </Field>
          <Field label={t("pluginsEditor.settingsName")}>
            <input value={name()} onInput={(e) => setName(e.currentTarget.value)} class={inputCls} />
          </Field>
          <div class="grid grid-cols-2 gap-3">
            <Field label={t("pluginsEditor.settingsVersion")}>
              <input
                value={version()}
                onInput={(e) => setVersion(e.currentTarget.value)}
                spellcheck={false}
                class={inputCls}
              />
            </Field>
            <Field label={t("pluginsEditor.settingsMain")}>
              <input
                value={main()}
                onInput={(e) => setMain(e.currentTarget.value)}
                spellcheck={false}
                class={inputCls}
              />
            </Field>
          </div>
          <Field label={t("pluginsEditor.settingsDescription")}>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              rows={3}
              class={`${inputCls} resize-none`}
            />
          </Field>
          <Field label={t("pluginsEditor.settingsIconPath")}>
            <input
              value={iconPath()}
              onInput={(e) => setIconPath(e.currentTarget.value)}
              spellcheck={false}
              class={inputCls}
              placeholder="icon.svg"
            />
          </Field>
        </section>

        {/* Permissions */}
        <section>
          <span class="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#8a8171]">
            {t("pluginsEditor.settingsPermissions")}
          </span>
          <div class="space-y-1">
            <For each={KNOWN_PERMISSIONS}>
              {(perm) => {
                const on = () => permissions().includes(perm.id);
                return (
                  <label class="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-white/5">
                    <Checkbox checked={on()} onChange={() => togglePermission(perm.id)} />
                    <span
                      class="truncate"
                      classList={{ "text-[#f2ede2]": on(), "text-[#8a8171]": !on() }}
                    >
                      {perm.id}
                    </span>
                    <span class="ml-auto truncate text-[10px] text-[#5c554a]">
                      {t(perm.label as never)}
                    </span>
                  </label>
                );
              }}
            </For>
          </div>
        </section>
      </div>

      <footer class="flex items-center justify-end gap-2 border-t border-[#2a241c] bg-[#0f0d0b] px-4 py-3">
        <button
          type="button"
          onClick={props.onClose}
          class="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-[#d4d4d4] transition hover:border-white/25 hover:bg-white/5"
        >
          {t("pluginsEditor.settingsCancel")}
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={uploading()}
          class="rounded-md bg-[#c9772e] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
        >
          {uploading() ? t("pluginsEditor.settingsUploading") : t("pluginsEditor.settingsApply")}
        </button>
      </footer>
    </div>
  );
}
