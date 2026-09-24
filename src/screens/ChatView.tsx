import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { chatsState, chatsStore, lastOpenChatId, setHidden, typingLabel } from "../store/chats";
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
import { Composer, GridLoader } from "@atlas/ui";
import ExpressionTray, { type ExpressionTab } from "../components/ExpressionTray";
import RichComposerField from "../components/RichComposerField";
import { emojiToken } from "../lib/customEmoji";
import { unwrapFx, wrapFx } from "../lib/textEffects";
import { canvasShareUrl } from "../lib/canvasShare";
import { useIsDesktopLayout } from "../lib/platform";
import { openNativeOrNavigate } from "../lib/mobileWindows";
import {
  ArrowDownIcon,
  AttachIcon,
  BackIcon,
  BellIcon,
  BellSlashIcon,
  ChatIcon,
  CloseIcon,
  ChevronDownIcon,
  EditIcon,
  EyeIcon,
  HourglassIcon,
  ImageIcon,
  LockIcon,
  PaletteIcon,
  PhoneIcon,
  ProhibitIcon,
  ReplyIcon,
  SendIcon,
  SmileyIcon,
  SpinnerIcon,
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
  const params = useParams<{ id: string; postId?: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();
  const chatId = () => params.id || lastOpenChatId() || "";

  const chat = () => chatsState.chats.find((c) => c.id === chatId());
  const thread = () => messagesStore.state[chatId()];
  const messages = () => thread()?.messages ?? [];
  const me = () => session.user()?.id ?? "";
  const isCommentThread = () => chat()?.kind === "broadcast" && !!params.postId;
  const feedMessages = () => {
    const all = messages();
    if (chat()?.kind !== "broadcast") return all;
    if (isCommentThread()) {
      const pid = params.postId!;
      return all.filter((m) => m.id === pid || m.replyTo?.id === pid);
    }
    return all.filter((m) => !m.replyTo);
  };

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
  const [composerPanel, setComposerPanel] = createSignal<ExpressionTab | null>(null);
  const [recording, setRecording] = createSignal(false);
  const [loadingOlder, setLoadingOlder] = createSignal(false);
  /** Time capsule armed for the next send (ISO), or null for "send now". */
  const [capsuleAt, setCapsuleAt] = createSignal<string | null>(null);
  const [capsuleOpen, setCapsuleOpen] = createSignal(false);
  const [webApp, setWebApp] = createSignal<{ url: string; messageId: string } | null>(null);

  createEffect(() => {
    const app = webApp();
    if (!app) return;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      if (d.atlasWebAppClose || d.eventType === "web_app_close") {
        setWebApp(null);
        return;
      }
      const payload = d.atlasWebAppData ?? d.data;
      if (typeof payload === "string" && payload) {
        void api.botCallback(chatId(), app.messageId, payload);
        setWebApp(null);
      }
    };
    window.addEventListener("message", onMsg);
    onCleanup(() => window.removeEventListener("message", onMsg));
  });
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
      () => chatId(),
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
        // A message that failed to decrypt earlier this session almost
        // always just raced the peer's identity-key publish — worth another
        // try every time you come back to look at this chat.
        messagesStore.retryFailedDecryptions(id, chat()?.peerUserId);
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
    if (c?.kind !== "group" && c?.kind !== "broadcast") return;
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
        .loadOlder(chatId(), chat()?.peerUserId)
        .then((count) => {
          if (count > 0 && scrollRef) {
            scrollRef.scrollTop += scrollRef.scrollHeight - anchorHeight;
          }
        })
        .finally(() => setLoadingOlder(false));
    }
  };

  const typingSubtitle = () => typingLabel(chatId(), (id) => authors()[id]?.name);

  /**
   * Live typing: the drafts other people are writing in this chat, right now.
   * Only ever populated when this device shares its own — the store enforces
   * the reciprocity, this just reads the result.
   */
  const liveDrafts = () =>
    Object.entries(chatsStore.typingPreview(chatId())).filter(([, text]) => text.trim().length > 0);

  const onDraftInput = (value: string) => {
    setDraft(value);
    const at = Date.now();
    // Live typing needs a much shorter interval than the plain indicator: the
    // point is watching a sentence form, and a 2.5s-stale draft isn't that.
    const interval = preferences.liveTyping ? LIVE_TYPING_INTERVAL_MS : 2500;
    if (at - lastTypingSent <= interval) return;
    if (preferences.liveTyping) {
      lastTypingSent = at;
      void chatsStore.sendTyping(chatId(), value);
    } else if (value.trim()) {
      lastTypingSent = at;
      void chatsStore.sendTyping(chatId());
    }
  };

  const encrypted = () => e2eeAvailable && !!chat()?.peerUserId && !chat()?.peerIsBot;
  const blocked = () => !!chat()?.blockedByMe || !!chat()?.blockedMe;

  const submit = async (e?: Event, overrideText?: string) => {
    e?.preventDefault();
    // The press that opened the capsule picker still ends in a click on a
    // submit button. Swallow exactly that one.
    if (holdOpenedPicker) {
      holdOpenedPicker = false;
      return;
    }
    const text = (overrideText ?? draft()).trim();
    const attachment = pendingAttachment();

    // Saving an edit reuses the composer but is a different operation: no
    // attachment, no capsule, no new row in the thread.
    const target = editing();
    if (target) {
      if (!text || sending()) return;
      setSending(true);
      try {
        await messagesStore.edit(chatId(), target, text, chat()?.peerUserId);
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
      const c = chat();
      await messagesStore.send(chatId(), text, {
        replyToId: reply?.id ?? (isCommentThread() ? params.postId : undefined),
        peerUserId: c?.peerUserId,
        attachmentId,
        attachmentPreview,
        unlockAt,
        group: c?.kind === "group",
        peerIsBot: c?.peerIsBot,
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

  const openCanvas = async () => {
    if (sending() || blocked()) return;
    try {
      const board = await api.createCanvas();
      const url = canvasShareUrl(board.id);
      await submit(undefined, url);
      await openNativeOrNavigate(navigate, `/canvas/${board.id}`);
    } catch {
      /* create failed */
    }
  };

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
          await messagesStore.send(chatId(), "", {
            attachmentId: attachment.id,
            peerUserId: chat()?.peerUserId,
            attachmentPreview: attachment,
            group: chat()?.kind === "group",
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
    if (message.failed)
      void messagesStore.retryFailed(chatId(), message, chat()?.peerUserId, chat()?.peerIsBot);
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

  const unsend = (message: Message) => void messagesStore.unsend(chatId(), message).catch(() => {});

  /**
   * Chat-header subtitle for a DM: typing beats co-presence beats online
   * beats last seen — most specific fact first, since each one implies the
   * ones below it.
   */
  const peerSubtitle = () => {
    const c = chat();
    if (!c) return "";
    const here = chatsStore.presentIn(chatId());
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
        <Show when={!isDesktop() || isCommentThread()}>
          <A
            href={isCommentThread() ? `/chat/${chatId()}` : "/"}
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
          >
            <BackIcon size={22} />
          </A>
        </Show>
        <Show when={chat()}>
          {(c) => (
            <>
              <button
                type="button"
                onClick={() => c().peerUserId && void openNativeOrNavigate(navigate, `/user/${c().peerUserId}`)}
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
                  atlasLogo={c().kind === "broadcast"}
                  systemKey={c().systemKey}
                />
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1.5 truncate font-semibold leading-tight">
                    <span class="truncate">{isCommentThread() ? t("chatView.commentsTitle") : c().systemKey ? t(`system.${c().systemKey}`) : c().name}</span>
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
                  <p class="flex items-center gap-1.5 truncate text-xs" classList={{ "text-accent animate-pulse": !!typingSubtitle(), "text-ink-subtle": !typingSubtitle() }}>
                    <Show when={!!typingSubtitle()}>
                      <GridLoader pattern="hollow" size="sm" class="shrink-0" />
                    </Show>
                    <span class="truncate">{typingSubtitle() ?? peerSubtitle()}</span>
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

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div class="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          data-wallpaper={preferences.wallpaper}
          class="h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 md:px-6"
        >
          <Show when={thread()?.loaded} fallback={<MessageListSkeleton />}>
            <Show
              when={messages().length > 0}
              fallback={
                <Show
                  when={chat()?.peerIsBot}
                  fallback={
                    <EmptyState
                      icon={ChatIcon}
                      title={t("chatView.noMessagesTitle")}
                      subtitle={t("chatView.noMessagesSubtitle")}
                    />
                  }
                >
                  <div class="mx-auto flex max-w-sm flex-col items-center gap-4 px-6 py-16 text-center">
                    <p class="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                      {chat()?.botWelcome || t("chatView.botWelcomeFallback")}
                    </p>
                    <button
                      type="button"
                      class="rounded-pill bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink"
                      onClick={() => {
                        const c = chat();
                        void messagesStore.send(chatId(), "/start", {
                          peerUserId: c?.peerUserId,
                          peerIsBot: true,
                        });
                      }}
                    >
                      {t("chatView.botStart")}
                    </button>
                  </div>
                </Show>
              }
            >
              <Show when={loadingOlder()}>
                <div class="flex justify-center py-2">
                  <SpinnerIcon size={18} class="animate-spin text-ink-subtle" />
                </div>
              </Show>
              <div class="flex w-full max-w-[40rem] flex-col">
                <For each={feedMessages()}>
                  {(message, i) => {
                    const list = () => feedMessages();
                    const groupable = (m: Message | undefined) => m && !m.callLog && !message.callLog;
                    const prev = () => list()[i() - 1];
                    const next = () => list()[i() + 1];
                    const isFirst = () => !groupable(prev()) || prev()!.authorId !== message.authorId;
                    const isLast = () => !groupable(next()) || next()!.authorId !== message.authorId;
                    const channelFeed = () => chat()?.kind === "broadcast" && !isCommentThread() && !message.replyTo;
                    const commenters = () => {
                      const seen = new Set<string>();
                      const out: { id: string; user?: User }[] = [];
                      for (const m of messages()) {
                        if (m.replyTo?.id !== message.id || seen.has(m.authorId)) continue;
                        seen.add(m.authorId);
                        out.push({ id: m.authorId, user: authors()[m.authorId] });
                        if (out.length >= 3) break;
                      }
                      return out;
                    };
                    const commentCount = () => messages().filter((m) => m.replyTo?.id === message.id).length;
                    return (
                      <div
                        onClick={() => bubbleRetry(message)}
                        classList={{
                          "mt-3": (isFirst() || !!message.callLog) && preferences.bubbleStyle !== "compact",
                          "mt-2": (isFirst() || !!message.callLog) && preferences.bubbleStyle === "compact",
                          "mt-[2px]": !isFirst() && !message.callLog,
                        }}
                      >
                        <MessageBubble
                          message={message}
                          chat={chat()}
                          author={authors()[message.authorId]}
                          isFirstInGroup={isFirst()}
                          isLastInGroup={isLast()}
                           onReply={(m) =>
                             chat()?.kind === "broadcast"
                               ? void openNativeOrNavigate(navigate, `/chat/${chatId()}/comments/${m.replyTo?.id ?? m.id}`)
                               : setReplyTo(m)
                           }
                          onActions={(m, anchor) => setActionsFor({ message: m, anchor })}
                          onButton={(btn) => {
                            if (btn.app) {
                              setWebApp({ url: btn.app, messageId: message.id });
                              return;
                            }
                            if (btn.data || btn.fetch) {
                              void api.botCallback(chatId(), message.id, btn.data || btn.fetch || "");
                              return;
                            }
                          }}
                          comments={
                            channelFeed()
                              ? {
                                  count: commentCount(),
                                  emptyLabel: t("chatView.leaveComment"),
                                  countLabel:
                                    commentCount() === 1
                                      ? t("chatView.commentCountOne")
                                      : t("chatView.commentsCount", { n: commentCount() }),
                                   onClick: () => void openNativeOrNavigate(navigate, `/chat/${chatId()}/comments/${message.id}`),
                                  leading:
                                    commenters().length > 0 ? (
                                      <span class="flex shrink-0 -space-x-1.5">
                                        <For each={commenters()}>
                                          {(c) => (
                                            <span class="rounded-full ring-2 ring-bubble-received">
                                              <Avatar
                                                size={16}
                                                color={c.user?.avatarColor ?? "#94a3b8"}
                                                initial={(c.user?.name?.[0] ?? "?").toUpperCase()}
                                                userId={c.id}
                                                hasPhoto={c.user?.hasAvatar}
                                              />
                                            </span>
                                          )}
                                        </For>
                                      </span>
                                    ) : undefined,
                                }
                              : undefined
                          }
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
              <div class="mt-2.5 flex w-full max-w-[40rem] justify-start">
                <div class="max-w-[86%] rounded-[1.1rem] rounded-bl-md border border-dashed border-accent/40 bg-bubble-received/60 px-3 py-1.5 text-bubble-received-ink md:max-w-[28rem]">
                  <div class="mb-0.5 flex items-center justify-between gap-2">
                    <Show when={chat()?.kind === "group"}>
                      <p class="truncate text-xs font-semibold text-accent">
                        {authors()[userId]?.name ?? t("chatView.someone")}
                      </p>
                    </Show>
                    <GridLoader pattern="hollow" size="sm" class="ml-auto shrink-0 opacity-75" />
                  </div>
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

      <div class="shrink-0 border-t border-border bg-bg">
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

        <Show when={!isCommentThread() ? replyTo() : undefined}>
          {(reply) => (
            <div class="rise-in flex items-center gap-2 px-4 pt-2">
              <div class="min-w-0 flex-1 rounded-lg border-l-2 border-accent bg-surface-raised px-2.5 py-1.5">
                <p class="text-xs font-semibold text-accent">
                  {chat()?.kind === "broadcast"
                    ? t("chatView.comment")
                    : reply().mine
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

        <Show when={blocked()}>
            <div class="flex items-center justify-center gap-2 px-4 pb-[max(var(--safe-bottom),1rem)] pt-3 text-sm text-ink-subtle">
              <ProhibitIcon size={16} />
              {chat()?.blockedByMe ? t("chatView.blockedByMe") : t("chatView.cantMessage")}
            </div>
        </Show>
        <Show when={!blocked() && chat()?.systemKey !== "replies" && chat()?.systemKey !== "incidents" && (chat()?.kind !== "broadcast" || isCommentThread())}>
        <form
          onSubmit={(e) => void submit(e)}
          class="w-full px-[max(var(--safe-left),0.75rem)] pb-[max(var(--safe-bottom),0.75rem)] pt-2.5"
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
          <Composer
            value={draft()}
            onChange={onDraftInput}
            disabled={sending() || uploading()}
            recording={recording()}
            forceSend={!!pendingAttachment()}
            placeholder={
              editing()
                ? t("chatView.editPlaceholder")
                : recording()
                  ? t("chatView.recordingPlaceholder")
                  : pendingAttachment()
                    ? t("chatView.captionPlaceholder")
                    : capsuleAt()
                      ? t("chatView.capsulePlaceholder")
                      : chat()?.kind === "broadcast"
                        ? t("chatView.commentPlaceholder")
                        : encrypted()
                          ? t("chatView.encryptedPlaceholder")
                          : t("chatView.messagePlaceholder")
            }
            addItems={
              editing()
                ? undefined
                : [
                    { id: "file", label: t("chatView.attachFileAria"), icon: <AttachIcon size={16} />, onSelect: pickFile },
                    { id: "emoji", label: t("emoji.custom.title"), icon: <SmileyIcon size={16} />, onSelect: () => setComposerPanel((p) => (p === "emoji" ? null : "emoji")) },
                    { id: "gif", label: t("gif.title"), icon: <ImageIcon size={16} />, onSelect: () => setComposerPanel((p) => (p === "gif" ? null : "gif")) },
                    { id: "fx", label: t("fx.title"), icon: <PaletteIcon size={16} />, onSelect: () => setComposerPanel((p) => (p === "fx" ? null : "fx")) },
                    {
                      id: "canvas",
                      section: t("canvas.integrations"),
                      label: t("canvas.title"),
                      icon: <EditIcon size={16} />,
                      onSelect: () => void openCanvas(),
                    },
                  ]
            }
            field={
              <RichComposerField
                value={draft()}
                onChange={onDraftInput}
                disabled={sending() || uploading() || recording()}
                placeholder={
                  editing()
                    ? t("chatView.editPlaceholder")
                    : recording()
                      ? t("chatView.recordingPlaceholder")
                      : pendingAttachment()
                        ? t("chatView.captionPlaceholder")
                        : capsuleAt()
                          ? t("chatView.capsulePlaceholder")
                          : chat()?.kind === "broadcast"
                            ? t("chatView.commentPlaceholder")
                            : encrypted()
                              ? t("chatView.encryptedPlaceholder")
                              : t("chatView.messagePlaceholder")
                }
                onSubmit={() => void submit()}
              />
            }
            tray={
              composerPanel() ? (
                <ExpressionTray
                  tab={composerPanel()!}
                  onTab={setComposerPanel}
                  onClose={() => setComposerPanel(null)}
                  onGif={(url) => {
                    setComposerPanel(null);
                    const next = draft().trim() ? `${draft().trim()} ${url}` : url;
                    void submit(undefined, next);
                  }}
                  onEmoji={(id) => {
                    onDraftInput((draft() ? `${draft()} ` : "") + emojiToken(id));
                  }}
                  onFx={(kind) => {
                    const base = unwrapFx(draft()).trim() || "Hey";
                    onDraftInput(wrapFx(base, kind));
                  }}
                  sample={unwrapFx(draft())}
                />
              ) : undefined
            }
            addIcon={uploading() ? <SpinnerIcon size={19} class="animate-spin" /> : undefined}
            addLabel={t("chatView.attachFileAria")}
            onVoice={() => (recording() ? stopRecording() : void startRecording())}
            onSubmit={() => void submit()}
            actionRef={(el) => (sendBtn = el)}
            onActionPointerDown={() => !editing() && startHold()}
            onActionPointerUp={cancelHold}
          />
        </form>
        </Show>
      </div>
      </div>

      {/* Chat menu: mute (encryption is always on for DMs — no toggle) */}
      <Menu open={menuOpen()} onOpenChange={setMenuOpen} anchorRef={() => menuBtn} placement="bottom-end">
        <Show when={chat()?.kind === "dm"}>
          <MenuItem
            onSelect={() => {
              setMenuOpen(false);
              if (!window.confirm(t("chatView.clearHistoryConfirm"))) return;
              void api.clearChatHistory(chatId()).then(() => messagesStore.clearLocal(chatId()));
            }}
          >
            <TrashIcon size={16} />
            <span>{t("chatView.clearHistory")}</span>
          </MenuItem>
        </Show>
        <Show when={chat()?.kind === "system"}>
          <MenuItem
            onSelect={() => {
              setMenuOpen(false);
              void setHidden(chatId(), !chat()?.hidden);
            }}
          >
            <span>{chat()?.hidden ? t("chatView.unhide") : t("chatView.hide")}</span>
          </MenuItem>
        </Show>
        <MenuItem
          onSelect={() => {
            setMenuOpen(false);
            void chatsStore.setMuted(chatId(), !chat()?.muted);
          }}
        >
          <Show when={chat()?.muted} fallback={<BellSlashIcon size={16} />}>
            <BellIcon size={16} />
          </Show>
          <span>{chat()?.muted ? t("chatView.unmute") : t("chatView.mute")}</span>
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
              <HourglassIcon size={16} />
              <span class="flex flex-col items-start">
                <span>{preset.label}</span>
                <Show when={preset.hint}>
                  <span class="text-xs text-ink-subtle">{preset.hint}</span>
                </Show>
              </span>
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
            <SendIcon size={16} />
            <span>{t("chatView.sendNowInsteadMenu")}</span>
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
                      <ReplyIcon size={16} />
                      <span>{t("chatView.reply")}</span>
                    </MenuItem>
                  </Show>
                  <Show when={canEdit(message())}>
                    <MenuItem onSelect={() => run(startEdit)}>
                      <EditIcon size={16} />
                      <span>{t("chatView.edit")}</span>
                    </MenuItem>
                  </Show>
                  <Show when={canUnsend(message())}>
                    <MenuItem onSelect={() => run(unsend)}>
                      <TrashIcon size={16} class="text-danger" />
                      <span class="text-danger">{t("chatView.unsend")}</span>
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

      <Show when={webApp()}>
        {(app) => (
          <div class="fixed inset-0 z-[80] flex flex-col bg-bg">
            <div class="flex items-center justify-between border-b border-border px-3 py-2">
              <span class="text-sm font-medium">{t("chatView.miniApp")}</span>
              <button type="button" class="rounded-pill px-3 py-1.5 text-sm text-ink-muted hover:bg-surface" onClick={() => setWebApp(null)}>
                {t("chatView.closeMiniApp")}
              </button>
            </div>
            <iframe
              class="min-h-0 flex-1 border-0 bg-white"
              src={app().url}
              title={t("chatView.miniApp")}
              sandbox="allow-scripts allow-forms"
            />
          </div>
        )}
      </Show>
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
