import { createEffect, onMount, Show } from "solid-js";
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
import { isMobilePlatform } from "../lib/platform";
import { isTauri } from "../lib/platform";
import {
  closeCurrentWindow,
  isMainWindow,
  isPwa,
  isPushRoute,
  isTabRoot,
  multiWindowSync,
  openNativeOrNavigate,
} from "../lib/mobileWindows";
import { bootMark } from "../lib/bootPerf";
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
      !p.startsWith("/minds/") &&
      !p.startsWith("/spaces/") &&
      !p.startsWith("/canvas/")
    );
  };

  // Plugin SDK: hand the router's navigate over (useNavigate can't be called
  // from a plain object context), and surface chat opens/closes as events.
  bindNavigate((to) => navigate(to));
  onMount(() => bootMark("shell mounted"));

  // Native multi-window link interception (mobile Tauri only; desktop/PWA
  // never reach here). Declarative `<A href>` links bypass navigate(), so a
  // single bubble-phase listener on the shell routes them before the
  // router's document-level handler: in the main window, pushes open a new
  // native activity; in a secondary, tab-root links ("back out") close the
  // activity instead of stacking UI inside it.
  const interceptNativeLinks = (e: MouseEvent) => {
    if (!isTauri() || !isMobilePlatform() || isPwa()) return;
    // Gate unresolved/unsupported → leave the SPA default alone.
    if (multiWindowSync() !== true) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as Element | null;
    const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !href.startsWith("/") || href.startsWith("//")) return;
    // Only divert when the destination actually changes windowing: pushes
    // out of the main window, tab-roots out of a secondary. Everything else
    // falls through to the router untouched (no double navigation).
    if (isMainWindow()) {
      if (!isPushRoute(href)) return;
    } else if (!isTabRoot(href)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    void (async () => {
      if (isMainWindow()) {
        await openNativeOrNavigate((to) => navigate(to as string), href);
      } else if (!(await closeCurrentWindow())) {
        navigate(href);
      }
    })();
  };

  const showPinnedChat = () => {
    if (!isDesktop()) return false;
    const p = routePath();
    return !(
      p.startsWith("/compass") ||
      p.startsWith("/minds") ||
      p.startsWith("/spaces") ||
      p.startsWith("/user/") ||
      p.startsWith("/canvas")
    );
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
      onClick={interceptNativeLinks}
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
