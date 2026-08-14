// Minimal navigation bridge for the plugin SDK. Solid Router's useNavigate is
// a hook, so a plugin context (plain object, no hooks) can't call it directly.
// Shell binds its navigate() here once; the SDK calls pluginNavigate().

type NavigateFn = (to: string) => void;

let navigateFn: NavigateFn | null = null;

export function bindNavigate(fn: NavigateFn): void {
  navigateFn = fn;
}

export function pluginNavigate(to: string): void {
  navigateFn?.(to);
}
