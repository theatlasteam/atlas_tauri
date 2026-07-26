import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { chatsState, chatsStore, typingLabel } from "../store/chats";
import { messagesStore } from "../store/messages";
import { calls } from "../store/calls";
import { session } from "../store/session";
import { api } from "../data/api";
import { e2eeAvailable } from "../lib/tauri";
import { preferences } from "../store/preferences";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import MessageBubble from "../components/MessageBubble";
import ConnectionBanner from "../components/ConnectionBanner";
import { MessageListSkeleton } from "../components/Skeleton";
import VerifiedBadge from "../components/VerifiedBadge";
import Popover from "../ui/Popover";
import { Menu, MenuItem } from "../ui/Menu";
import { useIsDesktopLayout } from "../lib/platform";
import {
  ArrowDownIcon,
  AttachIcon,
  BackIcon,
  BellIcon,
  BellSlashIcon,
  ChatIcon,
  CloseIcon,
  ChevronDownIcon,
  EyeIcon,
  HourglassIcon,
  LockIcon,
  MicIcon,
  PhoneIcon,
  ProhibitIcon,
  SendIcon,
  SpinnerIcon,
  StopIcon,
  VideoIcon,
} from "../icons";
import type { Message, User } from "../data/types";
import { repository } from "../data/repository";
import { formatBytes, formatLastSeen, formatUnlockAt } from "../lib/time";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

/**
 * How often a draft goes out while live typing is on.
 *
 * Each one is an X25519 seal plus a frame, so this is a real cost, not just
 * bandwidth. 300ms is below the threshold where the other end notices lag and
 * comfortably above per-keystroke.
 */
const LIVE_TYPING_INTERVAL_MS = 300;

/** Preset offsets for the time-capsule picker, relative to "now". */
const CAPSULE_PRESETS: Array<{ label: string; hint: string; offsetMs: number }> = [
  { label: "In an hour", hint: "", offsetMs: 60 * 60_000 },
  { label: "Tonight", hint: "8 hours from now", offsetMs: 8 * 60 * 60_000 },
  { label: "Tomorrow", hint: "24 hours from now", offsetMs: 24 * 60 * 60_000 },
  { label: "Next week", hint: "7 days from now", offsetMs: 7 * 24 * 60 * 60_000 },
  { label: "In a year", hint: "365 days from now", offsetMs: 365 * 24 * 60 * 60_000 - 60_000 },
];

interface PendingAttachment {
  file: File;
  kind: "image" | "file";
  /** Object URL for the local image thumbnail; revoked on cancel/send/unmount. */
  previewUrl?: string;
  width?: number;
  height?: number;
}

