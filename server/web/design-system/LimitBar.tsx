import { For, Show } from "solid-js";
import { cx } from "./lib/cx";

export type LimitBarItem = {
  value: number;
  label?: string;
  /** Native tooltip, e.g. a date range on a status segment. */
  title?: string;
  /** Keeps a very short slice visible, e.g. "3px". */
  minWidth?: string;
  color?: string;
  class?: string;
};

const FALLBACK = ["bg-accent", "bg-ink", "bg-ink-muted"];

export default function LimitBar(props: {
  items: LimitBarItem[];
  max?: number;
  label?: string;
  class?: string;
}) {
  function sumValues() {
    return props.items.reduce((s, i) => s + Math.max(0, i.value), 0);
  }

  const cap = () => Math.max(props.max ?? 0, sumValues(), 1);
  const usedPct = () => Math.round((sumValues() / cap()) * 100);
  const rest = () => Math.max(0, cap() - sumValues());

  return (
    <div class={cx("flex flex-col gap-1.5", props.class)}>
      <Show when={props.label}>
        <div class="flex justify-between text-xs text-ink-muted">
          <span>{props.label}</span>
          <span class="tabular-nums">{usedPct()}%</span>
        </div>
      </Show>
      <div class="flex h-8 w-full items-center gap-1">
        <For each={props.items}>
          {(item, i) => (
            <Show when={item.value > 0}>
              <div
                class="group/seg relative flex h-full min-w-0 items-center"
                style={{
                  "flex-grow": Math.max(0, item.value),
                  "flex-basis": "0px",
                  ...(item.minWidth ? { "min-width": item.minWidth } : {}),
                }}
              >
                <div
                  class={cx(
                    "h-3.5 w-full rounded-[3px]",
                    item.class ?? (item.color ? undefined : FALLBACK[i() % FALLBACK.length]),
                  )}
                  style={item.color ? { background: item.color } : undefined}
                />
                <Show when={item.title}>
                  <span class="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-medium text-bg opacity-0 shadow-floating transition group-hover/seg:opacity-100">
                    {item.title}
                  </span>
                </Show>
              </div>
            </Show>
          )}
        </For>
        <Show when={rest() > 0}>
          <div class="min-w-0 rounded-[3px] bg-border" style={{ "flex-grow": rest(), "flex-basis": "0px" }} />
        </Show>
      </div>
      <Show when={props.items.some((i) => i.label)}>
        <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
          <For each={props.items}>
            {(item, i) => (
              <span class="inline-flex items-center gap-1.5">
                <span
                  class={cx(
                    "h-2 w-2 rounded-[2px]",
                    item.class ?? (item.color ? undefined : FALLBACK[i() % FALLBACK.length]),
                  )}
                  style={item.color ? { background: item.color } : undefined}
                />
                {item.label}
                <span class="tabular-nums text-ink-subtle">{item.value}</span>
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
