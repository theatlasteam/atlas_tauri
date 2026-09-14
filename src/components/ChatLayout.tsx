import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import ChatList from "../screens/ChatList";
import ChatView from "../screens/ChatView";
import { useIsDesktopLayout } from "../lib/platform";

/**
 * Renders both `/` and `/chat/:id`. On mobile, only one of ChatList/ChatView
 * is mounted. On desktop the list lives here and the conversation is pinned
 * in Shell so Settings can replace this pane without closing the chat.
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
      <ChatList />
    </Show>
  );
}
