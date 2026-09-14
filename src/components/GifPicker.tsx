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
      <input
        type="search"
        value={query()}
        placeholder={t("gif.search")}
        class="atlas-focus min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-ink outline-none placeholder:text-ink-subtle"
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <Show when={error()}>
        <p class="text-sm text-danger">{error()}</p>
      </Show>
      <div class="relative max-h-56 overflow-y-auto">
        <Show when={busy()}>
          <div class="absolute inset-0 z-10 grid place-items-center bg-surface/60">
            <SpinnerIcon size={22} class="animate-spin text-ink-muted" />
          </div>
        </Show>
        <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          <For each={items()} fallback={<p class="col-span-full py-6 text-center text-sm text-ink-subtle">{t("gif.empty")}</p>}>
            {(g) => (
              <button
                type="button"
                class="atlas-focus overflow-hidden rounded-xl bg-bg"
                style={{ "aspect-ratio": `${Math.max(g.width, 1)} / ${Math.max(g.height, 1)}` }}
                onClick={() => pick(g)}
                title={g.title}
              >
                <img src={g.preview} alt={g.title} class="h-full w-full object-cover" loading="lazy" />
              </button>
            )}
          </For>
        </div>
      </div>
      <p class="text-[10px] text-ink-subtle">{t("gif.credit")}</p>
    </div>
  );
}
