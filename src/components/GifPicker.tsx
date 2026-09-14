import { createEffect, createSignal, For, on, Show } from "solid-js";
import { searchGifs, trendingGifs, type KlipyGif } from "../lib/klipy";
import { t } from "../lib/i18n";
import { SpinnerIcon } from "../icons";

export default function GifPicker(props: { onPick: (url: string) => void }) {
  const [query, setQuery] = createSignal("");
  const [items, setItems] = createSignal<KlipyGif[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const load = async (q: string) => {
    setBusy(true);
    setError(null);
    try {
      setItems(q.trim() ? await searchGifs(q.trim()) : await trendingGifs());
    } catch {
      setError(t("gif.error"));
      setItems([]);
    } finally {
      setBusy(false);
    }
  };

  createEffect(on(query, (q) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void load(q), q.trim() ? 280 : 0);
  }));

  const pick = (gif: KlipyGif) => {
    props.onPick(gif.url);
  };

  return (
    <div class="flex min-h-0 flex-col gap-2">
      <div class="relative">
        <input
          type="search"
          value={query()}
          placeholder={t("gif.search")}
          class="atlas-focus h-9 w-full rounded-full bg-bg px-3.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <Show when={busy()}>
          <SpinnerIcon size={14} class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-subtle" />
        </Show>
      </div>
      <Show when={error()}>
        <p class="text-[13px] text-danger">{error()}</p>
      </Show>
      <div class="max-h-[13.5rem] overflow-y-auto overscroll-contain">
        <div class="grid grid-cols-3 gap-1 sm:grid-cols-4">
          <For each={items()} fallback={<p class="col-span-full py-8 text-center text-[13px] text-ink-subtle">{t("gif.empty")}</p>}>
            {(g) => (
              <button
                type="button"
                class="atlas-focus overflow-hidden rounded-lg bg-bg transition-transform duration-150 active:scale-[0.97]"
                style={{ "aspect-ratio": "1" }}
                onClick={() => pick(g)}
                title={g.title}
              >
                <img src={g.preview} alt={g.title} class="h-full w-full object-cover" loading="lazy" />
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
