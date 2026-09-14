import { createResource, createSignal, Show } from "solid-js";
import { api, type CustomEmojiMetaDto } from "../data/api";
import { session } from "../store/session";
import { t } from "../lib/i18n";

const urlCache = new Map<string, Promise<string>>();

function emojiUrl(id: string): Promise<string> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const pending = api.fetchEmojiUrl(id);
  pending.catch(() => urlCache.delete(id));
  urlCache.set(id, pending);
  return pending;
}

export function CustomEmojiImg(props: { id: string; size?: number }) {
  const [url] = createResource(() => props.id, emojiUrl);
  const size = () => props.size ?? 32;
  return (
    <Show when={url()} fallback={<span class="block rounded bg-black/10" style={{ width: `${size()}px`, height: `${size()}px` }} />}>
      <img src={url()} alt="" class="object-contain" style={{ width: `${size()}px`, height: `${size()}px` }} />
    </Show>
  );
}

export default function CustomEmoji(props: { id: string; size?: number }) {
  const [meta, setMeta] = createSignal<CustomEmojiMetaDto | null>(null);
  const [open, setOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const size = () => props.size ?? 32;

  const toggle = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open()) {
      setOpen(false);
      return;
    }
    try {
      const m = await api.emojiMeta(props.id);
      setMeta(m);
      setOpen(true);
    } catch {
      setOpen(true);
    }
  };

  const mine = () => meta()?.ownerId === session.user()?.id || meta()?.inMyPack;

  const save = async (e: MouseEvent) => {
    e.stopPropagation();
    const owner = meta()?.ownerId;
    if (!owner || saving()) return;
    setSaving(true);
    try {
      await api.saveEmojiPack(owner);
      setMeta((m) => (m ? { ...m, inMyPack: true } : m));
    } finally {
      setSaving(false);
    }
  };

  return (
    <span class="relative inline-block align-middle">
      <button
        type="button"
        class="atlas-focus inline-grid place-items-center rounded-md p-0.5 hover:bg-black/10"
        style={{ width: `${size() + 4}px`, height: `${size() + 4}px` }}
        onClick={toggle}
        title={t("emoji.custom.hint")}
      >
        <CustomEmojiImg id={props.id} size={size()} />
      </button>
      <Show when={open()}>
        <div class="absolute bottom-full left-1/2 z-20 mb-1 w-48 -translate-x-1/2 rounded-xl border border-border bg-surface-raised p-2 text-left shadow-floating">
          <p class="truncate text-xs font-semibold text-ink">
            {meta()?.name || t("emoji.custom.untitled")}
          </p>
          <p class="truncate text-[11px] text-ink-subtle">
            @{meta()?.ownerHandle ?? "…"}
          </p>
          <Show when={meta() && !mine()}>
            <button
              type="button"
              class="atlas-focus mt-2 min-h-11 w-full rounded-pill bg-accent text-sm font-medium text-accent-ink disabled:opacity-50"
              disabled={saving()}
              onClick={(e) => void save(e)}
            >
              {saving() ? t("emoji.custom.saving") : t("emoji.custom.addPack")}
            </button>
          </Show>
          <Show when={mine()}>
            <p class="mt-1 text-[11px] text-ink-subtle">{t("emoji.custom.havePack")}</p>
          </Show>
        </div>
      </Show>
    </span>
  );
}
