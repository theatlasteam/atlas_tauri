import { Show } from "solid-js";
import { useBeforeLeave, useLocation, type RouteSectionProps } from "@solidjs/router";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import CallOverlay from "./CallOverlay";
import { getNavDirection, withViewTransition } from "../lib/pageTransition";
import { useIsDesktopLayout } from "../lib/platform";

export default function Shell(props: RouteSectionProps) {
  const isDesktop = useIsDesktopLayout();
  const location = useLocation();
  // On mobile, ChatView owns the full screen with its own bottom input bar —
  // the floating nav would overlap it, so it only shows outside an open chat.
  // A user's profile (reached by tapping a DM's appbar) is the same kind of
  // drill-down push, not a tab destination, so it's excluded too.
  const showBottomNav = () =>
    !isDesktop() &&
    !location.pathname.startsWith("/chat/") &&
    !location.pathname.startsWith("/user/") &&
    !location.pathname.startsWith("/compass/");

  useBeforeLeave((e) => {
    if (typeof e.to !== "string" || typeof document.startViewTransition !== "function") return;
    e.preventDefault();
    const direction = getNavDirection(e.from.pathname, e.to);
    withViewTransition(direction, () => e.retry(true));
  });

  return (
    <div class="relative flex h-full w-full overflow-hidden bg-bg pl-[var(--safe-left)] pr-[var(--safe-right)] text-ink">
      <Show when={isDesktop()}>
        <SideNav />
      </Show>
      <div class="vt-page h-full min-w-0 flex-1">{props.children}</div>
      <Show when={showBottomNav()}>
        <BottomNav />
      </Show>
      <CallOverlay />
    </div>
  );
}
