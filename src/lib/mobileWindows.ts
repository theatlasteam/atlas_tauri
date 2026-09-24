// Native multi-window navigation (mobile Tauri builds only).
//
// On phones each pushed screen opens in its own Android Activity (system
// back button/gesture pops back to the previous screen for free) or iOS
// scene. On large screens (tablets/foldables, Android 12L+/API 32+) the
// SecondaryActivity embeds side-by-side with MainActivity.
//
// Everywhere else — desktop, PWA (`/app`), plain web — this is a transparent
// pass-through to the SPA router, so call sites don't need platform forks.
//
// Separate-JS-context caveat: each native window boots the full App (own
// Solid stores + socket; Rust E2EE/secret state is shared). Use
// emitCrossWindow/onCrossWindow for anything that must propagate instantly
// instead of arriving via the next socket resync.

import { isAndroid, isMobilePlatform, isTauri } from "./platform";

/** Android Activity class hosting every pushed window (see AndroidManifest). */
export const SECONDARY_ACTIVITY = "SecondaryActivity";

type NavigateFn = {
  (to: string, options?: Record<string, unknown>): void;
  (delta: number): void;
};

function stripAppBase(path: string): string {
  const p = path.replace(/^\/app(?=\/|$)/, "");
  return p.startsWith("/") ? p : `/${p}`;
}

/** Tab roots live in the main window; they never spawn a native window. */
export function isTabRoot(path: string): boolean {
  const p = stripAppBase(path.split("?")[0].split("#")[0]);
  return (
    p === "/" ||
    p === "/calls" ||
    p === "/settings" ||
    p === "/profile" ||
    p === "/compass" ||
    p === "/minds"
  );
}

/**
 * Push routes open natively on mobile: chat threads, user profiles, settings
 * sub-pages, compass/mind threads, spaces, canvas, and the new-chat sheet.
 */
export function isPushRoute(path: string): boolean {
  const p = stripAppBase(path.split("?")[0].split("#")[0]);
  if (isTabRoot(p)) return false;
  return (
    p.startsWith("/chat/") ||
    p.startsWith("/user/") ||
    p.startsWith("/new-chat") ||
    p.startsWith("/spaces/") ||
    p.startsWith("/canvas/") ||
    p.startsWith("/settings/") ||
    p.startsWith("/compass/") ||
    p.startsWith("/minds/")
  );
}

export function isPwa(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/app");
}

let multiWindowCache: boolean | null = null;

/**
 * Which native window this JS context runs in. Resolved once at boot
 * (see initWindowRole): secondaries keep their own SPA stack in place and
 * only the main window spawns new activities — otherwise every tap would
 * stack another activity.
 */
let windowRole: "unknown" | "main" | "secondary" = "unknown";

/** Call once at app boot; safe to call anywhere (desktop/PWA no-op). */
export function initWindowRole(): void {
  if (!isTauri() || typeof window === "undefined") return;
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => {
      windowRole = getCurrentWindow().label === "main" ? "main" : "secondary";
    })
    .catch(() => {});
  // Pre-warm the multi-window gate so link interception can decide
  // synchronously by the time the user first taps.
  void supportsMultiWindow().catch(() => {});
}

/** Sync role check for click interceptors. Unknown (not yet resolved, or
 *  desktop/web) behaves like main — plain SPA navigation. */
export function isMainWindow(): boolean {
  return windowRole !== "secondary";
}

/** Runtime gate: Android 12L (API 32)+ / iOS 13+. Cached after first check. */
export async function supportsMultiWindow(): Promise<boolean> {
  if (multiWindowCache !== null) return multiWindowCache;
  try {
    const { supportsMultipleWindows } = await import("@tauri-apps/api/app");
    multiWindowCache = await supportsMultipleWindows();
  } catch {
    multiWindowCache = false;
  }
  return multiWindowCache;
}

/**
 * Sync read of the cached gate for event handlers (which must decide
 * synchronously): `true` = intercept, anything else = leave SPA default.
 */
export function multiWindowSync(): boolean | null {
  return multiWindowCache;
}

/** Stable window label per route so re-opening focuses instead of stacking. */
export function labelForPath(path: string): string {
  const clean = stripAppBase(path.split("?")[0].split("#")[0]);
  const slug = clean
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `detail-${slug || "root"}`;
}

/**
 * Open a push route in a native window on mobile, else SPA-navigate.
 * Drop-in for `navigate(to)` at push call sites.
 */
export async function openNativeOrNavigate(navigate: NavigateFn, to: string): Promise<void> {
  // Secondaries navigate in place — they're already their own activity.
  if (!isMainWindow() || !isPushRoute(to) || !isTauri() || !isMobilePlatform() || isPwa()) {
    navigate(to);
    return;
  }
  if (!(await supportsMultiWindow())) {
    navigate(to);
    return;
  }
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = labelForPath(to);
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus().catch(() => {});
      return;
    }
    const options: Record<string, unknown> = { url: to };
    // iOS scenes are created implicitly; only Android needs an activity.
    if (isAndroid()) options.activityName = SECONDARY_ACTIVITY;
    const win = new WebviewWindow(label, options);
    // Creation failure (e.g. capability denied) falls back to SPA routing
    // so the destination still opens — just without the native back stack.
    win.once("tauri://error", () => navigate(to)).catch(() => {});
    await win.once("tauri://created", () => {}).catch(() => {});
  } catch {
    navigate(to);
  }
}

/** True when this JS context is running in a pushed native window. */
export async function isSecondaryWindow(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label !== "main";
  } catch {
    return false;
  }
}

/**
 * In-app back buttons on pushed windows: close the native activity/scene
 * (equivalent to the system back gesture) instead of popping SPA history,
 * which only has one entry there. Falls back to router history on main.
 */
export async function goBackOrClose(navigate: NavigateFn, fallback = "/"): Promise<void> {
  if (isTauri() && isMobilePlatform() && !isPwa() && (await isSecondaryWindow())) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().close();
      return;
    } catch {
      /* fall through to router */
    }
  }
  if (typeof window !== "undefined" && window.history.length > 1) navigate(-1);
  else navigate(fallback);
}

/** Close this native window (secondary only — the main window stays SPA). */
export async function closeCurrentWindow(): Promise<boolean> {
  if (!isTauri() || isMainWindow()) return false;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
    return true;
  } catch {
    return false;
  }
}

/** Fire-and-forget broadcast to every window (main + secondaries). */
export async function emitCrossWindow(event: string, payload?: unknown): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
  } catch {
    /* best-effort */
  }
}

/** Listen for cross-window broadcasts. Returns the unlisten function. */
export async function onCrossWindow<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => handler(e.payload));
}
