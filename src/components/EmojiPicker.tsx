import data from "@emoji-mart/data/sets/15/twitter.json";
import type { EmojiMartData } from "@emoji-mart/data";
import { Twemoji } from "@atlas/ui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { t, type TranslationKey } from "../lib/i18n";

const mart = data as EmojiMartData;

const CATEGORY_KEYS: Record<string, TranslationKey> = {
  people: "emoji.cat.people",
  nature: "emoji.cat.nature",
  foods: "emoji.cat.foods",
  activity: "emoji.cat.activity",
  places: "emoji.cat.places",
  objects: "emoji.cat.objects",
  symbols: "emoji.cat.symbols",
  flags: "emoji.cat.flags",
};

export default function EmojiPicker(props: { onPick: (native: string) => void }) {
  const [query, setQuery] = createSignal("");
  const [category, setCategory] = createSignal(mart.categories[0]?.id ?? "people");

  const results = createMemo(() => {
    const q = query().trim().toLowerCase();
    const ids = q
      ? Object.keys(mart.emojis).filter((id) => {
          const e = mart.emojis[id];
          if (!e) return false;
          if (e.id.includes(q) || e.name.toLowerCase().includes(q)) return true;
          return e.keywords?.some((k) => k.includes(q)) ?? false;
        })
      : (mart.categories.find((c) => c.id === category())?.emojis ?? []);
    return ids
      .map((id) => mart.emojis[id])
      .filter(Boolean)
      .map((e) => ({
        id: e!.id,
        name: e!.name,
        native: e!.skins[0]!.native,
        unified: e!.skins[0]!.unified,
      }));
  });

  return (
    <div class="flex min-h-0 flex-col gap-3">
      <input
        type="search"
        value={query()}
        placeholder={t("emoji.search")}
        class="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent"
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      <Show when={!query().trim()}>
        <div class="no-scrollbar flex gap-1 overflow-x-auto">
          <For each={mart.categories.filter((c) => CATEGORY_KEYS[c.id])}>
            {(c) => (
              <button
                type="button"
                class="shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium transition"
                classList={{
                  "bg-accent text-accent-ink": category() === c.id,
                  "bg-surface text-ink-muted hover:text-ink": category() !== c.id,
                }}
                onClick={() => setCategory(c.id)}
              >
                {t(CATEGORY_KEYS[c.id]!)}
              </button>
            )}
          </For>
        </div>
      </Show>
      <div class="grid max-h-[min(52vh,22rem)] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain sm:grid-cols-9">
        <For each={results()} fallback={<p class="col-span-full py-6 text-center text-sm text-ink-subtle">{t("emoji.empty")}</p>}>
          {(e) => (
            <button
              type="button"
              title={e.name}
              class="grid aspect-square place-items-center rounded-xl transition hover:bg-accent-soft active:scale-95"
              onClick={() => props.onPick(e.native)}
            >
              <Twemoji emoji={e.native} unified={e.unified} size={26} />
            </button>
          )}
        </For>
      </div>
      <p class="text-[10px] text-ink-subtle">{t("emoji.twemojiCredit")}</p>
    </div>
  );
}
