import { MessageSurface, Twemoji, type MessageButton, type MessageComments } from "@atlas/ui";
import { createEffect, createResource, createSignal, For, on, onCleanup, Show } from "solid-js";
import { api } from "../data/api";
import Avatar from "./Avatar";
import VerifiedBadge from "./VerifiedBadge";
import type { Chat, Message, User } from "../data/types";
import {
  formatBytes,
  formatClockTime,
  formatCountdown,
  formatMediaClock,
  formatUnlockAt,
  now,
} from "../lib/time";
import { session } from "../store/session";
import { preferences } from "../store/preferences";
import { useIsDesktopLayout } from "../lib/platform";
import { messagesStore } from "../store/messages";
import {
  CheckIcon,
  ChecksIcon,
  DotsIcon,
  DownloadIcon,
  HourglassIcon,
  LockIcon,
  PauseIcon,
  PhoneIcon,
  PhoneSlashIcon,
  PlayIcon,
  ProhibitIcon,
  ReplyIcon,
  SpinnerIcon,
  VideoIcon,
} from "../icons";
import { t } from "../lib/i18n";
import EffectText from "./EffectText";
import LinkEmbeds from "./LinkEmbeds";
import CustomEmoji from "./CustomEmoji";
import { captionForEmbeds } from "../lib/linkEmbeds";
import { unwrapFx } from "../lib/textEffects";
import { splitCustomEmoji } from "../lib/customEmoji";

/**
 * How long a press has to be held to count as "hold for more".
 *
 * Exported so the composer's hold-to-schedule uses the same number: two
 * hold gestures in one app that trigger at different times feel like a bug in
 * whichever one you learn second.
 */
export const HOLD_MS = 450;

// Object-URL cache so scrolling doesn't refetch attachment bytes.
//
// Bounded, because every entry pins its blob in memory for the lifetime of the
// page: an unbounded map meant scrolling far enough back through an image-heavy
// chat grew the tab until it was killed. Oldest-first eviction revokes the URL,
// which is what actually releases the bytes — dropping the map entry alone
// would not.
const MAX_CACHED_ATTACHMENTS = 64;
const urlCache = new Map<string, Promise<string>>();

function attachmentUrl(id: string): Promise<string> {
  const cached = urlCache.get(id);
  if (cached) {
    // Refresh recency: re-inserting moves the key to the end of the Map's
    // insertion order, which is the eviction order below.
    urlCache.delete(id);
    urlCache.set(id, cached);
    return cached;
  }
  const pending = api.fetchAttachmentUrl(id);
  pending.catch(() => urlCache.delete(id));
  urlCache.set(id, pending);

  while (urlCache.size > MAX_CACHED_ATTACHMENTS) {
    const [oldestId, oldestUrl] = urlCache.entries().next().value!;
    urlCache.delete(oldestId);
    void oldestUrl.then(URL.revokeObjectURL).catch(() => {});
  }
  return pending;
}

function ImageAttachment(props: { id: string; width?: number | null; height?: number | null }) {
  const [url] = createResource(() => props.id, attachmentUrl);
  const ratio = () => (props.width && props.height ? `${props.width} / ${props.height}` : undefined);
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
      <img src={url()} alt="" class="max-h-80 w-full rounded-xl object-cover" style={{ "aspect-ratio": ratio() }} />
    </Show>
  );
}

