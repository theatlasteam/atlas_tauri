import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { extractUrls, hostnameOf, isImageUrl, textWithoutUrls } from "../lib/linkEmbeds";
import { canvasIdFromUrl } from "../lib/canvasShare";
import { t } from "../lib/i18n";

export default function LinkEmbeds(props: { text: string }) {
  const urls = () => extractUrls(props.text);
  const rest = () => textWithoutUrls(props.text, urls());
  return (
    <Show when={urls().length > 0}>
      <div class="mt-1 flex flex-col gap-1.5" classList={{ "mt-0": !rest() }}>
        <For each={urls()}>
          {(url) => (
            <Show
              when={canvasIdFromUrl(url)}
              fallback={
                <Show
                  when={isImageUrl(url)}
                  fallback={
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="atlas-focus block overflow-hidden rounded-xl border border-border bg-bg px-3 py-2 no-underline"
                    >
                      <p class="truncate text-xs font-semibold text-accent">{hostnameOf(url)}</p>
                      <p class="truncate text-[13px] text-ink-muted">{url}</p>
                    </a>
                  }
                >
                  <a href={url} target="_blank" rel="noopener noreferrer" class="block overflow-hidden rounded-xl">
                    <img src={url} alt="" class="max-h-72 w-full object-contain bg-bg" />
                  </a>
                </Show>
              }
            >
              {(id) => (
                <A
                  href={`/canvas/${id()}`}
                  class="atlas-focus flex items-center gap-3 rounded-xl border border-border bg-bg px-3 py-3 no-underline"
                >
                  <span class="grid h-11 w-11 place-items-center rounded-2xl bg-accent-soft text-accent font-heading text-lg">C</span>
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold text-ink">{t("canvas.title")}</span>
                    <span class="block text-[13px] text-ink-muted">{t("canvas.open")}</span>
                  </span>
                </A>
              )}
            </Show>
          )}
        </For>
      </div>
    </Show>
  );
}
