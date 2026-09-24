import { For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { chatsState } from "../store/chats";
import { calls } from "../store/calls";
import type { Chat } from "../data/types";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import ConnectionBanner from "../components/ConnectionBanner";
import { formatRelativeTime } from "../lib/time";
import { t } from "../lib/i18n";
import { PhoneIcon, VideoIcon } from "../icons";
import { IconButton } from "@atlas/ui";
import AnimatedNavIcon from "../components/AnimatedNavIcon";
import { openNativeOrNavigate } from "../lib/mobileWindows";

function isCallPreview(text: string) {
  return /call/i.test(text);
}

function start(chat: Chat, media: "audio" | "video") {
  if (!chat.peerUserId) return;
  void calls.startCall(
    {
      id: chat.peerUserId,
      name: chat.name,
      avatarColor: chat.avatarColor,
      avatarInitial: chat.avatarInitial,
      hasAvatar: chat.peerHasAvatar,
    },
    media,
  );
}

function CallRow(props: { chat: Chat; recent?: boolean }) {
  const navigate = useNavigate();
  return (
    <div class="flex items-center gap-3 px-5 py-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => void openNativeOrNavigate(navigate, `/chat/${props.chat.id}`)}
      >
        <Avatar
          userId={props.chat.peerUserId}
          color={props.chat.avatarColor}
          initial={props.chat.avatarInitial}
          hasPhoto={props.chat.peerHasAvatar}
          size={48}
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{props.chat.name}</span>
          <span class="block truncate text-sm text-ink-subtle">
            {props.recent
              ? `${props.chat.lastMessage}${props.chat.lastMessageAt ? ` · ${formatRelativeTime(props.chat.lastMessageAt)}` : ""}`
              : props.chat.online
                ? t("calls.online")
                : t("calls.tapToCall")}
          </span>
        </span>
      </button>
      <IconButton ariaLabel={t("calls.voiceAria")} onClick={() => start(props.chat, "audio")}>
        <PhoneIcon size={20} />
      </IconButton>
      <IconButton ariaLabel={t("calls.videoAria")} onClick={() => start(props.chat, "video")}>
        <VideoIcon size={20} />
      </IconButton>
    </div>
  );
}

export default function Calls() {
  const dms = () =>
    chatsState.chats.filter((c) => c.kind === "dm" && c.peerUserId && !c.peerIsBot && !c.blockedByMe);
  const recents = () => dms().filter((c) => isCallPreview(c.lastMessage));
  const people = () => dms().filter((c) => !isCallPreview(c.lastMessage));

  return (
    <div class="flex h-full flex-col">
      <div class="shrink-0 border-b border-border bg-appbar">
        <header class="flex items-center justify-between px-5 pb-3 pt-[max(var(--safe-top),1.5rem)]">
          <h1 class="font-heading text-2xl font-bold">{t("calls.title")}</h1>
        </header>
        <ConnectionBanner />
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pb-28">
        <Show
          when={dms().length > 0}
          fallback={
            <EmptyState
              icon={(p) => <AnimatedNavIcon name="calls" size={p.size} />}
              title={t("calls.emptyTitle")}
              subtitle={t("calls.emptySubtitle")}
            />
          }
        >
          <Show when={recents().length > 0}>
            <h2 class="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t("calls.recents")}
            </h2>
            <For each={recents()}>{(chat) => <CallRow chat={chat} recent />}</For>
          </Show>
          <Show when={people().length > 0}>
            <h2 class="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t("calls.people")}
            </h2>
            <For each={people()}>{(chat) => <CallRow chat={chat} />}</For>
          </Show>
        </Show>
      </div>
    </div>
  );
}
