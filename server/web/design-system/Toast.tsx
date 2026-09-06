import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Show } from "solid-js";
import { Transition } from "solid-transition-group";
import { cx } from "./lib/cx";

export default function Toast(props: {
  open: boolean;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <Portal>
      <Transition name="toast">
        <Show when={props.open}>
          <div
            class={cx(
              "fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink shadow-floating",
              props.class,
            )}
            role="status"
          >
            {props.children}
          </div>
        </Show>
      </Transition>
    </Portal>
  );
}