function VoiceAttachment(props: { id: string; durationMs?: number | null }) {
  const [playing, setPlaying] = createSignal(false);
  const [elapsedMs, setElapsedMs] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  let audio: HTMLAudioElement | undefined;

  /** Recorded length until the element knows better (it may not be seekable). */
  const totalMs = () => {
    const fromElement = audio?.duration;
    if (fromElement && Number.isFinite(fromElement)) return fromElement * 1000;
    return props.durationMs ?? 0;
  };

  const progress = () => {
    const total = totalMs();
    return total > 0 ? Math.min(100, (elapsedMs() / total) * 100) : 0;
  };

  const toggle = async () => {
    if (!audio) return;
    if (playing()) {
      audio.pause();
      return;
    }
    if (!audio.src) {
      setLoading(true);
      try {
        audio.src = await attachmentUrl(props.id);
      } finally {
        setLoading(false);
      }
    }
    await audio.play().catch(() => setPlaying(false));
  };

  /** Scrub by clicking the bar. */
  const seek = (e: MouseEvent) => {
    const total = totalMs();
    if (!audio || total <= 0 || !audio.src) return;
    const bar = e.currentTarget as HTMLElement;
    const fraction = (e.clientX - bar.getBoundingClientRect().left) / bar.clientWidth;
    audio.currentTime = (Math.max(0, Math.min(1, fraction)) * total) / 1000;
  };

  return (
    <div class="flex min-w-44 items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={toggle}
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/15 transition-transform duration-150 active:scale-90"
        aria-label={playing() ? t("messageBubble.pauseVoiceAria") : t("messageBubble.playVoiceAria")}
      >
        <Show when={!loading()} fallback={<SpinnerIcon size={16} class="animate-spin" />}>
          <Show when={playing()} fallback={<PlayIcon size={16} />}>
            <PauseIcon size={16} />
          </Show>
        </Show>
      </button>
      {/* The bar used to be permanently empty — a progress indicator that never
          moved. It now tracks playback and doubles as a scrubber. */}
      <span
        onClick={seek}
        class="h-1.5 flex-1 cursor-pointer rounded-full bg-current/20"
        role="presentation"
      >
        <span
          class="block h-full rounded-full bg-current/60 transition-[width] duration-100"
          style={{ width: `${progress()}%` }}
        />
      </span>
      <span class="shrink-0 text-xs tabular-nums opacity-70">
        {formatMediaClock(playing() || elapsedMs() > 0 ? elapsedMs() : totalMs())}
      </span>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setElapsedMs((audio?.currentTime ?? 0) * 1000)}
        onEnded={() => {
          setPlaying(false);
          setElapsedMs(0);
        }}
      />
    </div>
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
        <span class="block truncate text-sm">{props.filename || t("messageBubble.file")}</span>
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
        <Show when={log().media === "video"} fallback={missed() ? <PhoneSlashIcon size={16} /> : <PhoneIcon size={16} />}>
          <VideoIcon size={16} />
        </Show>
      </span>
      <span class="text-sm">{props.message.text}</span>
    </div>
  );
}

/**
 * A time capsule that hasn't opened yet.
 *
 * The recipient sees the shape of the thing and when it opens, never its
 * contents — the server hasn't sent them. When the countdown reaches zero the
 * bubble asks for the message again, which is what turns a capsule into an
 * ordinary message in place, without a refresh or a re-sort of the thread.
 */
