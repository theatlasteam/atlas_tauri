import { For, Show } from "solid-js";
import { extractUrls, hostnameOf, isImageUrl, textWithoutUrls } from "../lib/linkEmbeds";

export default function LinkEmbeds(props: { text: string }) {
  const urls = () => extractUrls(props.text);
  const rest = () => textWithoutUrls(props.text, urls());
  return (
    <Show when={urls().length > 0}>
      <div class="mt-1 flex flex-col gap-1.5" classList={{ "mt-0": !rest() }}>
        <For each={urls()}>
          {(url) => (
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
          )}
        </For>
      </div>
    </Show>
  );
}
