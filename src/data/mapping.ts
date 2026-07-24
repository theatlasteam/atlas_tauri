// DTO -> view-model conversion shared by the stores.

import type { ChatDto, MessageDto } from "./generated";
import type { CallLog, Chat, Message } from "./types";

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

/** Text shown before/without decryption. */
export function initialText(dto: MessageDto): string {
  if (dto.scheme === "plain") return dto.body;
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

export function toMessage(dto: MessageDto, myUserId: string): Message {
  const isE2ee = dto.scheme !== "plain" && dto.scheme !== "call-log";
  return {
    id: dto.id,
    chatId: dto.chatId,
    authorId: dto.authorId,
    text: initialText(dto),
    scheme: dto.scheme,
    sentAt: dto.sentAt,
    mine: dto.authorId === myUserId,
    replyTo: dto.replyTo
      ? {
          id: dto.replyTo.id,
          authorId: dto.replyTo.authorId,
          text: dto.replyTo.scheme === "plain" ? dto.replyTo.body : "🔒 Encrypted message",
        }
      : undefined,
    attachment: dto.attachment ?? undefined,
    reactions: dto.reactions,
    callLog: dto.scheme === "call-log" ? parseCallLog(dto.body) : undefined,
    decrypting: isE2ee,
  };
}

/** Chat-list preview line for a message. */
export function previewText(message: Message): string {
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
  };
}
