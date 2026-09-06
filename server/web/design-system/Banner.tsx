import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cx } from "./lib/cx";

export default function Banner(props: {
  children: JSX.Element;
  action?: JSX.Element;
  onDismiss?: () => void;
  class?: string;
}) {
  return (
    <div
      class={cx(
        "flex items-center gap-3 border-b border-border bg-accent-soft px-4 py-2.5 text-sm text-accent",
        props.class,
      )}
    >
      <div class="min-w-0 flex-1">{props.children}</div>
      {props.action}
      <Show when={props.onDismiss}>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded-full hover:bg-bg/40"
          aria-label="Dismiss"
          onClick={props.onDismiss}
        >
          ×
        </button>
      </Show>
    </div>
  );
}
