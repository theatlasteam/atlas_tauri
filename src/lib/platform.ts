import { createSignal, onCleanup } from "solid-js";

/** True when running inside a Tauri webview (desktop or mobile), false in a plain browser. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function detectMobileUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** True on a phone/tablet-class platform (native mobile app or a mobile browser UA). */
export function isMobilePlatform(): boolean {
  return detectMobileUA();
}

/**
 * Reactive viewport-width breakpoint — this is what should drive the chat
 * list/detail split, independent of `isMobilePlatform()` (a wide browser
 * window on a phone-detecting UA should still get the mobile layout, and a
 * narrow window on desktop should still get the single-pane layout).
 */
export function useIsDesktopLayout(breakpoint = 900) {
  const query = `(min-width: ${breakpoint}px)`;
  const mql = typeof window !== "undefined" ? window.matchMedia(query) : undefined;
  const [matches, setMatches] = createSignal(mql?.matches ?? false);

  if (mql) {
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    onCleanup(() => mql.removeEventListener("change", handler));
  }

  return matches;
}
