import { ChatIcon } from "../icons";

/** Detail-pane placeholder shown on desktop when no chat is selected in the sidebar. */
export default function NoChatSelected() {
  return (
    <div class="fade-in-up flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <ChatIcon size={30} />
      </div>
      <div>
        <p class="font-heading text-lg font-semibold text-ink">Select a conversation</p>
        <p class="mt-1 text-sm text-ink-subtle">Pick a chat from the list to start messaging.</p>
      </div>
    </div>
  );
}
