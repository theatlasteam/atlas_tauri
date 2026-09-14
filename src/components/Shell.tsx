import { createEffect, Show } from "solid-js";
import { useBeforeLeave, useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import BottomNav from "./BottomNav";
import SideNav from "./SideNav";
import CallOverlay from "./CallOverlay";
import ChatView from "../screens/ChatView";
import NoChatSelected from "./NoChatSelected";
import { ToastHost } from "../plugins/toasts";
import { bindNavigate } from "../plugins/nav";
import { emitPluginEvent } from "../plugins/runtime";
import { getNavDirection, withViewTransition } from "../lib/pageTransition";
import { useIsDesktopLayout } from "../lib/platform";
import { lastOpenChatId, setLastOpenChatId } from "../store/chats";

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

  const showPinnedChat = () => {
    if (!isDesktop()) return false;
    const p = routePath();
    return !(p.startsWith("/compass") || p.startsWith("/spaces") || p.startsWith("/user/"));
  };

  const pinnedChatId = () => {
    const match = /^\/chat\/([^/]+)/.exec(routePath());
    if (match) return decodeURIComponent(match[1]);
    return lastOpenChatId();
  };

  let lastChat: string | null = null;
  createEffect(() => {
    const match = /^\/chat\/([^/]+)/.exec(routePath());
    const chatId = match ? decodeURIComponent(match[1]) : null;
    if (chatId) setLastOpenChatId(chatId);
    if (chatId && chatId !== lastChat) emitPluginEvent("chatOpened", { chatId });
    else if (!chatId && lastChat && !showPinnedChat()) emitPluginEvent("chatClosed", { chatId: lastChat });
    lastChat = chatId;
  });

  useBeforeLeave((e) => {
    if (isDesktop()) return;
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
      <div
        class="min-h-0 min-w-0"
        classList={{
          "vt-page": !isDesktop(),
          "flex-1": !showPinnedChat(),
          "w-[min(360px,38vw)] min-w-[280px] shrink-0 border-r border-border": showPinnedChat(),
        }}
      >
        {props.children}
      </div>
      <Show when={showPinnedChat()}>
        <div class="min-h-0 min-w-0 flex-1">
          <Show when={pinnedChatId()} fallback={<NoChatSelected />}>
            <ChatView />
          </Show>
        </div>
      </Show>
      <Show when={showBottomNav()}>
        <BottomNav />
      </Show>
      <CallOverlay />
      <ToastHost />
    </div>
  );
}
