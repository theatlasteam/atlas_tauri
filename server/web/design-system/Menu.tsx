import type { JSX } from "solid-js";
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { Transition } from "solid-transition-group";
import { cx } from "./lib/cx";

export type MenuItemDef = {
  id: string;
  label: string;
  icon?: JSX.Element;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
};

const MARGIN = 8;
const GUTTER = 6;

export default function Menu(props: {
  trigger: JSX.Element;
  items: MenuItemDef[];
  class?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = createSignal(false);
  const [pos, setPos] = createSignal({ top: 0, left: 0, origin: "top" as "top" | "bottom" });
  let root: HTMLDivElement | undefined;
  let panel: HTMLDivElement | undefined;

  function place() {
    if (!root || !panel) return;
    const a = root.getBoundingClientRect();
    const c = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxH = Math.min(c.height, vh - MARGIN * 2);

    let top = a.bottom + GUTTER;
    let origin: "top" | "bottom" = "top";
    if (top + maxH > vh - MARGIN && a.top - GUTTER - maxH >= MARGIN) {
      top = a.top - GUTTER - maxH;
      origin = "bottom";
    }
    top = Math.min(Math.max(top, MARGIN), vh - maxH - MARGIN);

    let left = (props.align ?? "right") === "right" ? a.right - c.width : a.left;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - c.width - MARGIN));

    setPos({ top, left, origin });
  }

  createEffect(() => {
    if (!open()) return;
    queueMicrotask(place);
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    onCleanup(() => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    });
  });

  onMount(() => {
    const onDoc = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node) && panel && !panel.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <div class={cx("relative inline-flex", props.class)} ref={(el) => (root = el)}>
      <div onClick={() => setOpen((v) => !v)}>{props.trigger}</div>
      <Portal>
        <Transition name="pop">
          <Show when={open()}>
            <div
              ref={(el) => {
                panel = el;
                if (el) queueMicrotask(place);
              }}
              role="menu"
              class="fixed z-50 min-w-[11rem] max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-border bg-surface-raised p-1.5 shadow-floating"
              style={{
                top: `${pos().top}px`,
                left: `${pos().left}px`,
                "max-height": `calc(100vh - ${MARGIN * 2}px)`,
                "transform-origin": pos().origin === "top" ? "top center" : "bottom center",
              }}
            >
              <For each={props.items}>
                {(item) => (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    class={cx(
                      "flex w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent-soft disabled:opacity-40",
                      item.danger ? "text-red-600" : "text-ink",
                    )}
                    onClick={() => {
                      item.onSelect?.();
                      setOpen(false);
                    }}
                  >
                    <span class="flex min-w-0 items-center gap-2.5">
                      <Show when={item.icon}>
                        <span class="grid h-5 w-5 shrink-0 place-items-center text-current opacity-80">{item.icon}</span>
                      </Show>
                      <span class="min-w-0 truncate">{item.label}</span>
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </Transition>
      </Portal>
    </div>
  );
}
