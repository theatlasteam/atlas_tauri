import { createEffect, onCleanup, type JSX } from "solid-js";
import Popover, { type PopoverProps } from "./Popover";

export function Menu(props: PopoverProps) {
  let listRef: HTMLDivElement | undefined;

  const items = () =>
    listRef ? Array.from(listRef.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')) : [];

  createEffect(() => {
    if (!props.open) return;
    queueMicrotask(() => items()[0]?.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      const els = items();
      if (els.length === 0) return;
      const index = els.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        els[(index + 1 + els.length) % els.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        els[(index - 1 + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <Popover {...props}>
      <div
        ref={listRef}
        role="menu"
        class="min-w-[10rem] rounded-2xl border border-border bg-surface-raised p-1.5 shadow-floating focus:outline-none"
      >
        {props.children}
      </div>
    </Popover>
  );
}

export function MenuItem(props: {
  onSelect: () => void;
  disabled?: boolean;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={props.disabled}
      onClick={props.onSelect}
      class={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors duration-100 hover:bg-accent-soft focus:bg-accent-soft focus:outline-none disabled:opacity-40 ${props.class ?? ""}`}
    >
      {props.children}
    </button>
  );
}
