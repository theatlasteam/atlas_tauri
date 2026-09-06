import { Show } from "solid-js";
import { cx } from "./lib/cx";

export default function Progress(props: {
  value: number;
  class?: string;
  label?: string;
}) {
  const pct = () => Math.max(0, Math.min(100, props.value));
  const rest = () => 100 - pct();

  return (
    <div class={cx("flex flex-col gap-1.5", props.class)}>
      <Show when={props.label}>
        <div class="flex justify-between text-xs text-ink-muted">
          <span>{props.label}</span>
          <span class="tabular-nums">{Math.round(pct())}%</span>
        </div>
      </Show>
      <div
        class="flex h-3.5 w-full gap-1"
        role="progressbar"
        aria-valuenow={pct()}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <Show when={pct() > 0}>
          <div class="min-w-0 rounded-[3px] bg-accent" style={{ "flex-grow": pct(), "flex-basis": "0px" }} />
        </Show>
        <Show when={rest() > 0}>
          <div class="min-w-0 rounded-[3px] bg-border" style={{ "flex-grow": rest(), "flex-basis": "0px" }} />
        </Show>
      </div>
    </div>
  );
}