export default function ChatView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();

  const chat = () => chatsState.chats.find((c) => c.id === params.id);
  const thread = () => messagesStore.state[params.id];
  const messages = () => thread()?.messages ?? [];
  const me = () => session.user()?.id ?? "";

  let scrollRef: HTMLDivElement | undefined;
  let menuBtn: HTMLButtonElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  const [draft, setDraft] = createSignal("");
  const [atBottom, setAtBottom] = createSignal(true);
  const [sending, setSending] = createSignal(false);
  const [replyTo, setReplyTo] = createSignal<Message | null>(null);
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [reactFor, setReactFor] = createSignal<{ message: Message; anchor: HTMLElement } | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [pendingAttachment, setPendingAttachment] = createSignal<PendingAttachment | null>(null);
  const [recording, setRecording] = createSignal(false);
  const [loadingOlder, setLoadingOlder] = createSignal(false);
  /** Time capsule armed for the next send (ISO), or null for "send now". */
  const [capsuleAt, setCapsuleAt] = createSignal<string | null>(null);
  const [capsuleOpen, setCapsuleOpen] = createSignal(false);
  /** Group chats: authorId -> resolved profile (name, fallback avatar, photo flag). */
  const [authors, setAuthors] = createSignal<Record<string, User>>({});

  let recorder: MediaRecorder | null = null;
  let recordStart = 0;
  let capsuleBtn: HTMLButtonElement | undefined;
  let lastTypingSent = 0;

  const scrollToBottom = (smooth = true) => {
    scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const clearPendingAttachment = () => {
    const current = pendingAttachment();
    if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
    setPendingAttachment(null);
  };

  // Open / switch chat: load history, register as active (live mark-read).
  createEffect(
    on(
      () => params.id,
      (id) => {
        if (!id) return;
        chatsStore.setActiveChat(id);
        setReplyTo(null);
        setDraft("");
        setCapsuleAt(null);
        lastTypingSent = 0; // the throttle is per-conversation, not per-screen
        clearPendingAttachment();
        void messagesStore.loadInitial(id, chat()?.peerUserId).then(() => {
          queueMicrotask(() => scrollToBottom(false));
          const latest = messages()[messages().length - 1];
          void chatsStore.markRead(id, latest && !latest.pending ? latest.id : undefined);
        });
      },
    ),
  );
  onCleanup(() => {
    chatsStore.setActiveChat(null);
    clearPendingAttachment();
  });

  // Resolve author names for group bubbles.
  createEffect(() => {
    const c = chat();
    if (c?.kind !== "group") return;
    const missing = [...new Set(messages().map((m) => m.authorId))].filter(
      (id) => id !== me() && !authors()[id],
    );
    for (const id of missing) {
      void repository
        .getUser(id)
        .then((user: User) => setAuthors((a) => ({ ...a, [id]: user })))
        .catch(() => {}); // leave unresolved; UI falls back to "Someone"/no name
    }
  });

  // Stick to bottom on new messages (if already there).
  createEffect(
    on(
      () => messages().length,
      (len, prevLen) => {
        if (prevLen !== undefined && len > prevLen && atBottom()) {
          queueMicrotask(() => scrollToBottom());
        }
      },
    ),
  );

  const handleScroll = () => {
    if (!scrollRef) return;
    const distanceFromBottom = scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight;
    setAtBottom(distanceFromBottom < 80);
    if (scrollRef.scrollTop < 120 && !loadingOlder() && thread() && !thread()!.reachedStart) {
      setLoadingOlder(true);
      const anchorHeight = scrollRef.scrollHeight;
      void messagesStore
        .loadOlder(params.id, chat()?.peerUserId)
        .then((count) => {
          if (count > 0 && scrollRef) {
            scrollRef.scrollTop += scrollRef.scrollHeight - anchorHeight;
          }
        })
        .finally(() => setLoadingOlder(false));
    }
  };

  const typingSubtitle = () => typingLabel(params.id, (id) => authors()[id]?.name);

  /**
   * Live typing: the drafts other people are writing in this chat, right now.
   * Only ever populated when this device shares its own — the store enforces
   * the reciprocity, this just reads the result.
   */
  const liveDrafts = () =>
    Object.entries(chatsStore.typingPreview(params.id)).filter(([, text]) => text.trim().length > 0);

  const onDraftInput = (value: string) => {
    setDraft(value);
    const at = Date.now();
    // Live typing needs a much shorter interval than the plain indicator: the
    // point is watching a sentence form, and a 2.5s-stale draft isn't that.
    const interval = preferences.liveTyping ? LIVE_TYPING_INTERVAL_MS : 2500;
    if (at - lastTypingSent <= interval) return;
    if (preferences.liveTyping) {
      lastTypingSent = at;
      void chatsStore.sendTyping(params.id, value);
    } else if (value.trim()) {
      lastTypingSent = at;
      void chatsStore.sendTyping(params.id);
    }
  };

  const encrypted = () => e2eeAvailable && !!chat()?.peerUserId;
  const blocked = () => !!chat()?.blockedByMe || !!chat()?.blockedMe;

  const submit = async (e: Event) => {
    e.preventDefault();
    const text = draft().trim();
    const attachment = pendingAttachment();
    if ((!text && !attachment) || sending() || blocked()) return;

    setSending(true);
    setDraft("");
    const reply = replyTo();
    setReplyTo(null);
    const unlockAt = capsuleAt() ?? undefined;
    setCapsuleAt(null);
    if (attachment) setUploading(true);

    try {
      let attachmentId: string | undefined;
      let attachmentPreview: Message["attachment"] | undefined;
      if (attachment) {
        const uploaded = await api.uploadAttachment(attachment.file, {
          kind: attachment.kind,
          filename: attachment.file.name,
          mime: attachment.file.type || "application/octet-stream",
          width: attachment.width,
          height: attachment.height,
        });
        attachmentId = uploaded.id;
        attachmentPreview = uploaded;
        clearPendingAttachment();
      }
      await messagesStore.send(params.id, text, {
        replyToId: reply?.id,
        peerUserId: chat()?.peerUserId,
        attachmentId,
        attachmentPreview,
        unlockAt,
      });
    } catch {
      /* the failed row in the thread offers retry */
    } finally {
      setSending(false);
      setUploading(false);
      if (fileInput) fileInput.value = "";
      queueMicrotask(() => scrollToBottom());
    }
  };

  const pickFile = () => fileInput?.click();

  /** Queue a picked file for preview; nothing is uploaded until send. */
  const queueAttachment = async (file: File) => {
    clearPendingAttachment();
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      const previewUrl = URL.createObjectURL(file);
      const dims = await imageDims(file).catch(() => null);
      setPendingAttachment({ file, kind: "image", previewUrl, width: dims?.width, height: dims?.height });
    } else {
      setPendingAttachment({ file, kind: "file" });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined; // iOS records audio/mp4
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const durationMs = Date.now() - recordStart;
        if (durationMs < 500) return; // accidental tap
        const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        setUploading(true);
        try {
          const attachment = await api.uploadAttachment(blob, {
            kind: "voice",
            mime: blob.type,
            filename: "voice-message",
            durationMs,
          });
          await messagesStore.send(params.id, "", {
            attachmentId: attachment.id,
            peerUserId: chat()?.peerUserId,
            attachmentPreview: attachment,
          });
          queueMicrotask(() => scrollToBottom());
        } finally {
          setUploading(false);
        }
      };
      recordStart = Date.now();
      recorder.start();
      setRecording(true);
    } catch {
      /* mic permission denied — the OS prompt already told the user */
    }
  };

  const stopRecording = () => recorder?.state !== "inactive" && recorder?.stop();

  const startCall = (media: "audio" | "video") => {
    const c = chat();
    if (!c?.peerUserId) return;
    void calls.startCall(
      {
        id: c.peerUserId,
        name: c.name,
        avatarColor: c.avatarColor,
        avatarInitial: c.avatarInitial,
        hasAvatar: c.peerHasAvatar,
      },
      media,
    );
  };

  const bubbleRetry = (message: Message) => {
    if (message.failed) void messagesStore.retryFailed(params.id, message, chat()?.peerUserId);
  };

  /** Chat-header subtitle for a DM: typing beats presence beats last seen. */
  const peerSubtitle = () => {
    const c = chat();
    if (!c) return "";
    if (c.kind === "group") return `${c.memberCount} members`;
    if (c.online) return "online";
    // formatLastSeen returns null when the peer hides it — say nothing
    // specific rather than inventing "recently", which the header used to
    // claim regardless of what the server actually knew.
    return formatLastSeen(c.peerLastSeenAt) ?? "offline";
  };

  return (
    <div class="relative flex h-full flex-col">
      <header class="flex shrink-0 items-center gap-3 border-b border-border bg-appbar px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <Show when={!isDesktop()}>
          <A href="/" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface">
            <BackIcon size={22} />
          </A>
        </Show>
        <Show when={chat()}>
          {(c) => (
            <>
              <button
                type="button"
                onClick={() => c().peerUserId && navigate(`/user/${c().peerUserId}`)}
                disabled={c().kind !== "dm"}
                class="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-left transition-colors duration-150 enabled:hover:bg-surface enabled:active:bg-surface"
              >
                <Avatar
                  color={c().avatarColor}
                  initial={c().avatarInitial}
                  size={36}
                  online={c().online}
                  userId={c().peerUserId}
                  hasPhoto={c().peerHasAvatar}
                />
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1.5 truncate font-semibold leading-tight">
                    <span class="truncate">{c().name}</span>
                    <Show when={c().peerVerified}>
                      <VerifiedBadge size={14} name={c().name} />
                    </Show>
                    <Show when={encrypted()}>
                      <LockIcon size={13} class="shrink-0 text-accent" />
                    </Show>
                    {/* Live typing is a two-way mirror: this marks that your
                        own drafts are visible to the other side too. */}
                    <Show when={preferences.liveTyping}>
                      <EyeIcon size={13} class="shrink-0 text-accent" />
                    </Show>
                  </p>
                  <p class="truncate text-xs" classList={{ "text-accent animate-pulse": !!typingSubtitle(), "text-ink-subtle": !typingSubtitle() }}>
                    {typingSubtitle() ?? peerSubtitle()}
                  </p>
                </div>
              </button>
              <Show when={c().kind === "dm" && !blocked()}>
                <button
                  type="button"
                  onClick={() => startCall("audio")}
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                  aria-label="Voice call"
                >
                  <PhoneIcon size={21} />
                </button>
                <button
                  type="button"
                  onClick={() => startCall("video")}
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                  aria-label="Video call"
                >
                  <VideoIcon size={21} />
                </button>
              </Show>
              <button
                ref={menuBtn}
                type="button"
                onClick={() => setMenuOpen(true)}
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                aria-label="Chat options"
              >
                <ChevronDownIcon size={20} />
              </button>
            </>
          )}
        </Show>
      </header>

      <ConnectionBanner />

      <div class="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-wallpaper={preferences.wallpaper}
          class="h-full overflow-y-auto overscroll-contain px-4 pb-28 pt-2"
        >
          <Show when={thread()?.loaded} fallback={<MessageListSkeleton />}>
            <Show
              when={messages().length > 0}
              fallback={
                <EmptyState
                  icon={ChatIcon}
                  title="No messages yet"
                  subtitle="Send the first message to start this conversation."
                />
              }
            >
              <Show when={loadingOlder()}>
                <div class="flex justify-center py-2">
                  <SpinnerIcon size={18} class="animate-spin text-ink-subtle" />
                </div>
              </Show>
              <div class="flex flex-col">
                <For each={messages()}>
                  {(message, i) => {
                    // Group consecutive messages from the same author (call-log
                    // rows never group) so only the last bubble in a run gets a
                    // tail + name label, like every real messenger does.
                    const groupable = (m: Message | undefined) => m && !m.callLog && !message.callLog;
                    const prev = () => messages()[i() - 1];
                    const next = () => messages()[i() + 1];
                    const isFirst = () => !groupable(prev()) || prev()!.authorId !== message.authorId;
                    const isLast = () => !groupable(next()) || next()!.authorId !== message.authorId;
                    return (
                      // Spacing between bubbles lives here and only here.
                      // MessageBubble used to apply its own mt-3/mt-0.5 on top
                      // of this, so every gap in the thread was the sum of two
                      // rules that disagreed with each other.
                      <div
                        onClick={() => bubbleRetry(message)}
                        classList={{
                          "mt-2.5": isFirst() || !!message.callLog,
                          "mt-0.5": !isFirst() && !message.callLog,
                        }}
                      >
                        <MessageBubble
                          message={message}
                          chat={chat()}
                          author={authors()[message.authorId]}
                          isFirstInGroup={isFirst()}
                          isLastInGroup={isLast()}
                          onReply={(m) => setReplyTo(m)}
                          onReactPick={(m, anchor) => setReactFor({ message: m, anchor })}
                        />
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>

          {/* Live typing: the other side's draft, forming in place. Rendered
              outside the message list because it is not a message — it has no
              id, no timestamp, and it can vanish mid-word. */}
          <For each={liveDrafts()}>
            {([userId, text]) => (
              <div class="mt-2.5 flex justify-start">
                <div class="max-w-[75%] rounded-[1.1rem] rounded-bl-md border border-dashed border-accent/40 bg-bubble-received/60 px-3.5 py-2 text-bubble-received-ink sm:max-w-[65%]">
                  <Show when={chat()?.kind === "group"}>
                    <p class="mb-0.5 truncate text-xs font-semibold text-accent">
                      {authors()[userId]?.name ?? "Someone"}
                    </p>
                  </Show>
                  <p class="whitespace-pre-wrap break-words text-[0.95em] leading-snug opacity-70">
                    {text}
                    <span class="ml-0.5 inline-block animate-pulse font-semibold text-accent">▍</span>
                  </p>
                </div>
              </div>
            )}
          </For>
        </div>

        <Show when={!atBottom()}>
          <button
            type="button"
            onClick={() => scrollToBottom()}
            class="pop-in absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-raised text-ink shadow-floating transition-transform duration-150 hover:scale-105 active:scale-95"
            aria-label="Scroll to latest messages"
          >
            <ArrowDownIcon size={18} />
          </button>
        </Show>
      </div>

      <div class="absolute inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur">
        <Show when={pendingAttachment()}>
          {(attachment) => (
            <div class="rise-in flex items-center gap-2.5 px-4 pt-2">
              <Show
                when={attachment().kind === "image"}
                fallback={
                  <div class="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-surface-raised px-2.5 py-2">
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
                      <AttachIcon size={16} />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm text-ink">{attachment().file.name}</span>
                      <span class="block text-xs text-ink-subtle">{formatBytes(attachment().file.size)}</span>
                    </span>
                  </div>
                }
              >
                <div class="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border">
                  <img src={attachment().previewUrl} alt="" class="h-full w-full object-cover" />
                </div>
              </Show>
              <button
                type="button"
                onClick={clearPendingAttachment}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface"
                aria-label="Remove attachment"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </Show>

        <Show when={capsuleAt()}>
          {(unlockAt) => (
            <div class="rise-in flex items-center gap-2 px-4 pt-2">
              <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-l-2 border-accent bg-surface-raised px-2.5 py-1.5">
                <HourglassIcon size={15} class="shrink-0 text-accent" />
                <p class="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  <span class="font-semibold text-accent">Sealed until </span>
                  {formatUnlockAt(unlockAt())}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCapsuleAt(null)}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface"
                aria-label="Send now instead"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </Show>

        <Show when={replyTo()}>
          {(reply) => (
            <div class="rise-in flex items-center gap-2 px-4 pt-2">
              <div class="min-w-0 flex-1 rounded-lg border-l-2 border-accent bg-surface-raised px-2.5 py-1.5">
                <p class="text-xs font-semibold text-accent">
                  Replying to {reply().mine ? "yourself" : authors()[reply().authorId]?.name ?? chat()?.name}
                </p>
                <p class="truncate text-xs text-ink-muted">{reply().text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface"
                aria-label="Cancel reply"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </Show>

        <Show
          when={!blocked()}
          fallback={
            <div class="flex items-center justify-center gap-2 px-4 pb-[max(var(--safe-bottom),1rem)] pt-3 text-sm text-ink-subtle">
              <ProhibitIcon size={16} />
              {chat()?.blockedByMe ? "You've blocked this user." : "You can't message this user."}
            </div>
          }
        >
        <form
          onSubmit={submit}
          class="flex gap-2 px-[max(var(--safe-left),0.75rem)] pb-[max(var(--safe-bottom),0.75rem)] pt-2.5"
        >
          <input
            ref={fileInput}
            type="file"
            class="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void queueAttachment(file);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={pickFile}
            disabled={uploading()}
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface disabled:opacity-40"
            aria-label="Attach file"
          >
            <Show when={!uploading()} fallback={<SpinnerIcon size={19} class="animate-spin" />}>
              <AttachIcon size={20} />
            </Show>
          </button>
          <button
            ref={capsuleBtn}
            type="button"
            onClick={() => setCapsuleOpen(true)}
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 hover:bg-surface active:scale-95"
            classList={{
              "text-accent bg-accent-soft": !!capsuleAt(),
              "text-ink-muted hover:text-ink": !capsuleAt(),
            }}
            aria-label={capsuleAt() ? "Change when this opens" : "Send as a time capsule"}
          >
            <HourglassIcon size={19} />
          </button>
          <input
            type="text"
            value={draft()}
            onInput={(e) => onDraftInput(e.currentTarget.value)}
            placeholder={
              recording()
                ? "Recording voice message…"
                : pendingAttachment()
                  ? "Add a caption…"
                  : capsuleAt()
                    ? "Write something for later…"
                    : encrypted()
                      ? "Encrypted message"
                      : "Message"
            }
            disabled={recording()}
            class="min-w-0 flex-1 rounded-pill border border-border bg-surface px-4 py-2.5 text-ink placeholder-ink-subtle outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <Show
            when={draft().trim() || pendingAttachment()}
            fallback={
              <button
                type="button"
                onClick={() => (recording() ? stopRecording() : void startRecording())}
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:brightness-105 active:scale-95"
                classList={{
                  "bg-danger text-white animate-pulse": recording(),
                  "bg-accent text-accent-ink": !recording(),
                }}
                aria-label={recording() ? "Stop recording" : "Record voice message"}
              >
                <Show when={recording()} fallback={<MicIcon size={19} />}>
                  <StopIcon size={19} />
                </Show>
              </button>
            }
          >
            <button
              type="submit"
              disabled={sending()}
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform duration-150 hover:brightness-105 disabled:opacity-40 active:scale-95"
              aria-label={capsuleAt() ? "Seal and send" : "Send message"}
            >
              <Show when={!capsuleAt()} fallback={<HourglassIcon size={18} />}>
                <SendIcon size={18} />
              </Show>
            </button>
          </Show>
        </form>
        </Show>
      </div>

      {/* Chat menu: mute (encryption is always on for DMs — no toggle) */}
      <Menu open={menuOpen()} onOpenChange={setMenuOpen} anchorRef={() => menuBtn} placement="bottom-end">
        <MenuItem
          onSelect={() => {
            setMenuOpen(false);
            void chatsStore.setMuted(params.id, !chat()?.muted);
          }}
        >
          <span>{chat()?.muted ? "Unmute" : "Mute"}</span>
          <Show when={chat()?.muted} fallback={<BellSlashIcon size={16} />}>
            <BellIcon size={16} />
          </Show>
        </MenuItem>
      </Menu>

      {/* Time capsule: when should the other side be able to read this? */}
      <Menu open={capsuleOpen()} onOpenChange={setCapsuleOpen} anchorRef={() => capsuleBtn} placement="top-start">
        <For each={CAPSULE_PRESETS}>
          {(preset) => (
            <MenuItem
              onSelect={() => {
                setCapsuleOpen(false);
                setCapsuleAt(new Date(Date.now() + preset.offsetMs).toISOString());
              }}
            >
              <span class="flex flex-col items-start">
                <span>{preset.label}</span>
                <Show when={preset.hint}>
                  <span class="text-xs text-ink-subtle">{preset.hint}</span>
                </Show>
              </span>
              <HourglassIcon size={16} />
            </MenuItem>
          )}
        </For>
        <Show when={capsuleAt()}>
          <MenuItem
            onSelect={() => {
              setCapsuleOpen(false);
              setCapsuleAt(null);
            }}
          >
            <span>Send now instead</span>
            <SendIcon size={16} />
          </MenuItem>
        </Show>
      </Menu>

      {/* Quick emoji reactions */}
      <Popover
        open={reactFor() !== null}
        onOpenChange={(open) => !open && setReactFor(null)}
        anchorRef={() => reactFor()?.anchor}
        placement="top-start"
      >
        <div class="flex gap-0.5 rounded-pill border border-border bg-surface-raised p-1 shadow-floating">
          <For each={QUICK_EMOJI}>
            {(emoji) => (
              <button
                type="button"
                onClick={() => {
                  const target = reactFor();
                  setReactFor(null);
                  if (target) void messagesStore.toggleReaction(target.message, emoji);
                }}
                class="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-[background-color,transform] duration-150 hover:scale-110 hover:bg-accent-soft active:scale-90"
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            )}
          </For>
        </div>
      </Popover>
    </div>
  );
}

function imageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}
