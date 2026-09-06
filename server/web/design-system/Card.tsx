import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cx } from "./lib/cx";

export default function Card(props: {
  children: JSX.Element;
  class?: string;
  padded?: boolean;
  title?: string;
  description?: string;
}) {
  return (
    <div
      class={cx(
        "rounded-2xl border border-border bg-surface-raised shadow-sm",
        props.padded !== false && "p-5",
        props.class,
      )}
    >
      <Show when={props.title}>
        <div class="mb-4">
          <h3 class="text-sm font-semibold text-ink">{props.title}</h3>
          <Show when={props.description}>
            <p class="mt-0.5 text-xs text-ink-muted">{props.description}</p>
          </Show>
        </div>
      </Show>
      {props.children}
    </div>
  );
}
