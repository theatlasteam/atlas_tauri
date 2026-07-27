import { createSignal, For, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { chatsState, typingLabel } from "../store/chats";
import Avatar from "../components/Avatar";
import AnimatedList from "../ui/AnimatedList";
import EmptyState from "../components/EmptyState";
import ConnectionBanner from "../components/ConnectionBanner";
import MessageSearchDialog from "../components/MessageSearchDialog";
import { ChatListSkeleton } from "../components/Skeleton";
import VerifiedBadge from "../components/VerifiedBadge";
import { formatRelativeTime } from "../lib/time";
import { t } from "../lib/i18n";
import { BellSlashIcon, ChatIcon, PlusIcon, SearchIcon } from "../icons";

export default function ChatList() {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [activeFolder, setActiveFolder] = createSignal("all");
  const [searchOpen, setSearchOpen] = createSignal(false);

  const folderTabs = () => [
    { id: "all", name: t("chatList.all") },
    { id: "unread", name: t("chatList.unread") },
    ...chatsState.folders,
  ];

  const visibleChats = () => {
    const folder = activeFolder();
    if (folder === "all") return chatsState.chats;
    if (folder === "unread") return chatsState.chats.filter((c) => c.unreadCount > 0);
    return chatsState.chats.filter((c) => c.folderIds.includes(folder));
  };

  // Shared with the chat header, which used to be the only place that named
  // who was typing in a group — the list flatly said "typing…" whoever it was.
  const typingLine = (chatId: string) => typingLabel(chatId);

  const headerBtn =
    "flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface";

  return (
    <div class="flex h-full flex-col">
      <div class="shrink-0 border-b border-border bg-appbar">
      <header class="flex items-center justify-between px-5 pb-1 pt-[max(var(--safe-top),1.5rem)]">
        <h1 class="font-heading text-2xl font-bold">{t("chatList.title")}</h1>
        <div class="flex items-center gap-1">
          <button type="button" onClick={() => setSearchOpen(true)} class={headerBtn} aria-label={t("chatList.searchAria")}>
            <SearchIcon size={21} />
          </button>
          <button type="button" onClick={() => navigate("/new-chat")} class={headerBtn} aria-label={t("chatList.newChatAria")}>
            <PlusIcon size={21} />
          </button>
        </div>
      </header>

      <ConnectionBanner />

      <div class="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-5 py-3">
        <For each={folderTabs()}>
          {(folder) => {
            const active = () => activeFolder() === folder.id;
            return (
              <button
                type="button"
                onClick={() => setActiveFolder(folder.id)}
                class="flex min-h-11 shrink-0 items-center rounded-pill border px-3.5 py-1.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95"
                classList={{
                  "border-accent bg-accent text-accent-ink": active(),
                  "border-border bg-surface text-ink-muted hover:border-ink-subtle/50 hover:text-ink": !active(),
                }}
              >
                {folder.name}
              </button>
            );
          }}
        </For>
      </div>
      </div>

      <div class="flex-1 overflow-y-auto overscroll-contain pb-28">
        <Show when={chatsState.loaded} fallback={<ChatListSkeleton />}>
          <Show
            when={visibleChats().length > 0}
            fallback={
              <EmptyState
                icon={ChatIcon}
                title={activeFolder() === "all" ? t("chatList.noChatsTitle") : t("chatList.noFolderChatsTitle")}
                subtitle={
                  activeFolder() === "all"
                    ? t("chatList.noChatsSubtitle")
                    : t("chatList.noFolderChatsSubtitle")
                }
              />
            }
          >
          <ul class="relative flex flex-col px-3">
            <AnimatedList>
              <For each={visibleChats()}>
                {(chat) => (
                  <li>
                    <A
                      href={`/chat/${chat.id}`}
                      class="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors duration-150 active:bg-surface"
                      classList={{
                        "bg-accent-soft/70": params.id === chat.id,
                        "hover:bg-surface": params.id !== chat.id,
                      }}
                    >
                      <Avatar
                        color={chat.avatarColor}
                        initial={chat.avatarInitial}
                        online={chat.online}
                        userId={chat.peerUserId}
                        hasPhoto={chat.peerHasAvatar}
                      />
                      <div class="min-w-0 flex-1">
                        <div class="flex items-baseline justify-between gap-2">
                          <p class="flex min-w-0 items-center gap-1.5 truncate font-semibold text-ink">
                            <span class="truncate">{chat.name}</span>
                            <Show when={chat.peerVerified}>
                              <VerifiedBadge size={14} name={chat.name} />
                            </Show>
                            <Show when={chat.muted}>
                              <BellSlashIcon size={14} class="shrink-0 text-ink-subtle" />
                            </Show>
                          </p>
                          <Show when={chat.lastMessageAt}>
                            <span class="shrink-0 text-xs text-ink-subtle">{formatRelativeTime(chat.lastMessageAt)}</span>
                          </Show>
                        </div>
                        <div class="flex items-center justify-between gap-2">
                          <p
                            class="truncate text-sm"
                            classList={{
                              "text-accent animate-pulse": !!typingLine(chat.id),
                              "text-ink-muted": !typingLine(chat.id),
                            }}
                          >
                            {typingLine(chat.id) ?? (chat.lastMessage || t("chatList.noMessagesYet"))}
                          </p>
                          <Show when={chat.unreadCount > 0}>
                            <span class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-accent px-1.5 text-xs font-semibold text-accent-ink">
                              {chat.unreadCount}
                            </span>
                          </Show>
                        </div>
                      </div>
                    </A>
                  </li>
                )}
              </For>
            </AnimatedList>
          </ul>
          </Show>
        </Show>
      </div>

      <MessageSearchDialog open={searchOpen()} onOpenChange={setSearchOpen} />
    </div>
  );
}
