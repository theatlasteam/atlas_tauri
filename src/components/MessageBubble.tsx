import { createResource, createSignal, For, Show } from "solid-js";
import { api } from "../data/api";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
import type { Chat, Message, User } from "../data/types";
import { formatBytes, formatClockTime } from "../lib/time";
import { session } from "../store/session";
import { messagesStore } from "../store/messages";
import {
  CheckIcon,
  ChecksIcon,
  DownloadIcon,
  LockIcon,
  PauseIcon,
  PhoneIcon,
  PhoneSlashIcon,
  PlayIcon,
  SpinnerIcon,
  VideoIcon,
} from "../icons";

// Object-URL cache so scrolling doesn't refetch attachment bytes.
const urlCache = new Map<string, Promise<string>>();
function attachmentUrl(id: string): Promise<string> {
  let cached = urlCache.get(id);
  if (!cached) {
    cached = api.fetchAttachmentUrl(id);
    cached.catch(() => urlCache.delete(id));
    urlCache.set(id, cached);
  }
  return cached;
}

function ImageAttachment(props: { id: string; width?: number | null; height?: number | null }) {
  const [url] = createResource(() => props.id, attachmentUrl);
  const ratio = () =>
  props.width && props.height ? `${props.width} / ${props.height}` : undefined;
  return (
    <Show
    when={url()}
    fallback={
      <div
      class="flex min-h-32 w-56 items-center justify-center rounded-xl bg-black/10"
      style={{ "aspect-ratio": ratio() }}
      >
      <SpinnerIcon size={20} class="animate-spin opacity-60" />
      </div>
    }
    >
    <img
    src={url()}
    alt=""
    class="max-h-80 w-full rounded-xl object-cover"
    style={{ "aspect-ratio": ratio() }}
    />
    </Show>
  );
}

function VoiceAttachment(props: { id: string; durationMs?: number | null }) {
  const [playing, setPlaying] = createSignal(false);
  let audio: HTMLAudioElement | undefined;

  const toggle = async () => {
    if (!audio) return;
    if (playing()) {
      audio.pause();
      return;
    }
    if (!audio.src) audio.src = await attachmentUrl(props.id);
    await audio.play();
  };

  const duration = () => {
    const secs = Math.round((props.durationMs ?? 0) / 1000);
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  };

  return (
    <button type="button" onClick={toggle} class="flex min-w-44 items-center gap-2.5 py-0.5">
    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/15">
    <Show when={playing()} fallback={<PlayIcon size={16} />}>
    <PauseIcon size={16} />
    </Show>
    </span>
    <span class="h-1 flex-1 rounded-full bg-current/20">
    <span class="block h-full w-0 rounded-full bg-current/50" />
    </span>
    <span class="shrink-0 text-xs tabular-nums opacity-70">{duration()}</span>
    <audio
    ref={audio}
    onPlay={() => setPlaying(true)}
    onPause={() => setPlaying(false)}
    onEnded={() => setPlaying(false)}
    />
    </button>
  );
}

