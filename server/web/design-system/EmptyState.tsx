import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cx } from "./lib/cx";

export default function EmptyState(props: {
  icon?: JSX.Element;
  title: string;
  subtitle?: string;
  action?: JSX.Element;
  class?: string;
}) {
  return (
    <div class={cx("flex flex-col items-center justify-center gap-3 px-8 py-12 text-center", props.class)}>
      <Show when={props.icon}>
        <div class="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">{props.icon}</div>
      </Show>
      <div>
        <p class="font-medium text-ink">{props.title}</p>
        <Show when={props.subtitle}>
          <p class="mt-1 max-w-xs text-sm text-ink-subtle">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={props.action}>{props.action}</Show>
    </div>
  );
}
