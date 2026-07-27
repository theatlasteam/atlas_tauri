// Typed REST client for atlas-server. The auth token is injected by the
// session store (setToken) so this module has no dependency cycle on it.

import type {
  AttachmentDto,
  BlockDto,
  ChatDto,
  FolderDto,
  MessageDto,
  UserDto,
} from "./generated";
import { serverConfig } from "../store/serverConfig";

// Resolved fresh on every call (not cached at module load) so changing the
// server URL at runtime — via the hidden config dialog — takes effect
// immediately, without a reload.
export const apiBase = (): string => serverConfig.apiBase();
export const wsUrl = (): string => serverConfig.wsUrl();

let token: string | null = null;
export function setToken(value: string | null) {
  token = value;
}
export function getToken(): string | null {
  return token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: { raw?: BodyInit; headers?: Record<string, string> },
): Promise<T> {
  const headers: Record<string, string> = { ...init?.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined = init?.raw;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${apiBase()}${path}`, { method, headers, body: payload });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** Shared by attachment and avatar fetches: authorized GET → blob object URL. */
async function fetchBlobUrl(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${apiBase()}${path}`, { headers });
  if (!res.ok) throw new ApiError(res.status, "fetch failed");
  return URL.createObjectURL(await res.blob());
}

export interface AuthResponse {
  token: string;
  user: UserDto;
}

export interface SessionDto {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export const api = {
  // auth
  register: (handle: string, name: string, password: string, deviceName: string) =>
    request<AuthResponse>("POST", "/api/auth/register", { handle, name, password, deviceName }),
  login: (handle: string, password: string, deviceName: string) =>
    request<AuthResponse>("POST", "/api/auth/login", { handle, password, deviceName }),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout"),
  listSessions: () => request<SessionDto[]>("GET", "/api/sessions"),
  revokeSession: (id: string) => request<{ ok: boolean }>("DELETE", `/api/sessions/${id}`),

  // users
  me: () => request<UserDto>("GET", "/api/me"),
  updateMe: (
    patch: Partial<
      Pick<
        UserDto,
        | "name"
        | "bio"
        | "status"
        | "avatarColor"
        | "avatarInitial"
        | "readReceipts"
        | "lastSeenVisible"
      >
    >,
  ) => request<UserDto>("PATCH", "/api/me", patch),
  getUser: (id: string) => request<UserDto>("GET", `/api/users/${id}`),
  searchUsers: (q: string) => request<UserDto[]>("GET", `/api/users?q=${encodeURIComponent(q)}`),
  /** Grant/revoke the verified checkmark — server restricts this to the "atlas" account. */
  setVerified: (userId: string, verified: boolean) =>
    request<UserDto>("PATCH", `/api/users/${userId}/verified`, { verified }),
  /** Every account (verified first), for the atlas-only verification screen.
   * Pass a query to narrow; 403s for anyone other than atlas. */
  listAllUsers: (q = "") => request<UserDto[]>("GET", `/api/admin/users?q=${encodeURIComponent(q)}`),

  // blocks
  listBlocks: () => request<BlockDto[]>("GET", "/api/blocks"),
  blockUser: (userId: string) => request<{ ok: boolean }>("POST", "/api/blocks", { userId }),
  unblockUser: (userId: string) => request<{ ok: boolean }>("DELETE", `/api/blocks/${userId}`),

  // chats
  listChats: () => request<ChatDto[]>("GET", "/api/chats"),
  getChat: (id: string) => request<ChatDto>("GET", `/api/chats/${id}`),
  createDm: (userId: string) => request<ChatDto>("POST", "/api/chats", { kind: "dm", userId }),
  createGroup: (name: string, memberIds: string[]) =>
    request<ChatDto>("POST", "/api/chats", { kind: "group", name, memberIds }),
  setMuted: (chatId: string, muted: boolean) =>
    request<{ ok: boolean }>("POST", `/api/chats/${chatId}/mute`, { muted }),

