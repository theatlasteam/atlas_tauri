// View-model types used by the UI, plus re-exports of the wire types that are
// generated from the Rust server via ts-rs (src/data/generated — do not edit).

export type { UserDto, ChatDto, MessageDto, AttachmentDto, ReactionDto, ReplyPreviewDto, FolderDto, BlockDto, SpaceDto } from "./generated";
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
  verified: boolean;
  /** Privacy switches, enforced server-side (see Privacy settings). */
  readReceipts: boolean;
  lastSeenVisible: boolean;
}

/** Parsed body of a "call-log" message. */
export interface CallLog {
  media: "audio" | "video";
  outcome: "completed" | "missed" | "declined" | "canceled";
  durationSecs: number | null;
  calleeId: string;
}

/** Parsed body of a "space" message: a pointer to an Atlas Space (see SpaceDto). */
export interface SpacePointer {
  id: string;
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
  /** Set when scheme === "space" — points at the shared Atlas Space. */
  space?: SpacePointer;
  /** Time capsule: when this message becomes readable (ISO timestamp). */
  unlockAt?: string;
  /** True while the capsule is still shut — the server withheld the body. */
  sealed?: boolean;
  /** Set when the author has rewritten the body since sending it. */
  editedAt?: string;
  /** Unsent by its author: a tombstone with no content. */
  deleted?: boolean;
  /**
   * The plaintext of an outgoing message, kept only on optimistic and failed
   * rows. `text` may be a placeholder (a sealed capsule shows one), so a retry
   * has to resend this rather than what the bubble happens to be displaying.
   */
  sourceText?: string;
  /** True while an E2EE body is still being decrypted. */
  decrypting?: boolean;
  /**
   * Set when every decrypt attempt failed — almost always because the
   * peer's identity key hadn't propagated yet at receive time, not a real
   * crypto failure. Lets the chat re-attempt these on open rather than the
   * "Unable to decrypt" placeholder being permanent for the rest of the
   * session (see messages.ts::retryFailedDecryptions).
   */
  decryptFailed?: boolean;
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
  /** DM only: does the peer carry the verified checkmark. */
  peerVerified?: boolean;
  /** DM only: when the peer was last online — absent if they hide it. */
  peerLastSeenAt?: string;
  /** DM only: have I blocked the peer. */
  blockedByMe?: boolean;
  /** DM only: has the peer blocked me. */
  blockedMe?: boolean;
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
export type Locale = "en" | "ru";
