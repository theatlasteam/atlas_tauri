import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Transition } from "solid-transition-group";
import { cx } from "./lib/cx";

export type ComboboxOption = { value: string; label: string; hint?: string };

export default function Combobox(props: {
  label?: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  class?: string;
  /** Allow typing a value that is not in the list. */
  allowCustom?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [active, setActive] = createSignal(0);
  const listId = `atlas-combo-${Math.random().toString(36).slice(2, 9)}`;
  let root: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  let listEl: HTMLDivElement | undefined;

  const selected = createMemo(() => props.options.find((o) => o.value === props.value));

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase();
    const selectedLabel = selected()?.label.toLowerCase();
    if (!q || q === selectedLabel) return props.options;
    return props.options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
    );
  });

  function commit(opt: ComboboxOption) {
    props.onChange(opt.value);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open() && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open()) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => {
        const n = Math.min(i + 1, Math.max(filtered().length - 1, 0));
        queueMicrotask(() => listEl?.querySelectorAll("[role=option]")[n]?.scrollIntoView({ block: "nearest" }));
        return n;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered()[active()];
      if (hit) commit(hit);
      else if (props.allowCustom && query().trim()) {
        props.onChange(query().trim());
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  onMount(() => {
    const onDoc = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    onCleanup(() => document.removeEventListener("mousedown", onDoc));
  });

  return (
    <label class={cx("flex flex-col gap-1.5 text-sm", props.class)}>
      <Show when={props.label}>
        <span class="font-medium text-ink">{props.label}</span>
      </Show>
      <div class="relative" ref={(el) => (root = el)}>
        <input
          ref={(el) => (input = el)}
          role="combobox"
          aria-expanded={open()}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={props.disabled}
          class="atlas-focus min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 pr-9 text-[15px] text-ink outline-none placeholder:text-ink-subtle"
          placeholder={props.placeholder ?? "Search…"}
          value={open() ? query() : (selected()?.label ?? props.value)}
          onFocus={() => {
            setOpen(true);
            setQuery(selected()?.label ?? "");
            setActive(Math.max(0, props.options.findIndex((o) => o.value === props.value)));
          }}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle"
          aria-label="Toggle list"
          onClick={() => {
            setOpen((v) => !v);
            input?.focus();
          }}
        >
          <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
            <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
        <Transition name="pop">
          <Show when={open()}>
            <div
              id={listId}
              ref={(el) => (listEl = el)}
              role="listbox"
              class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 origin-top overflow-hidden rounded-2xl border border-border bg-surface-raised p-1.5 shadow-floating"
            >
              <div class="max-h-56 overflow-y-auto">
                <For
                  each={filtered()}
                  fallback={<p class="px-3 py-2 text-xs text-ink-subtle">No matches</p>}
                >
                  {(opt, i) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={props.value === opt.value}
                      class={cx(
                        "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition",
                        i() === active() || props.value === opt.value ? "bg-accent-soft text-ink" : "text-ink hover:bg-bg",
                      )}
                      onMouseEnter={() => setActive(i())}
                      onClick={() => commit(opt)}
                    >
                      <span class="font-medium">{opt.label}</span>
                      <Show when={opt.hint}>
                        <span class="text-xs text-ink-subtle">{opt.hint}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Transition>
      </div>
      <Show when={props.hint}>
        <span class="text-xs text-ink-subtle">{props.hint}</span>
      </Show>
    </label>
  );
}
