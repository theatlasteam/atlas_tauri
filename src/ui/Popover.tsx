import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Transition } from "solid-transition-group";
import { useClickOutside, useEscapeKey } from "./lib/dismiss";
import { computePosition, type Placement } from "./lib/position";

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element the floating content is positioned against. */
  anchorRef: () => HTMLElement | undefined | null;
  placement?: Placement;
  class?: string;
  children: JSX.Element;
}

/**
 * Generic floating-panel primitive: positions `children` next to `anchorRef`,
 * closes on outside click / Escape, animates in/out. Menu and Picker build on this.
 */
export default function Popover(props: PopoverProps) {
  let contentRef: HTMLDivElement | undefined;
  const [style, setStyle] = createSignal<JSX.CSSProperties>({ top: "0px", left: "0px", visibility: "hidden" });

  const reposition = () => {
    const anchor = props.anchorRef();
    if (!anchor || !contentRef) return;
    const { top, left } = computePosition(anchor, contentRef, props.placement ?? "bottom-start");
    setStyle({ top: `${top}px`, left: `${left}px`, visibility: "visible" });
  };

  createEffect(() => {
    if (props.open) queueMicrotask(reposition);
  });

  createEffect(() => {
    if (!props.open) return;
    const onViewportChange = () => reposition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    onCleanup(() => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    });
  });

  useClickOutside([() => contentRef, props.anchorRef], () => props.onOpenChange(false), () => props.open);
  useEscapeKey(() => props.onOpenChange(false), () => props.open);

  return (
    <Portal>
      <Transition name="pop">
        <Show when={props.open}>
          <div ref={contentRef} class={`fixed z-50 ${props.class ?? ""}`} style={style()}>
            {props.children}
          </div>
        </Show>
      </Transition>
    </Portal>
  );
}
