import type { JSX } from "solid-js";
import { For, Show, splitProps } from "solid-js";
import { cx } from "./lib/cx";

export type SelectOption = { value: string; label: string };

export default function Select(
  props: {
    label?: string;
    hint?: string;
    class?: string;
    options: SelectOption[];
  } & JSX.SelectHTMLAttributes<HTMLSelectElement>,
) {
  const [local, rest] = splitProps(props, ["label", "hint", "class", "options"]);
  return (
    <label class={cx("flex flex-col gap-1.5 text-sm", local.class)}>
      <Show when={local.label}>
        <span class="font-medium text-ink">{local.label}</span>
      </Show>
      <span class="relative block">
      <select
        class="w-full appearance-none rounded-xl border border-border bg-surface px-3 py-2 pr-9 text-ink outline-none transition focus:border-accent"
        {...rest}
      >
        <For each={local.options}>{(opt) => <option value={opt.value}>{opt.label}</option>}</For>
      </select>
      <svg aria-hidden="true" viewBox="0 0 16 16" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" fill="none">
        <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      </span>
      <Show when={local.hint}>
        <span class="text-xs text-ink-subtle">{local.hint}</span>
      </Show>
    </label>
  );
}
