// DTO -> view-model conversion shared by the stores.

import type { ChatDto, MessageDto, ReplyPreviewDto, UserDto } from "./generated";
import type { CallLog, Chat, Message, SpacePointer, User } from "./types";

/**
 * The one UserDto -> User conversion.
 *
 * There used to be two, in session.ts and repository.ts, and they disagreed:
 * one stored `handle` verbatim, the other prefixed it with "@". Since screens
 * render "@{user.handle}" and compare `handle === "atlas"`, which mapper a
 * given User came from silently changed what both did. `handle` is the bare
 * handle the server sent; the "@" is presentation and belongs in the markup.
 */
export function toUser(dto: UserDto): User {
  return {
    id: dto.id,
    name: dto.name,
    handle: dto.handle,
    status: dto.status,
    bio: dto.bio,
    avatarColor: dto.avatarColor,
    avatarInitial: dto.avatarInitial,
    hasAvatar: dto.hasAvatar,
    lastSeenAt: dto.lastSeenAt,
    verified: dto.verified,
    readReceipts: dto.readReceipts,
    lastSeenVisible: dto.lastSeenVisible,
  };
}

export function parseCallLog(body: string): CallLog | undefined {
  try {
    const data = JSON.parse(body);
    if (data && typeof data === "object" && typeof data.media === "string") {
      return data as CallLog;
    }
  } catch {
    /* not a call log */
  }
  return undefined;
}

/** A "space" message's body is `{"spaceId":"..."}` — see server/src/spaces.rs. */
export function parseSpace(body: string): SpacePointer | undefined {
  try {
    const data = JSON.parse(body);
    if (data && typeof data === "object" && typeof data.spaceId === "string") {
      return { id: data.spaceId };
    }
  } catch {
    /* not a space pointer */
  }
  return undefined;
}

/** Text shown before/without decryption. */
export function initialText(dto: MessageDto): string {
  if (dto.deleted) return "Message deleted";
  // A sealed capsule has no body to show yet — the bubble renders a countdown
  // instead, so this text only ever surfaces in list previews.
  if (dto.sealed) return "⏳ Time capsule";
  if (dto.scheme === "plain") return dto.body;
  if (dto.scheme === "space") return "🧩 Atlas Space";
  if (dto.scheme === "call-log") {
    const log = parseCallLog(dto.body);
    if (!log) return "Call";
    const media = log.media === "video" ? "Video call" : "Voice call";
    switch (log.outcome) {
      case "completed":
        return `${media} · ${formatDuration(log.durationSecs ?? 0)}`;
      case "missed":
        return `Missed ${media.toLowerCase()}`;
      case "declined":
        return `Declined ${media.toLowerCase()}`;
      case "canceled":
        return `Canceled ${media.toLowerCase()}`;
    }
  }
  return "🔒 Encrypted message";
}

export function formatDuration(totalSecs: number): string {
  const mins = Math.floor(totalSecs / 60);
  const secs = Math.round(totalSecs % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/** Quoted preview of the message a reply points at. */
function toReplyPreview(dto: ReplyPreviewDto): Message["replyTo"] {
  // The server blanks a quote of anything that has no readable content — a
  // capsule that hasn't opened, a message that was unsent — so a quote can
  // never be used as a peephole into either.
  const PLACEHOLDERS: Record<string, string> = {
    sealed: "⏳ Time capsule",
    deleted: "Message deleted",
  };
  const text =
    dto.scheme === "plain"
      ? dto.body
      : (PLACEHOLDERS[dto.scheme] ?? "🔒 Encrypted message");
  return { id: dto.id, authorId: dto.authorId, text };
}

export function toMessage(dto: MessageDto, myUserId: string): Message {
  // A sealed capsule and an unsent message both carry no ciphertext to work
  // on: the first until it opens and the client refetches it, the second ever.
  const isE2ee =
    !dto.sealed &&
    !dto.deleted &&
    dto.scheme !== "plain" &&
    dto.scheme !== "call-log" &&
    dto.scheme !== "space";
  return {
    id: dto.id,
    chatId: dto.chatId,
    authorId: dto.authorId,
    text: initialText(dto),
    scheme: dto.scheme,
    sentAt: dto.sentAt,
    mine: dto.authorId === myUserId,
    replyTo: dto.replyTo ? toReplyPreview(dto.replyTo) : undefined,
    attachment: dto.attachment ?? undefined,
    reactions: dto.reactions,
    callLog: dto.scheme === "call-log" ? parseCallLog(dto.body) : undefined,
    space: dto.scheme === "space" ? parseSpace(dto.body) : undefined,
    unlockAt: dto.unlockAt ?? undefined,
    sealed: dto.sealed,
    editedAt: dto.editedAt ?? undefined,
    deleted: dto.deleted,
    decrypting: isE2ee,
  };
}

/** Chat-list preview line for a message. */
export function previewText(message: Message): string {
  if (message.deleted) return "Message deleted";
  if (message.sealed) return "⏳ Time capsule";
  if (message.space) return "🧩 Atlas Space";
  if (message.attachment) {
    switch (message.attachment.kind) {
      case "image":
        return "📷 Photo";
      case "voice":
        return "🎤 Voice message";
      default:
        return `📎 ${message.attachment.filename || "File"}`;
    }
  }
  return message.text;
}

export function toChat(dto: ChatDto, myUserId: string): Chat {
  const last = dto.lastMessage ? toMessage(dto.lastMessage, myUserId) : null;
  return {
    id: dto.id,
    kind: dto.kind as Chat["kind"],
    name: dto.name,
    avatarColor: dto.avatarColor,
    avatarInitial: dto.avatarInitial,
    peerUserId: dto.peerUserId,
    lastMessage: last ? previewText(last) : "",
    lastMessageAt: last?.sentAt ?? "",
    unreadCount: dto.unreadCount,
    folderIds: dto.folderIds,
    online: dto.online,
    muted: dto.muted,
    memberCount: dto.memberCount,
    peerReadUpTo: dto.peerReadUpTo ?? undefined,
    peerHasAvatar: dto.peerHasAvatar,
    peerVerified: dto.peerVerified,
    peerLastSeenAt: dto.peerLastSeenAt ?? undefined,
    blockedByMe: dto.blockedByMe,
    blockedMe: dto.blockedMe,
  };
}
