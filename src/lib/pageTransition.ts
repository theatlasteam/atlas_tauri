/**
 * Route hierarchy used only to pick a transition direction — not the router config.
 * Returns the logical "parent" of a route so we can tell a drill-down (forward)
 * from a pop-up-a-level (back) apart from a lateral tab switch (fade).
 */
function parentOf(path: string): string | null {
  if (path === "/" || path === "/settings" || path === "/profile") return null;
  if (path.startsWith("/chat/")) return "/";
  if (path.startsWith("/settings/")) return "/settings";
  return null;
}

export type NavDirection = "forward" | "back" | "fade";

export function getNavDirection(from: string, to: string): NavDirection {
  if (from === to) return "fade";
  if (parentOf(to) === from) return "forward";
  if (parentOf(from) === to) return "back";
  return "fade";
}

/** Runs `mutate` inside a View Transition when the browser supports it, otherwise just calls it. */
export function withViewTransition(direction: NavDirection, mutate: () => void) {
  const startViewTransition = document.startViewTransition?.bind(document);
  if (!startViewTransition) {
    mutate();
    return;
  }
  document.documentElement.dataset.navDirection = direction;
  startViewTransition(mutate);
}
