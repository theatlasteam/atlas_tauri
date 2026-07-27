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
import MessageBubble, { HOLD_MS } from "../components/MessageBubble";
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
  CheckIcon,
  EditIcon,
  EyeIcon,
  HourglassIcon,
  LockIcon,
  MicIcon,
  PhoneIcon,
  ProhibitIcon,
  ReplyIcon,
  SendIcon,
  SpinnerIcon,
  StopIcon,
  TrashIcon,
  VideoIcon,
} from "../icons";
import type { Message, User } from "../data/types";
import { repository } from "../data/repository";
import { formatBytes, formatLastSeen, formatUnlockAt } from "../lib/time";
import { t } from "../lib/i18n";

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
const CAPSULE_PRESETS = () => [
  { label: t("chatView.capsuleInHour"), hint: "", offsetMs: 60 * 60_000 },
  { label: t("chatView.capsuleTonight"), hint: t("chatView.capsuleTonightHint"), offsetMs: 8 * 60 * 60_000 },
  { label: t("chatView.capsuleTomorrow"), hint: t("chatView.capsuleTomorrowHint"), offsetMs: 24 * 60 * 60_000 },
  { label: t("chatView.capsuleNextWeek"), hint: t("chatView.capsuleNextWeekHint"), offsetMs: 7 * 24 * 60 * 60_000 },
  { label: t("chatView.capsuleInYear"), hint: t("chatView.capsuleInYearHint"), offsetMs: 365 * 24 * 60 * 60_000 - 60_000 },
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
  const [actionsFor, setActionsFor] = createSignal<{ message: Message; anchor: HTMLElement } | null>(
    null,
  );
  const [uploading, setUploading] = createSignal(false);
  const [pendingAttachment, setPendingAttachment] = createSignal<PendingAttachment | null>(null);
  const [recording, setRecording] = createSignal(false);
  const [loadingOlder, setLoadingOlder] = createSignal(false);
  /** Time capsule armed for the next send (ISO), or null for "send now". */
  const [capsuleAt, setCapsuleAt] = createSignal<string | null>(null);
  const [capsuleOpen, setCapsuleOpen] = createSignal(false);
  /** The message the composer is currently rewriting, if any. */
  const [editing, setEditing] = createSignal<Message | null>(null);
  /** Group chats: authorId -> resolved profile (name, fallback avatar, photo flag). */
  const [authors, setAuthors] = createSignal<Record<string, User>>({});

  let recorder: MediaRecorder | null = null;
  let recordStart = 0;
  let sendBtn: HTMLButtonElement | undefined;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Set when a hold on Send opened the capsule picker, so the click that ends
   * that same press doesn't also fire the form submit underneath it.
   */
  let holdOpenedPicker = false;
  let lastTypingSent = 0;

  const startHold = () => {
    holdOpenedPicker = false;
    holdTimer = setTimeout(() => {
      holdOpenedPicker = true;
      setCapsuleOpen(true);
          // Same duration as press-and-hold on a bubble — see HOLD_MS.
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = undefined;
  };

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
        setEditing(null);
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
    cancelHold();
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
    // The press that opened the capsule picker still ends in a click on a
    // submit button. Swallow exactly that one.
    if (holdOpenedPicker) {
      holdOpenedPicker = false;
      return;
    }
    const text = draft().trim();
    const attachment = pendingAttachment();

    // Saving an edit reuses the composer but is a different operation: no
    // attachment, no capsule, no new row in the thread.
    const target = editing();
    if (target) {
      if (!text || sending()) return;
      setSending(true);
      try {
        await messagesStore.edit(params.id, target, text, chat()?.peerUserId);
        setEditing(null);
        setDraft("");
      } catch {
        /* the store rolled the bubble back; the draft stays for another go */
      } finally {
        setSending(false);
      }
      return;
    }

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

  // What the actions sheet may offer for a given bubble. These live with the
  // sheet rather than the bubble so there is one answer per action, whichever
  // way the sheet was opened.
  const canReact = (m: Message) => !m.deleted && !m.pending && !m.failed;
  /** Editing a capsule mid-countdown would make "sealed" mean "provisional",
   *  so the server refuses it — don't offer it either. */
  const canEdit = (m: Message) =>
    m.mine && !m.deleted && !m.callLog && !m.pending && !m.failed && !m.sealed;
  const canUnsend = (m: Message) => m.mine && !m.deleted && !m.pending && !m.failed;

  const startEdit = (message: Message) => {
    setEditing(message);
    setReplyTo(null);
    clearPendingAttachment();
    setCapsuleAt(null);
    setDraft(message.text);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const unsend = (message: Message) => void messagesStore.unsend(params.id, message).catch(() => {});

  /**
   * Chat-header subtitle for a DM: typing beats co-presence beats online
   * beats last seen — most specific fact first, since each one implies the
   * ones below it.
   */
  const peerSubtitle = () => {
    const c = chat();
    if (!c) return "";
    const here = chatsStore.presentIn(params.id);
    if (c.kind === "group") {
      return here.length > 0
        ? t("chatView.membersWithHere", { count: c.memberCount, here: here.length })
        : t("chatView.members", { count: c.memberCount });
    }
    if (c.peerUserId && here.includes(c.peerUserId)) return t("chatView.inChatWithYou");
    if (c.online) return t("chatView.online");
    // formatLastSeen returns null when the peer hides it — say nothing
    // specific rather than inventing "recently", which the header used to
    // claim regardless of what the server actually knew.
    return formatLastSeen(c.peerLastSeenAt) ?? t("chatView.offline");
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
                  aria-label={t("chatView.voiceCallAria")}
                >
                  <PhoneIcon size={21} />
                </button>
                <button
                  type="button"
                  onClick={() => startCall("video")}
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                  aria-label={t("chatView.videoCallAria")}
                >
                  <VideoIcon size={21} />
                </button>
              </Show>
              <button
                ref={menuBtn}
                type="button"
                onClick={() => setMenuOpen(true)}
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                aria-label={t("chatView.chatOptionsAria")}
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
                  title={t("chatView.noMessagesTitle")}
                  subtitle={t("chatView.noMessagesSubtitle")}
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
                          onActions={(m, anchor) => setActionsFor({ message: m, anchor })}
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
                      {authors()[userId]?.name ?? t("chatView.someone")}
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
            aria-label={t("chatView.scrollToLatestAria")}
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
                aria-label={t("chatView.removeAttachmentAria")}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </Show>

        <Show when={editing()}>
          {(target) => (
            <div class="rise-in flex items-center gap-2 px-4 pt-2">
              <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-l-2 border-accent bg-surface-raised px-2.5 py-1.5">
                <EditIcon size={15} class="shrink-0 text-accent" />
                <p class="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  <span class="font-semibold text-accent">{t("chatView.editingPrefix")}</span>
                  {target().text}
                </p>
              </div>
              <button
                type="button"
                onClick={cancelEdit}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface"
                aria-label={t("chatView.cancelEditAria")}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
        </Show>

        {/* Ternary rather than `capsuleAt() && !editing()` so Show still
            narrows the accessor to a string. */}
        <Show when={editing() ? null : capsuleAt()}>
          {(unlockAt) => (
            <div class="rise-in flex items-center gap-2 px-4 pt-2">
              <div class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border-l-2 border-accent bg-surface-raised px-2.5 py-1.5">
                <HourglassIcon size={15} class="shrink-0 text-accent" />
                <p class="min-w-0 flex-1 truncate text-xs text-ink-muted">
                  <span class="font-semibold text-accent">{t("chatView.sealedUntil")}</span>
                  {formatUnlockAt(unlockAt())}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCapsuleAt(null)}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface"
                aria-label={t("chatView.sendNowInsteadAria")}
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
                  {reply().mine
                    ? t("chatView.replyingToSelf")
                    : t("chatView.replyingTo", { name: authors()[reply().authorId]?.name ?? chat()?.name ?? "" })}
                </p>
                <p class="truncate text-xs text-ink-muted">{reply().text}</p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface"
                aria-label={t("chatView.cancelReplyAria")}
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
              {chat()?.blockedByMe ? t("chatView.blockedByMe") : t("chatView.cantMessage")}
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
          {/* An edit replaces text only — the attachment stays as it was. */}
          <Show when={!editing()}>
          <button
            type="button"
            onClick={pickFile}
            disabled={uploading()}
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface disabled:opacity-40"
            aria-label={t("chatView.attachFileAria")}
          >
            <Show when={!uploading()} fallback={<SpinnerIcon size={19} class="animate-spin" />}>
              <AttachIcon size={20} />
            </Show>
          </button>
          </Show>
          <input
            type="text"
            value={draft()}
            onInput={(e) => onDraftInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Escape" && editing() && cancelEdit()}
            placeholder={
              editing()
                ? t("chatView.editPlaceholder")
                : recording()
                  ? t("chatView.recordingPlaceholder")
                  : pendingAttachment()
                    ? t("chatView.captionPlaceholder")
                    : capsuleAt()
                      ? t("chatView.capsulePlaceholder")
                      : encrypted()
                        ? t("chatView.encryptedPlaceholder")
                        : t("chatView.messagePlaceholder")
            }
            disabled={recording()}
            class="min-w-0 flex-1 rounded-pill border border-border bg-surface px-4 py-2.5 text-ink placeholder-ink-subtle outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
          <Show
            when={draft().trim() || pendingAttachment() || editing()}
            fallback={
              <button
                type="button"
                onClick={() => (recording() ? stopRecording() : void startRecording())}
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 hover:brightness-105 active:scale-95"
                classList={{
                  "bg-danger text-white animate-pulse": recording(),
                  "bg-accent text-accent-ink": !recording(),
                }}
                aria-label={recording() ? t("chatView.stopRecordingAria") : t("chatView.recordVoiceAria")}
              >
                <Show when={recording()} fallback={<MicIcon size={19} />}>
                  <StopIcon size={19} />
                </Show>
              </button>
            }
          >
            {/* Tap sends. Hold opens the time-capsule picker — the same
                press-and-hold that already reveals reactions on a bubble,
                rather than a third permanent button in the composer.
                While editing it is a plain Save: there is nothing to schedule,
                the message has already been sent once. */}
            <button
              ref={sendBtn}
              type="submit"
              disabled={sending() || (!!editing() && !draft().trim())}
              onPointerDown={() => !editing() && startHold()}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onContextMenu={(e) => e.preventDefault()}
              class="flex h-11 w-11 shrink-0 select-none items-center justify-center rounded-full bg-accent text-accent-ink transition-transform duration-150 hover:brightness-105 disabled:opacity-40 active:scale-95"
              aria-label={
                editing()
                  ? t("chatView.saveEditAria")
                  : capsuleAt()
                    ? t("chatView.sealAndSendAria")
                    : t("chatView.sendMessageAria")
              }
              title={
                editing()
                  ? t("chatView.saveTitle")
                  : capsuleAt()
                    ? t("chatView.holdToChangeTitle")
                    : t("chatView.holdToSendLaterTitle")
              }
            >
              <Show when={!editing()} fallback={<CheckIcon size={19} />}>
                <Show when={!capsuleAt()} fallback={<HourglassIcon size={18} />}>
                  <SendIcon size={18} />
                </Show>
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
          <span>{chat()?.muted ? t("chatView.unmute") : t("chatView.mute")}</span>
          <Show when={chat()?.muted} fallback={<BellSlashIcon size={16} />}>
            <BellIcon size={16} />
          </Show>
        </MenuItem>
      </Menu>

      {/* Time capsule: when should the other side be able to read this?
          Reached by holding Send. */}
      <Menu
        open={capsuleOpen()}
        onOpenChange={(open) => {
          setCapsuleOpen(open);
          // Releasing the hold outside the button produces no click, so the
          // submit guard would never be spent. Clear it when the picker goes
          // away instead, or the next genuine tap on Send gets swallowed.
          if (!open) holdOpenedPicker = false;
        }}
        anchorRef={() => sendBtn}
        placement="top-end"
      >
        <For each={CAPSULE_PRESETS()}>
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
            <span>{t("chatView.sendNowInsteadMenu")}</span>
            <SendIcon size={16} />
          </MenuItem>
        </Show>
      </Menu>

      {/* One message-actions sheet for both platforms: the phone reaches it by
          pressing and holding a bubble, the desktop by the ⋯ on hover. It used
          to be reactions only, which left Edit and Unsend reachable on desktop
          and nowhere else. */}
      <Popover
        open={actionsFor() !== null}
        onOpenChange={(open) => !open && setActionsFor(null)}
        anchorRef={() => actionsFor()?.anchor}
        placement="top-start"
      >
        <Show when={actionsFor()}>
          {(target) => {
            const message = () => target().message;
            const run = (action: (m: Message) => void) => {
              const m = message();
              setActionsFor(null);
              action(m);
            };
            return (
              <div
                role="menu"
                class="min-w-[13rem] overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-floating"
              >
                <Show when={canReact(message())}>
                  <div class="flex justify-between gap-0.5 border-b border-border p-1.5">
                    <For each={QUICK_EMOJI}>
                      {(emoji) => (
                        <button
                          type="button"
                          onClick={() => run((m) => void messagesStore.toggleReaction(m, emoji))}
                          class="flex h-9 w-9 items-center justify-center rounded-full text-lg transition-[background-color,transform] duration-150 hover:scale-110 hover:bg-accent-soft active:scale-90"
                          aria-label={t("chatView.reactWithAria", { emoji })}
                        >
                          {emoji}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="p-1.5">
                  <Show when={!message().deleted}>
                    <MenuItem onSelect={() => run(setReplyTo)}>
                      <span>{t("chatView.reply")}</span>
                      <ReplyIcon size={16} />
                    </MenuItem>
                  </Show>
                  <Show when={canEdit(message())}>
                    <MenuItem onSelect={() => run(startEdit)}>
                      <span>{t("chatView.edit")}</span>
                      <EditIcon size={16} />
                    </MenuItem>
                  </Show>
                  <Show when={canUnsend(message())}>
                    <MenuItem onSelect={() => run(unsend)}>
                      <span class="text-danger">{t("chatView.unsend")}</span>
                      <TrashIcon size={16} class="text-danger" />
                    </MenuItem>
                  </Show>
                  <Show when={message().deleted}>
                    <p class="px-3 py-2 text-sm text-ink-subtle">{t("chatView.nothingToDo")}</p>
                  </Show>
                </div>
              </div>
            );
          }}
        </Show>
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
