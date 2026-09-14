import { createResource, createSignal, For, Show } from "solid-js";
import { api, type CustomEmojiDto, type EmojiLibraryDto } from "../data/api";
import { CustomEmojiImg } from "./CustomEmoji";
import { t } from "../lib/i18n";
import { SpinnerIcon, TrashIcon } from "../icons";

const MAX_BYTES = 1.5 * 1024 * 1024;

export default function CustomEmojiPicker(props: { onPick: (id: string) => void }) {
  const [lib, { refetch }] = createResource(() => api.listEmoji());
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError(t("emoji.custom.tooBig"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError(t("emoji.custom.notImage"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dims = await imageDims(file).catch(() => ({ width: 0, height: 0 }));
      await api.uploadEmoji(file, {
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 32),
        mime: file.type,
        width: dims.width || undefined,
        height: dims.height || undefined,
      });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("emoji.custom.uploadError"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: MouseEvent, id: string) => {
    e.stopPropagation();
    setBusy(true);
    try {
      await api.deleteEmoji(id);
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const data = () => lib() as EmojiLibraryDto | undefined;

  return (
    <div class="flex min-h-0 flex-col gap-2">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/webp,image/gif,image/jpeg"
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void upload(file);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        class="atlas-focus min-h-9 rounded-full bg-bg px-3 text-[13px] font-medium text-ink-muted hover:text-ink"
        disabled={busy()}
        onClick={() => fileInput?.click()}
      >
        <Show when={busy()} fallback={t("emoji.custom.upload")}>
          <SpinnerIcon size={16} class="inline animate-spin" /> {t("emoji.custom.uploading")}
        </Show>
      </button>
      <p class="px-1 text-[11px] leading-snug text-ink-subtle">{t("emoji.custom.limit")}</p>
      <Show when={error()}>
        <p class="text-sm text-danger">{error()}</p>
      </Show>
      <div class="max-h-56 overflow-y-auto">
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{t("emoji.custom.mine")}</p>
        <div class="mb-3 flex flex-wrap gap-1">
          <For each={data()?.mine ?? []} fallback={<p class="text-sm text-ink-subtle">{t("emoji.custom.empty")}</p>}>
            {(em: CustomEmojiDto) => (
              <span class="group relative">
                <button type="button" class="atlas-focus rounded-md p-0.5 hover:bg-accent-soft" onClick={() => props.onPick(em.id)}>
                  <CustomEmojiImg id={em.id} size={36} />
                </button>
                <button
                  type="button"
                  class="absolute -right-1 -top-1 hidden h-6 w-6 place-items-center rounded-full bg-surface-raised text-danger shadow-sm group-hover:grid"
                  onClick={(e) => void remove(e, em.id)}
                  aria-label={t("emoji.custom.delete")}
                >
                  <TrashIcon size={12} />
                </button>
              </span>
            )}
          </For>
        </div>
        <For each={data()?.packs ?? []}>
          {(pack) => (
            <div class="mb-3">
              <p class="mb-1 truncate text-[11px] font-semibold text-ink-subtle">
                @{pack.ownerHandle}
              </p>
              <div class="flex flex-wrap gap-1">
                <For each={pack.emojis}>
                  {(em) => (
                    <button type="button" class="atlas-focus rounded-md p-0.5 hover:bg-accent-soft" onClick={() => props.onPick(em.id)}>
                      <CustomEmojiImg id={em.id} size={36} />
                    </button>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function imageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}