function FileAttachment(props: { id: string; filename: string; sizeBytes: number }) {
  const download = async () => {
    const url = await attachmentUrl(props.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = props.filename || "file";
    a.click();
  };
  return (
    <button type="button" onClick={download} class="flex min-w-44 items-center gap-2.5 py-0.5 text-left">
    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/15">
    <DownloadIcon size={16} />
    </span>
    <span class="min-w-0 flex-1">
    <span class="block truncate text-sm">{props.filename || "File"}</span>
    <span class="block text-xs opacity-70">{formatBytes(props.sizeBytes)}</span>
    </span>
    </button>
  );
}

function CallLogBubble(props: { message: Message }) {
  const log = () => props.message.callLog!;
  const missed = () => log().outcome !== "completed";
  return (
    <div class="flex items-center gap-2.5 py-0.5">
    <span
    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
    classList={{ "bg-danger/15 text-danger": missed(), "bg-black/15": !missed() }}
    >
    <Show
    when={log().media === "video"}
    fallback={missed() ? <PhoneSlashIcon size={16} /> : <PhoneIcon size={16} />}
    >
    <VideoIcon size={16} />
    </Show>
    </span>
    <span class="text-sm">{props.message.text}</span>
    </div>
  );
}

export default function MessageBubble(props: {
  message: Message;
  chat: Chat | undefined;
  /** Resolved sender profile for group-chat bubbles (name + avatar). */
  author?: User;
  /** First/last message in a consecutive run from the same sender. */
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onReply: (message: Message) => void;
  onReactPick: (message: Message, anchor: HTMLElement) => void;
}) {
  const isFirst = () => props.isFirstInGroup ?? true;
  const isLast = () => props.isLastInGroup ?? true;
  const m = () => props.message;
  const mine = () => m().mine;
  const myId = () => session.user()?.id ?? "";
  const isGroupChat = () => props.chat?.kind === "group";

  /** ✓ sent, ✓✓ seen (DM only — peer's read cursor is a message id; UUIDv7
   * ordering makes string compare correct). */
  const receipt = () => {
    if (!mine() || m().failed) return null;
    if (m().pending) return "pending";
    const cursor = props.chat?.peerReadUpTo;
    return props.chat?.kind === "dm" && cursor && cursor >= m().id ? "read" : "sent";
  };

  let bubbleRef: HTMLDivElement | undefined;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  const startPress = () => {
    pressTimer = setTimeout(() => props.onReactPick(m(), bubbleRef!), 450);
  };
  const cancelPress = () => pressTimer && clearTimeout(pressTimer);

  const isE2ee = () => m().scheme !== "plain" && m().scheme !== "call-log";
  const hasReactions = () => m().reactions.length > 0;

  return (
    <div
    class="flex flex-col"
    classList={{
      "items-end": mine(),
          "items-start": !mine(),
          "mt-3": isFirst(),
          "mt-0.5": !isFirst(),
          "mb-2": hasReactions(),
    }}
    >
    <div class="group flex w-full items-end gap-1" classList={{ "justify-end": mine(), "justify-start": !mine() }}>
    {/* Hover affordances (desktop) */}
    <Show when={mine()}>
    <BubbleActions message={m()} onReply={props.onReply} onReactPick={props.onReactPick} />
    </Show>

    {/* Avatar slot for received group messages — only drawn on the last
      bubble of a run, but reserved on every row so bubbles stay aligned. */}
      <Show when={!mine() && isGroupChat()}>
      <div class="flex h-6 w-6 shrink-0 items-end self-end">
      <Show when={isLast()}>
      <Avatar
        size={24}
        color={props.author?.avatarColor ?? "#94a3b8"}
        initial={(props.author?.name?.[0] ?? "?").toUpperCase()}
        userId={props.author?.id}
        hasPhoto={props.author?.hasAvatar}
      />
      </Show>
      </div>
      </Show>

      <div class="relative w-fit max-w-[75%] shrink-0 sm:max-w-[65%]">
      <div
      ref={bubbleRef}
      onDblClick={() => props.onReply(m())}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      class="rounded-[1.1rem] px-3.5 py-2 shadow-sm transition-opacity"
      classList={{
        "bg-bubble-sent text-bubble-sent-ink": mine(),
          "bg-bubble-received text-bubble-received-ink": !mine(),
          "rounded-tr-md": mine() && !isFirst(),
          "rounded-br-md": mine() && !isLast(),
          "rounded-tl-md": !mine() && !isFirst(),
          "rounded-bl-md": !mine() && !isLast(),
          "opacity-60": !!m().pending,
          "outline outline-1 outline-danger/50": !!m().failed,
      }}
      >
      <Show when={!mine() && isGroupChat() && props.author && isFirst()}>
      <p class="mb-0.5 flex items-center gap-1 text-xs font-semibold text-accent">
      <span class="truncate">{props.author!.name}</span>
      <Show when={props.author!.verified}>
      <VerifiedBadge size={12} name={props.author!.name} />
      </Show>
      </p>
      </Show>

      <Show when={m().replyTo}>
      {(reply) => (
        <div class="mb-1.5 rounded-lg border-l-2 border-current/40 bg-black/10 px-2.5 py-1.5">
        <p class="line-clamp-2 text-xs opacity-80">{reply().text}</p>
        </div>
      )}
      </Show>

      <Show
      when={m().callLog}
      fallback={
        <>
        <Show when={m().attachment}>
        {(att) => (
          <div
          class="-mx-1 mb-1 mt-0.5 overflow-hidden rounded-xl"
          classList={{ "mb-0": !m().text }}
          >
          <Show when={att().kind === "image"}>
          <ImageAttachment id={att().id} width={att().width} height={att().height} />
          </Show>
          <Show when={att().kind === "voice"}>
          <VoiceAttachment id={att().id} durationMs={att().durationMs} />
          </Show>
          <Show when={att().kind === "file"}>
          <FileAttachment id={att().id} filename={att().filename} sizeBytes={att().sizeBytes} />
          </Show>
          </div>
        )}
        </Show>
        <Show when={m().text}>
        <p
        class="whitespace-pre-wrap break-words text-[0.95em] leading-snug"
        classList={{ "italic opacity-70": m().decrypting }}
        >
        {m().decrypting ? "Decrypting…" : m().text}
        </p>
        </Show>
        </>
      }
      >
      <CallLogBubble message={m()} />
      </Show>
      </div>

      {/* Reactions overlap the bottom edge of the bubble, like every
        messenger worth its salt — kept outside the bubble so they
        don't distort its shape or padding. */}
        <Show when={hasReactions()}>
        <div
        class="absolute -bottom-2.5 flex max-w-full flex-wrap gap-1"
        classList={{ "right-2 justify-end": mine(), "left-2": !mine() }}
        >
        <For each={m().reactions}>
        {(reaction) => (
          <button
          type="button"
          onClick={() => void messagesStore.toggleReaction(m(), reaction.emoji)}
          class="flex items-center gap-1 rounded-pill border border-black/5 bg-surface px-1.5 py-0.5 text-xs shadow-sm transition-transform duration-150 hover:scale-110 active:scale-90"
          classList={{
            "ring-1 ring-accent/60 font-semibold": reaction.userIds.includes(myId()),
          }}
          >
          <span>{reaction.emoji}</span>
          <span class="text-[0.7rem] opacity-70">{reaction.userIds.length}</span>
          </button>
        )}
        </For>
        </div>
        </Show>
        </div>

        <Show when={!mine()}>
        <BubbleActions message={m()} onReply={props.onReply} onReactPick={props.onReactPick} />
        </Show>
        </div>

        {/* Timestamp + delivery status: only on the last bubble of a group,
          living outside the colored bubble like every real messenger does. */}
          <Show when={isLast()}>
          <p
          class="mt-1 flex items-center gap-1 px-1 text-[0.7em] text-ink-subtle"
          classList={{ "ml-7": !mine() && isGroupChat() }}
          >
          <Show when={m().failed}>
          <span class="font-semibold text-danger">Failed — tap to retry</span>
          </Show>
          <Show when={isE2ee()}>
          <LockIcon size={11} />
          </Show>
          <span>{formatClockTime(m().sentAt)}</span>
          <Show when={receipt() === "pending"}>
          <SpinnerIcon size={11} class="animate-spin" />
          </Show>
          <Show when={receipt() === "sent"}>
          <CheckIcon size={13} />
          </Show>
          <Show when={receipt() === "read"}>
          <ChecksIcon size={13} class="text-accent" />
          </Show>
          </p>
          </Show>
          </div>
  );
}

function BubbleActions(props: {
  message: Message;
  onReply: (message: Message) => void;
  onReactPick: (message: Message, anchor: HTMLElement) => void;
}) {
  let reactBtn: HTMLButtonElement | undefined;
  return (
    <div class="mb-1 hidden shrink-0 items-center gap-0.5 self-end opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
    <button
    ref={reactBtn}
    type="button"
    onClick={() => props.onReactPick(props.message, reactBtn!)}
    class="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none text-ink-subtle transition-[background-color,transform] duration-150 hover:bg-surface active:scale-90"
    aria-label="React"
    title="React"
    >
    😊
    </button>
    <button
    type="button"
    onClick={() => props.onReply(props.message)}
    class="flex h-7 w-7 items-center justify-center rounded-full text-sm text-ink-subtle transition-[background-color,transform] duration-150 hover:bg-surface active:scale-90"
    aria-label="Reply"
    title="Reply"
    >
    ↩
    </button>
    </div>
  );
}
