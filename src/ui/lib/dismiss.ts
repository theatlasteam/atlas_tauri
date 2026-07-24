import { createEffect, onCleanup } from "solid-js";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// solid-transition-group defers its own enter-class bookkeeping by two animation
// frames (see its `nextFrame` helper) to play nicely with Firefox; mirroring that
// here avoids racing the trap's initial focus against the transition's DOM commit.
function nextFrame(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Closes when a pointerdown lands outside every given element. */
export function useClickOutside(
  refs: Array<() => HTMLElement | undefined | null>,
  onOutside: () => void,
  active: () => boolean,
) {
  createEffect(() => {
    if (!active()) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      const inside = refs.some((ref) => ref()?.contains(target));
      if (!inside) onOutside();
    };
    // Deferred so the same pointerdown/click that opened the popover doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener("pointerdown", handler), 0);
    onCleanup(() => {
      window.clearTimeout(id);
      document.removeEventListener("pointerdown", handler);
    });
  });
}

export function useEscapeKey(onEscape: () => void, active: () => boolean) {
  createEffect(() => {
    if (!active()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    onCleanup(() => document.removeEventListener("keydown", handler));
  });
}

/** Traps Tab focus inside the container while active, restores focus to the previously focused element on close. */
export function useFocusTrap(containerRef: () => HTMLElement | undefined, active: () => boolean) {
  createEffect(() => {
    if (!active()) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => {
      const container = containerRef();
      return container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
    };

    nextFrame(() => {
      focusables()[0]?.focus() ?? containerRef()?.focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    });
  });
}
