import { For, Show } from "solid-js";
import { cx } from "./lib/cx";

export type LimitBarItem = {
  value: number;
  label?: string;
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
      <div class="flex h-3.5 w-full gap-1">
        <For each={props.items}>
          {(item, i) => (
            <Show when={item.value > 0}>
              <div
                class={cx(
                  "min-w-0 rounded-[3px]",
                  item.class ?? (item.color ? undefined : FALLBACK[i() % FALLBACK.length]),
                )}
                style={{
                  "flex-grow": Math.max(0, item.value),
                  "flex-basis": "0px",
                  ...(item.color ? { background: item.color } : {}),
                }}
              />
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
