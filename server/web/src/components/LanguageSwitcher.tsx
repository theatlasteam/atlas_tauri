import { createSignal, For, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import { Globe } from "phosphor-solid-js";
import { locale, setLocale, type Locale } from "../lib/i18n";

const LANGS: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "ru", label: "RU" },
];

export default function LanguageSwitcher(props: { compact?: boolean }) {
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
        class="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-pill border border-white/15 text-sm text-[#f2ede2]/75 transition-[color,gap,padding] duration-300 hover:text-[#f2ede2]"
        classList={{ "gap-0 px-0": props.compact, "gap-1.5 px-3": !props.compact }}
        aria-label="Change language"
      >
        <Globe size={15} weight="bold" class="shrink-0" />
        {/* Collapsing the label's grid track keeps it in the DOM so its
            width animates, instead of Show-ing it away in one frame. */}
        <span
          class="grid overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
          classList={{ "grid-cols-[1fr]": !props.compact, "grid-cols-[0fr]": props.compact }}
        >
          <span class="overflow-hidden whitespace-nowrap">{locale().toUpperCase()}</span>
        </span>
      </button>
      <Transition name="pop">
        <Show when={open()}>
          <div class="absolute right-0 top-11 z-20 w-24 origin-top-right overflow-hidden rounded-xl border border-white/10 bg-[#1a1613] py-1 shadow-floating">
            <For each={LANGS}>
              {(lang) => (
                <button
                  type="button"
                  onClick={() => {
                    setLocale(lang.id);
                    setOpen(false);
                    window.location.assign(`/${lang.id}`);
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
      </Transition>
    </div>
  );
}