function SealedCapsule(props: { message: Message; peerUserId?: string }) {
  const unlockAt = () => props.message.unlockAt!;
  const [opening, setOpening] = createSignal(false);

  createEffect(
    on(now, () => {
      if (opening() || new Date(unlockAt()).getTime() > now()) return;
      setOpening(true);
      void messagesStore
        .refresh(props.message.id, props.peerUserId)
        // Servers and devices disagree about the time by a second or two; if
        // the refetch comes back still sealed, allow another attempt on a
        // later tick rather than leaving the bubble stuck.
        .finally(() => setOpening(false));
    }),
  );

  return (
    <div class="flex items-center gap-2.5 py-0.5">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/15">
        <HourglassIcon size={17} />
      </span>
      <span class="min-w-0">
        <span class="block text-sm font-semibold">{t("messageBubble.timeCapsule")}</span>
        <span class="block text-xs tabular-nums opacity-75">
          {t("messageBubble.opensIn", { countdown: formatCountdown(unlockAt()), at: formatUnlockAt(unlockAt()) })}
        </span>
      </span>
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
  /** Open the message-actions sheet (reactions, reply, edit, unsend). */
  onActions: (message: Message, anchor: HTMLElement) => void;
  /** Channel comments. Omit on DMs/groups so the bubble stays as wide as its text. */
  comments?: MessageComments;
  /** Bot / channel inline keyboard. */
  onButton?: (button: {
    label: string;
    url?: string;
    data?: string;
    app?: string;
    fetch?: string;
    edit?: boolean;
  }) => void;
}) {
  const isFirst = () => props.isFirstInGroup ?? true;
  const isLast = () => props.isLastInGroup ?? true;
  const m = () => props.message;
  const mine = () => m().mine;
  const myId = () => session.user()?.id ?? "";
  const isGroupChat = () => props.chat?.kind === "group" || props.chat?.kind === "broadcast";

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
  /**
   * Press-and-hold is the *only* way into a message's actions on a phone —
   * the hover row below is `sm:` and up — so it opens the full sheet, not
   * just the reaction row.
   */
  const startPress = () => {
    pressTimer = setTimeout(() => props.onActions(m(), bubbleRef!), HOLD_MS);
  };
  const cancelPress = () => pressTimer && clearTimeout(pressTimer);
  onCleanup(cancelPress);

  // A tombstone keeps the scheme of what it replaced; showing its padlock
  // would advertise the confidentiality of a message that no longer exists.
  const isE2ee = () => !m().deleted && m().scheme !== "plain" && m().scheme !== "call-log";
  const hasReactions = () => m().reactions.length > 0;
  /**
   * A capsule whose body is still withheld. The server seals capsules from
   * everyone including their author, so this is one flag rather than a
   * per-viewer judgement — and no bubble needs to consult the clock to decide
   * what it is allowed to show.
   */
  const sealed = () => !!m().sealed;
  const isDesktop = useIsDesktopLayout();
  const compact = () => preferences.bubbleStyle === "compact" && isDesktop();
  const keyboard = (): MessageButton[] | undefined => {
    const list = m().buttons;
    if (!list?.length) return undefined;
    return list.map((b) => ({
      label: b.label,
      url: b.app ? undefined : b.url || undefined,
      data: b.data || undefined,
      icon: b.icon || undefined,
      row: b.row,
      onClick:
        b.data || b.app || b.fetch
          ? () =>
              props.onButton?.({
                label: b.label,
                url: b.url,
                data: b.data,
                app: b.app,
                fetch: b.fetch,
                edit: b.edit,
              })
          : undefined,
    }));
  };

  const compactName = () =>
    mine()
      ? (session.user()?.name ?? t("appearance.previewYou"))
      : (props.author?.name ?? props.chat?.name ?? "");

  return (
    <Show
      when={compact()}
      fallback={
    <div
      class="flex flex-col items-start"
      classList={{
        "mb-2": hasReactions(),
      }}
    >
      <div class="bubble-in group flex w-full items-end justify-start gap-1">
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

        <div class="relative w-fit max-w-[86%] md:max-w-[28rem]">
          <MessageSurface
            side={mine() ? "sent" : "received"}
            comments={props.comments}
            keyboard={keyboard()}
            ref={bubbleRef}
            onDblClick={() => props.onReply(m())}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onTouchCancel={cancelPress}
            // Without this, a long press races our own handler: Android pops
            // the text-selection toolbar and iOS the callout, over the sheet.
            // Selection still works on desktop, where the gesture doesn't exist.
            onContextMenu={(e) => e.preventDefault()}
            class="shadow-sm transition-opacity [-webkit-touch-callout:none]"
            classList={{
              "bg-bubble-sent text-bubble-sent-ink": mine(),
              "bg-bubble-received text-bubble-received-ink": !mine(),
              "rounded-tl-[6px]": !isFirst(),
              "rounded-bl-[6px]": !isLast(),
              "rounded-bl-[5px]": isLast(),
              "opacity-60": !!m().pending,
              "outline outline-1 outline-danger/50": !!m().failed,
              // A sealed capsule reads as a different kind of object: dashed
              // edge, so it's obviously not an ordinary message you can read.
              "outline outline-1 outline-dashed outline-current/40": sealed(),
              // A tombstone is not a message; drop the colour with it.
              "!bg-transparent outline outline-1 outline-border": !!m().deleted,
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

            <Show when={!m().deleted} fallback={<DeletedBubble mine={mine()} />}>
              <Show
                when={!sealed()}
                fallback={<SealedCapsule message={m()} peerUserId={props.chat?.peerUserId} />}
              >
                <Show when={m().callLog} fallback={<MessageBody message={m()} />}>
                  <CallLogBubble message={m()} />
                </Show>
              </Show>
            </Show>
          </MessageSurface>

          {/* Reactions overlap the bottom edge of the bubble, like every
              messenger worth its salt — kept outside the bubble so they don't
              distort its shape or padding. */}
          <Show when={hasReactions()}>
            <div class="absolute -bottom-2.5 left-2 flex max-w-full flex-wrap gap-1">
              <For each={m().reactions}>
                {(reaction) => (
                  <button
                    type="button"
                    onClick={() => void messagesStore.toggleReaction(m(), reaction.emoji)}
                    class="flex items-center gap-1 rounded-pill border border-black/5 bg-surface px-1.5 py-0.5 text-xs shadow-sm transition-transform duration-150 hover:scale-110 active:scale-90"
                    classList={{ "ring-1 ring-accent/60 font-semibold": reaction.userIds.includes(myId()) }}
                  >
                    <span>{reaction.emoji}</span>
                    <span class="text-[0.7rem] opacity-70">{reaction.userIds.length}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <BubbleActions message={m()} onReply={props.onReply} onActions={props.onActions} />
      </div>

      {/* Timestamp + delivery status: only on the last bubble of a group,
          living outside the colored bubble like every real messenger does. */}
      <Show when={isLast()}>
        <p
          class="mt-1 flex items-center gap-1 px-1 text-[0.7em] text-ink-subtle"
          classList={{ "ml-7": !mine() && isGroupChat() }}
        >
          <Show when={m().failed}>
            <span class="font-semibold text-danger">{t("messageBubble.failedRetry")}</span>
          </Show>
          <Show when={isE2ee()}>
            <LockIcon size={11} />
          </Show>
          <Show when={m().unlockAt}>
            <HourglassIcon size={11} />
          </Show>
          <span>{formatClockTime(m().sentAt)}</span>
          <Show when={m().editedAt && !m().deleted}>
            <span title={t("messageBubble.editedTitle", { time: formatClockTime(m().editedAt!) })}>
              {t("messageBubble.editedLabel")}
            </span>
          </Show>
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
      }
    >
      <div class="group flex w-full gap-2.5">
        <div class="w-9 shrink-0 pt-0.5">
          <Show when={isFirst()}>
            <Avatar
              size={36}
              color={mine() ? (session.user()?.avatarColor ?? "#94a3b8") : (props.author?.avatarColor ?? props.chat?.avatarColor ?? "#94a3b8")}
              initial={
                mine()
                  ? (session.user()?.avatarInitial ?? "Y")
                  : (props.author?.name?.[0] ?? props.chat?.avatarInitial ?? "?").toUpperCase()
              }
              userId={mine() ? session.user()?.id : (props.author?.id ?? props.chat?.peerUserId)}
              hasPhoto={mine() ? session.user()?.hasAvatar : (props.author?.hasAvatar ?? props.chat?.peerHasAvatar)}
            />
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <Show when={isFirst()}>
            <p class="mb-0.5 flex items-baseline gap-2">
              <span class="truncate text-[13px] font-semibold text-ink">{compactName()}</span>
              <span class="shrink-0 text-[11px] text-ink-subtle">{formatClockTime(m().sentAt)}</span>
              <Show when={isE2ee()}>
                <LockIcon size={11} class="text-ink-subtle" />
              </Show>
              <Show when={receipt() === "read"}>
                <ChecksIcon size={13} class="text-accent" />
              </Show>
            </p>
          </Show>
          <div
            ref={bubbleRef}
            class="text-[15px] leading-snug text-ink"
            classList={{ "opacity-60": !!m().pending, "text-danger": !!m().failed }}
            onDblClick={() => props.onReply(m())}
            onTouchStart={startPress}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            onTouchCancel={cancelPress}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Show when={m().replyTo}>
              {(reply) => (
                <div class="mb-1 rounded-md border-l-2 border-accent/50 bg-surface px-2 py-1">
                  <p class="line-clamp-2 text-xs text-ink-muted">{reply().text}</p>
                </div>
              )}
            </Show>
            <Show when={!m().deleted} fallback={<DeletedBubble mine={mine()} />}>
              <Show
                when={!sealed()}
                fallback={<SealedCapsule message={m()} peerUserId={props.chat?.peerUserId} />}
              >
                <Show when={m().callLog} fallback={<MessageBody message={m()} />}>
                  <CallLogBubble message={m()} />
                </Show>
              </Show>
            </Show>
            <Show when={keyboard()?.length}>
              <div class="mt-1.5 w-full max-w-[28rem]">
                <InlineKeyboard buttons={keyboard()!} />
              </div>
            </Show>
          </div>
          <Show when={hasReactions()}>
            <div class="mt-1 flex flex-wrap gap-1">
              <For each={m().reactions}>
                {(reaction) => (
                  <button
                    type="button"
                    onClick={() => void messagesStore.toggleReaction(m(), reaction.emoji)}
                    class="flex items-center gap-1 rounded-pill border border-black/5 bg-surface px-1.5 py-0.5 text-xs shadow-sm"
                    classList={{ "ring-1 ring-accent/60 font-semibold": reaction.userIds.includes(myId()) }}
                  >
                    <span>{reaction.emoji}</span>
                    <span class="text-[0.7rem] opacity-70">{reaction.userIds.length}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
        <BubbleActions message={m()} onReply={props.onReply} onActions={props.onActions} />
      </div>
    </Show>
  );
}

function InlineKeyboard(props: { buttons: MessageButton[] }) {
  const rows = () => {
    const buttons = props.buttons;
    if (!buttons.length) return [] as MessageButton[][];
    const hasRow = buttons.some((b) => b.row != null && b.row > 0);
    if (!hasRow) {
      const cols = buttons.length <= 3 ? buttons.length : 2;
      const out: MessageButton[][] = [];
      for (let i = 0; i < buttons.length; i += cols) out.push(buttons.slice(i, i + cols));
      return out;
    }
    const map = new Map<number, MessageButton[]>();
    for (const b of buttons) {
      const r = b.row ?? 0;
      const list = map.get(r) ?? [];
      list.push(b);
      map.set(r, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  };
  return (
    <div class="flex flex-col gap-1">
      <For each={rows()}>
        {(row) => (
          <div class="grid gap-1" style={{ "grid-template-columns": `repeat(${row.length}, minmax(0, 1fr))` }}>
            <For each={row}>
              {(b) => {
                const inner = (
                  <span class="flex min-h-11 items-center justify-center gap-1 px-2 py-1.5 text-[13px] font-medium leading-none">
                    <Show when={b.icon}>
                      <Twemoji emoji={b.icon!} size={16} />
                    </Show>
                    <span class="truncate">{b.label}</span>
                  </span>
                );
                const cls =
                  "atlas-focus block rounded-xl bg-surface text-center text-ink no-underline ring-1 ring-border transition hover:bg-accent-soft";
                if (b.url) {
                  return (
                    <a href={b.url} target={b.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" class={cls} onClick={(e) => e.stopPropagation()}>
                      {inner}
                    </a>
                  );
                }
                return (
                  <button type="button" class={cls} onClick={(e) => { e.stopPropagation(); b.onClick?.(e); }}>
                    {inner}
                  </button>
                );
              }}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

/** What's left of a message its author took back. */
function DeletedBubble(props: { mine: boolean }) {
  return (
    <p class="flex items-center gap-1.5 text-[0.95em] italic leading-snug text-ink-subtle">
      <ProhibitIcon size={13} />
      {props.mine ? t("messageBubble.youUnsent") : t("messageBubble.messageDeleted")}
    </p>
  );
}

function MessageBody(props: { message: Message }) {
  const m = () => props.message;
  return (
    <>
      <Show when={m().attachment}>
        {(att) => (
          <div class="-mx-1 mb-1 mt-0.5 overflow-hidden rounded-xl" classList={{ "mb-0": !m().text }}>
            <Show when={att().kind === "image"}>
              <ImageAttachment id={att().id} width={att().width} height={att().height} />
              <Show when={att().title}>
                <p class="mt-1 px-1 text-xs font-medium text-ink">{att().title}</p>
              </Show>
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
      <Show when={m().text && m().text.trim()}>
        <Show
          when={!m().decrypting}
          fallback={
            <p class="whitespace-pre-wrap break-words text-[0.95em] italic leading-snug opacity-70">
              {t("messageBubble.decrypting")}
            </p>
          }
        >
          <For each={splitCustomEmoji(captionForEmbeds(m().text))}>
            {(part) => (
              <Show when={part.type === "ce" ? part.id : false} fallback={
                <Show when={part.type === "text" && part.text}>
                  <EffectText text={part.type === "text" ? part.text : ""} class="text-[0.95em] leading-snug" />
                </Show>
              }>
                {(id) => <CustomEmoji id={id()} size={32} />}
              </Show>
            )}
          </For>
          <LinkEmbeds text={unwrapFx(m().text)} />
        </Show>
      </Show>

    </>
  );
}

function BubbleActions(props: {
  message: Message;
  onReply: (message: Message) => void;
  onActions: (message: Message, anchor: HTMLElement) => void;
}) {
  let moreBtn: HTMLButtonElement | undefined;
  const action =
    "flex h-7 w-7 items-center justify-center rounded-full text-ink-subtle transition-[background-color,transform] duration-150 hover:bg-surface active:scale-90";

  const m = () => props.message;
  /** A tombstone has nothing to quote or act on. */
  const inert = () => !!m().deleted;

  return (
    <div class="mb-1 hidden shrink-0 items-center gap-0.5 self-end opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
      {/* Reply stays a one-click shortcut because it is by far the most
          frequent action; everything else lives behind the same sheet the
          phone reaches by pressing and holding, so no action can end up
          desktop-only again. Phosphor icons rather than literal "↩" glyphs,
          which rendered at a different size and weight on every platform. */}
      <Show when={!inert()}>
        <button
          type="button"
          onClick={() => props.onReply(m())}
          class={action}
          aria-label={t("messageBubble.replyAria")}
          title={t("messageBubble.replyAria")}
        >
          <ReplyIcon size={16} />
        </button>
      </Show>
      <button
        ref={moreBtn}
        type="button"
        onClick={() => props.onActions(m(), moreBtn!)}
        class={action}
        aria-label={t("messageBubble.moreAria")}
        title={t("messageBubble.moreTitle")}
      >
        <DotsIcon size={16} />
      </button>
    </div>
  );
}
