import { createSignal, For, Show } from "solid-js";
import { Globe } from "phosphor-solid-js";
import { locale, setLocale, type Locale } from "../lib/i18n";

const LANGS: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "ru", label: "RU" },
];

export default function LanguageSwitcher() {
  const [open, setOpen] = createSignal(false);
  let rootRef: HTMLDivElement | undefined;

  const onDocClick = (e: MouseEvent) => {
    if (rootRef && !rootRef.contains(e.target as Node)) setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      class="relative"
      onFocusOut={(e) => {
        if (!rootRef?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => {
          const next = !open();
          setOpen(next);
          if (next) document.addEventListener("click", onDocClick, { once: true, capture: true });
        }}
        class="flex h-9 items-center gap-1.5 rounded-pill border border-white/15 px-3 text-sm text-[#f2ede2]/75 transition hover:text-[#f2ede2]"
        aria-label="Change language"
      >
        <Globe size={15} weight="bold" />
        {locale().toUpperCase()}
      </button>
      <Show when={open()}>
        <div class="absolute right-0 top-11 z-20 w-24 overflow-hidden rounded-xl border border-white/10 bg-[#1a1613] py-1 shadow-floating">
          <For each={LANGS}>
            {(lang) => (
              <button
                type="button"
                onClick={() => {
                  setLocale(lang.id);
                  setOpen(false);
                }}
                class="flex w-full items-center justify-between px-3 py-2 text-sm text-[#f2ede2]/80 transition hover:bg-white/5 hover:text-[#f2ede2]"
                classList={{ "text-accent": locale() === lang.id }}
              >
                {lang.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
