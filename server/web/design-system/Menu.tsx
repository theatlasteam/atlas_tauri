import type { JSX } from "solid-js";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { Transition } from "solid-transition-group";
import { cx } from "./lib/cx";

export type MenuItemDef = {
  id: string;
  label: string;
  icon?: JSX.Element;
  danger?: boolean;
  disabled?: boolean;
  section?: string;
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
  const [pos, setPos] = createSignal({ top: 0, left: 0, origin: "bottom" as "top" | "bottom" });
  let root: HTMLDivElement | undefined;
  let panel: HTMLDivElement | undefined;

  function place() {
    if (!root || !panel) return;
    const a = root.getBoundingClientRect();
    const c = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = c.height > 0 ? c.height : Math.min(280, vh - MARGIN * 2);
    const maxH = Math.min(h, vh - MARGIN * 2);

    const spaceBelow = vh - a.bottom - MARGIN;
    const spaceAbove = a.top - MARGIN;
    const preferUp = a.top > vh * 0.4 || spaceBelow < Math.min(160, maxH);

    let top: number;
    let origin: "top" | "bottom";
    if (preferUp && spaceAbove >= 80) {
      top = a.top - GUTTER - maxH;
      origin = "bottom";
    } else {
      top = a.bottom + GUTTER;
      origin = "top";
    }
    top = Math.min(Math.max(top, MARGIN), vh - maxH - MARGIN);

    let left = (props.align ?? "right") === "right" ? a.right - Math.max(c.width, 176) : a.left;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - Math.max(c.width, 176) - MARGIN));

    setPos({ top, left, origin });
  }

  function toggle(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  }

  // Click (not pointerdown): Chrome device-mode synthesizes a mouse click
  // after the touch, which would immediately re-toggle a pointerdown handler.

  createEffect(() => {
    if (!open()) return;
    const id = requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root?.contains(t) || panel?.contains(t)) return;
      setOpen(false);
    };
    const closeTimer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointer, true);
    }, 200);
    onCleanup(() => {
      cancelAnimationFrame(id);
      window.clearTimeout(closeTimer);
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      document.removeEventListener("pointerdown", onPointer, true);
    });
  });

  return (
    <div class={cx("relative inline-flex", props.class)} ref={(el) => (root = el)}>
      <div class="inline-flex" onClick={toggle}>
        {props.trigger}
      </div>
      <Portal>
        <Transition name="pop">
          <Show when={open()}>
            <div
              ref={(el) => {
                panel = el;
                if (el) requestAnimationFrame(place);
              }}
              role="menu"
              class="fixed z-[80] min-w-[11rem] max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-border bg-surface-raised p-1.5 shadow-floating"
              style={{
                top: `${pos().top}px`,
                left: `${pos().left}px`,
                "max-height": `calc(100vh - ${MARGIN * 2}px)`,
                "transform-origin": pos().origin === "top" ? "top center" : "bottom center",
              }}
            >
              <For each={props.items}>
                {(item, i) => (
                  <>
                    <Show when={item.section && item.section !== props.items[i() - 1]?.section}>
                      <p class="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                        {item.section}
                      </p>
                    </Show>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      class={cx(
                        "flex min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent-soft disabled:opacity-40",
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
                  </>
                )}
              </For>
            </div>
          </Show>
        </Transition>
      </Portal>
    </div>
  );
}
