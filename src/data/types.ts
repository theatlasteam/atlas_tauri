// View-model types used by the UI, plus re-exports of the wire types that are
// generated from the Rust server via ts-rs (src/data/generated — do not edit).

export type { UserDto, ChatDto, MessageDto, AttachmentDto, ReactionDto, ReplyPreviewDto, FolderDto } from "./generated";
export type { ServerEvent, ClientMsg } from "./generated";

import type { AttachmentDto, ReactionDto } from "./generated";

export interface User {
  id: string;
  name: string;
  handle: string;
  status: string;
  bio: string;
  avatarColor: string;
  avatarInitial: string;
  /** True if the user has a profile photo — fetch it via avatarUrl(id). */
  hasAvatar: boolean;
  lastSeenAt?: string;
}

/** Parsed body of a "call-log" message. */
export interface CallLog {
  media: "audio" | "video";
  outcome: "completed" | "missed" | "declined" | "canceled";
  durationSecs: number | null;
  calleeId: string;
}

export interface Message {
  id: string;
  chatId: string;
  authorId: string;
  /** Display text: plaintext, decrypted E2EE text, or a placeholder. */
  text: string;
  scheme: string;
  sentAt: string; // ISO timestamp
  mine: boolean;
  replyTo?: { id: string; authorId: string; text: string };
  attachment?: AttachmentDto;
  reactions: ReactionDto[];
  callLog?: CallLog;
  /** True while an E2EE body is still being decrypted. */
  decrypting?: boolean;
  /** Optimistic-send bookkeeping. */
  pending?: boolean;
  failed?: boolean;
  clientTag?: string;
}

export interface Chat {
  id: string;
  kind: "dm" | "group";
  name: string;
  avatarColor: string;
  avatarInitial: string;
  peerUserId?: string;
  lastMessage: string;
  lastMessageAt: string; // ISO timestamp ("" when empty chat)
  unreadCount: number;
  folderIds: string[];
  online?: boolean;
  muted?: boolean;
  memberCount: number;
  /** DM peer's read cursor (message id) for ✓✓ rendering. */
  peerReadUpTo?: string;
  /** DM only: does the peer have a profile photo (fetch via avatarUrl(peerUserId)). */
  peerHasAvatar?: boolean;
}

export interface Folder {
  id: string;
  name: string;
}

export interface NotificationSound {
  id: string;
  name: string;
}

export interface Wallpaper {
  id: string;
  name: string;
  preview: string; // css gradient/background for swatch
}

export type ThemeMode = "light" | "dark" | "system";
export type AccentId =
  | "amber"
  | "jade"
  | "violet"
  | "rose"
  | "slate"
  | "sky"
  | "teal"
  | "coral"
  | "indigo"
  | "plum";
export type FontId = "inter" | "system" | "serif" | "mono";
export type FontSize = "sm" | "md" | "lg" | "xl";

export type ConnectionState = "connecting" | "online" | "offline";
