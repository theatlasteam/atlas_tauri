import { createResource, Show } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { api } from "../data/api";
import { BackIcon, CopyIcon, SpaceIcon } from "../icons";
import { t } from "../lib/i18n";
import { spaceShareUrl } from "../lib/spaceShare";
import { useIsDesktopLayout } from "../lib/platform";

export default function SpaceView() {
  const params = useParams<{ id: string }>();
  const isDesktop = useIsDesktopLayout();
  const [space] = createResource(() => params.id, (id) => api.getSpace(id));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(spaceShareUrl(params.id));
    } catch {
      /* ignore */
    }
  };

  return (
    <div class="flex h-full flex-col bg-bg">
      <header class="flex shrink-0 items-center gap-2 border-b border-border bg-appbar px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <Show when={!isDesktop()}>
          <A
            href="/compass"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
          >
            <BackIcon size={22} />
          </A>
        </Show>
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <SpaceIcon size={18} />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold">{space()?.title ?? t("space.loading")}</p>
          <p class="truncate text-xs text-ink-subtle">{t("space.sandboxNote")}</p>
        </div>
        <a
          href={spaceShareUrl(params.id)}
          target="_blank"
          rel="noreferrer"
          class="flex h-11 items-center rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-surface hover:text-ink"
        >
          {t("space.publicHint")}
        </a>
        <button
          type="button"
          class="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-surface hover:text-ink"
          onClick={() => void copy()}
        >
          <CopyIcon size={16} />
          {t("space.share")}
        </button>
      </header>
      <Show
        when={!space.error}
        fallback={<p class="p-6 text-sm text-danger">{t("space.missing")}</p>}
      >
        <iframe
          title={space()?.title ?? "Space"}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          class="min-h-0 w-full flex-1 border-0 bg-white"
          srcdoc={space()?.html ?? ""}
        />
      </Show>
    </div>
  );
}
