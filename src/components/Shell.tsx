import { createEffect, Show } from "solid-js";
import { useBeforeLeave, useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import CallOverlay from "./CallOverlay";
import { ToastHost } from "../plugins/toasts";
import { bindNavigate } from "../plugins/nav";
import { emitPluginEvent } from "../plugins/runtime";
import { getNavDirection, withViewTransition } from "../lib/pageTransition";
import { useIsDesktopLayout } from "../lib/platform";

export default function Shell(props: RouteSectionProps) {
  const isDesktop = useIsDesktopLayout();
  const location = useLocation();
  const navigate = useNavigate();
  // Router `base` is `/app` on the PWA, so pathname may be `/app/compass/:id`.
  const routePath = () => {
    const p = location.pathname.replace(/^\/app(?=\/|$)/, "");
    return p.startsWith("/") ? p : `/${p}`;
  };
  // On mobile, ChatView / Compass thread / a user profile own the bottom
  // chrome (composer). The tab bar would cover the input, so hide it there.
  const showBottomNav = () => {
    if (isDesktop()) return false;
    const p = routePath();
    return (
      !p.startsWith("/chat/") &&
      !p.startsWith("/user/") &&
      !p.startsWith("/compass/") &&
      !p.startsWith("/spaces/")
    );
  };

  // Plugin SDK: hand the router's navigate over (useNavigate can't be called
  // from a plain object context), and surface chat opens/closes as events.
  bindNavigate((to) => navigate(to));

  let lastChat: string | null = null;
  createEffect(() => {
    const match = /^\/chat\/([^/]+)/.exec(location.pathname);
    const chatId = match ? decodeURIComponent(match[1]) : null;
    if (chatId && chatId !== lastChat) emitPluginEvent("chatOpened", { chatId });
    else if (!chatId && lastChat) emitPluginEvent("chatClosed", { chatId: lastChat });
    lastChat = chatId;
  });

  useBeforeLeave((e) => {
    if (typeof e.to !== "string" || typeof document.startViewTransition !== "function") return;
    // Tab-bar switches must stay live: View Transitions snapshot `.vt-nav` and
    // freeze it, which kills the icon animations.
    const strip = (p: string) => p.replace(/^\/app(?=\/|$)/, "") || "/";
    const from = strip(e.from.pathname);
    const to = strip(e.to);
    const tab = (p: string) =>
      p === "/" || p === "/calls" || p === "/settings" || p === "/profile";
    if (tab(from) && tab(to)) return;
    e.preventDefault();
    const direction = getNavDirection(from, to);
    withViewTransition(direction, () => e.retry(true));
  });

  return (
    <div
      class="relative flex h-full w-full overflow-hidden bg-bg pl-[var(--safe-left)] pr-[var(--safe-right)] text-ink"
      classList={{ "flex-col": !isDesktop(), "flex-row": isDesktop() }}
    >
      <Show when={isDesktop()}>
        <SideNav />
      </Show>
      <div class="vt-page min-h-0 min-w-0 flex-1">{props.children}</div>
      <Show when={showBottomNav()}>
        <BottomNav />
      </Show>
      <CallOverlay />
      <ToastHost />
    </div>
  );
}