  // messages
  listMessages: (chatId: string, opts?: { before?: string; after?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set("before", opts.before);
    if (opts?.after) params.set("after", opts.after);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.size ? `?${params}` : "";
    return request<MessageDto[]>("GET", `/api/chats/${chatId}/messages${qs}`);
  },
  sendMessage: (
    chatId: string,
    msg: {
      scheme?: string;
      body: string;
      clientTag?: string;
      replyToId?: string;
      attachmentId?: string;
      /** Time capsule: ISO timestamp before which nobody but the author may read it. */
      unlockAt?: string;
      /** Computed client-side from plaintext — see lib/compassMention.ts. */
      mentionsCompass?: boolean;
    },
  ) => request<MessageDto>("POST", `/api/chats/${chatId}/messages`, msg),
  /** One message by id — used to pick a capsule up the moment it opens. */
  getMessage: (id: string) => request<MessageDto>("GET", `/api/messages/${id}`),
  /** Rewrite a message I sent. The previous text is not kept anywhere. */
  editMessage: (id: string, msg: { scheme?: string; body: string }) =>
    request<MessageDto>("PATCH", `/api/messages/${id}`, msg),
  /** Unsend for everyone. The row survives as a tombstone. */
  deleteMessage: (id: string) => request<MessageDto>("DELETE", `/api/messages/${id}`),
  markRead: (chatId: string, messageId?: string) =>
    request<{ ok: boolean }>("POST", `/api/chats/${chatId}/read`, { messageId }),
  searchMessages: (q: string, limit = 30) =>
    request<MessageDto[]>("GET", `/api/messages/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  addReaction: (messageId: string, emoji: string) =>
    request<{ ok: boolean }>("POST", `/api/messages/${messageId}/reactions`, { emoji }),
  removeReaction: (messageId: string, emoji: string) =>
    request<{ ok: boolean }>("DELETE", `/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`),

  // Compass (@compass) — see lib/compassMention.ts and store/compassChat.ts
  /** A DM's @compass mention: the caller already decrypted its own history
   * and generated the reply client-side (via compassComplete below) — this
   * just posts it under Compass's identity in a chat the caller is a member
   * of. The server never sees the DM's plaintext at any point. */
  compassReply: (chatId: string, text: string) =>
    request<MessageDto>("POST", `/api/chats/${chatId}/compass-reply`, { text }),
  /** Stateless proxy to the inference gateway — nothing here is persisted
   * server-side. Used for a DM mention's reply generation and for the
   * separate local-only Compass chat, whose history never leaves the
   * device except as these one-off requests. */
  compassComplete: (messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string }>("POST", "/api/compass/complete", { messages }),
  /** Compass's real user id — generated at server startup, not something
   * either side can hardcode. Used to tell its messages apart from a
   * human's when building a transcript for the gateway. */
  compassInfo: () => request<{ userId: string }>("GET", "/api/compass/info"),

  // attachments
  uploadAttachment: (
    data: Blob,
    meta: { kind: "image" | "voice" | "file"; filename?: string; mime?: string; durationMs?: number; width?: number; height?: number },
  ) => {
    const params = new URLSearchParams({ kind: meta.kind });
    if (meta.filename) params.set("filename", meta.filename);
    if (meta.mime) params.set("mime", meta.mime);
    if (meta.durationMs != null) params.set("durationMs", String(Math.round(meta.durationMs)));
    if (meta.width != null) params.set("width", String(meta.width));
    if (meta.height != null) params.set("height", String(meta.height));
    return request<AttachmentDto>("POST", `/api/attachments?${params}`, undefined, { raw: data });
  },
  /** Fetch attachment bytes as an object URL (caller revokes when done). */
  fetchAttachmentUrl: (id: string): Promise<string> => fetchBlobUrl(`/api/attachments/${id}`),

  // profile photo
  setAvatar: (attachmentId: string) => request<UserDto>("POST", "/api/me/avatar", { attachmentId }),
  removeAvatar: () => request<UserDto>("DELETE", "/api/me/avatar"),
  /** Fetch a user's profile photo as an object URL (caller revokes when done). */
  fetchAvatarUrl: (userId: string): Promise<string> => fetchBlobUrl(`/api/users/${userId}/avatar`),

  // folders
  listFolders: () => request<FolderDto[]>("GET", "/api/folders"),
  createFolder: (name: string) => request<FolderDto>("POST", "/api/folders", { name }),
  deleteFolder: (id: string) => request<{ ok: boolean }>("DELETE", `/api/folders/${id}`),
  addChatToFolder: (folderId: string, chatId: string) =>
    request<{ ok: boolean }>("PUT", `/api/folders/${folderId}/chats/${chatId}`),
  removeChatFromFolder: (folderId: string, chatId: string) =>
    request<{ ok: boolean }>("DELETE", `/api/folders/${folderId}/chats/${chatId}`),

  // E2EE key directory
  publishIdentity: (identityKey: string) =>
    request<{ ok: boolean }>("POST", "/api/keys/identity", { identityKey }),
  getIdentity: (userId: string) =>
    request<{ userId: string; identityKey: string | null }>("GET", `/api/keys/identity/${userId}`),
  /** Clears the published identity key so a mismatched device (reinstall,
   * factory reset) can publish its real one instead of 409ing forever. */
  resetIdentity: () => request<{ ok: boolean }>("POST", "/api/keys/identity/reset"),

  // calls
  iceServers: () => request<{ iceServers: IceServer[]; ttl: number }>("GET", "/api/calls/ice-servers"),
};
