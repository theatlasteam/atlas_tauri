import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import ChatList from "../screens/ChatList";
import ChatView from "../screens/ChatView";
import NoChatSelected from "./NoChatSelected";
import { useIsDesktopLayout } from "../lib/platform";

/**
 * Renders both `/` and `/chat/:id`. On mobile, behaves like two separate
 * full-screen routes (only one of ChatList/ChatView mounted at a time). On
 * desktop, ChatList stays mounted as a sidebar while the detail pane swaps
 * between ChatView and a placeholder as `:id` changes.
 */
export default function ChatLayout() {
  const params = useParams<{ id?: string }>();
  const isDesktop = useIsDesktopLayout();

  return (
    <Show
      when={isDesktop()}
      fallback={
        <Show when={params.id} fallback={<ChatList />}>
          <ChatView />
        </Show>
      }
    >
      <div class="flex h-full">
        <div class="w-[360px] shrink-0 border-r border-border">
          <ChatList />
        </div>
        <div class="min-w-0 flex-1">
          <Show when={params.id} fallback={<NoChatSelected />}>
            <ChatView />
          </Show>
        </div>
      </div>
    </Show>
  );
}
