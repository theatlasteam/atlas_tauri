import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Transition } from "solid-transition-group";
import { useEscapeKey, useFocusTrap } from "./lib/dismiss";
import { renderSlotComponent, slotComponent } from "../plugins/ui-slots";

export default function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: JSX.Element;
}) {
  let contentRef: HTMLDivElement | undefined;

  useEscapeKey(() => props.onOpenChange(false), () => props.open);
  useFocusTrap(() => contentRef, () => props.open);

  createEffect(() => {
    if (!props.open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
    });
  });

  // A plugin may replace the dialog's presentation entirely via the
  // `dialog` UI slot (e.g. force a centered modal instead of the bottom
  // sheet on mobile). The plugin component owns its own backdrop/positioning
  // and receives the same { title, open, onOpenChange, children }.
  const plugin = () => slotComponent("dialog");

  const pluginComp = () =>
    plugin()
      ? renderSlotComponent(plugin()!, {
          get title() {
            return props.title;
          },
          get open() {
            return props.open;
          },
          get onOpenChange() {
            return props.onOpenChange;
          },
          get children() {
            return props.children;
          },
        })
      : undefined;

  return (
    <Portal>
      <Show when={props.open}>
        <Show when={plugin()} fallback={<></>}>
          {pluginComp()}
        </Show>
        <Show when={!plugin()}>
          <Transition name="fade">
            <Show when={props.open}>
              <div class="fixed inset-0 z-40 bg-black/40" onClick={() => props.onOpenChange(false)} />
            </Show>
          </Transition>
          <Transition name="pop">
            <Show when={props.open}>
              <div class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center">
                <div
                  ref={contentRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={props.title}
                  tabIndex={-1}
                  class="pointer-events-auto w-full max-w-sm rounded-t-3xl border border-border bg-surface-raised p-5 shadow-floating outline-none sm:rounded-3xl"
                >
                  <h2 class="mb-4 text-lg font-semibold text-ink">{props.title}</h2>
                  {props.children}
                </div>
              </div>
            </Show>
          </Transition>
        </Show>
      </Show>
    </Portal>
  );
}
