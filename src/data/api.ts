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

/** Reads /api/compass/complete/stream's text/event-stream body, firing
 * `onDelta` per chunk and resolving with the concatenated full reply. */
async function streamCompassComplete(
  messages: { role: "user" | "assistant"; content: string }[],
  onDelta: (delta: string) => void,
  opts?: { signal?: AbortSignal; model?: string },
): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBase()}/api/compass/complete/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, model: opts?.model }),
    signal: opts?.signal,
  });
  if (!res.ok || !res.body) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const block of events) {
      // SSE reassembly: a single event's `data:` lines join with "\n" to
      // reconstitute a delta that itself contained a newline (e.g. a
      // paragraph break), rather than each line being its own delta.
      const dataLines = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""));
      if (dataLines.length === 0) continue;
      const delta = dataLines.join("\n");
      if (!delta) continue;
      full += delta;
      onDelta(delta);
    }
  }
  return full;
}

/** Reads /api/minds/{id}/run/stream's event-stream, firing `onEvent` per
 *  JSON event ({kind, data}) and resolving with the final run on `done`. */
async function streamMindRun(
  id: string,
  input: string,
  onEvent: (ev: { kind: string; data: any }) => void,
  opts?: { signal?: AbortSignal },
): Promise<MindRunDto> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const startedAt = new Date().toISOString();
  const res = await fetch(`${apiBase()}/api/minds/${id}/run/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
    signal: opts?.signal,
  });
  if (!res.ok || !res.body) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let final: MindRunDto | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const block of events) {
      const dataLines = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""));
      if (dataLines.length === 0) continue;
      const raw = dataLines.join("\n");
      if (!raw) continue;
      try {
        const ev = JSON.parse(raw) as { kind: string; data: any };
        onEvent(ev);
        if (ev.kind === "done") {
          final = {
            id: `live-${Date.now()}`,
            trigger: "manual",
            input,
            output: ev.data?.output ?? "",
            toolCalls: ev.data?.toolCalls ?? [],
            status: ev.data?.status ?? "ok",
            error: ev.data?.error ?? "",
            startedAt,
            finishedAt: new Date().toISOString(),
          };
        }
      } catch {
        /* partial JSON at a chunk boundary — next read completes it */
      }
    }
  }
  if (!final) throw new ApiError(0, "stream ended without a result");
  return final;
}

/** Shared by attachment and avatar fetches: authorized GET → blob object URL. */
async function fetchBlobUrl(path: string): Promise<string> {  const headers: Record<string, string> = {};
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
  checkHandle: (handle: string) => request<{ exists: boolean }>("POST", "/api/auth/check-handle", { handle }),
  register: (handle: string, name: string, password: string, deviceName: string) =>
    request<AuthResponse>("POST", "/api/auth/register", { handle, name, password, deviceName }),
  login: (handle: string, password: string, deviceName: string) =>
    request<AuthResponse>("POST", "/api/auth/login", { handle, password, deviceName }),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout"),
  deleteAccount: () => request<{ ok: boolean }>("DELETE", "/api/auth/delete-account"),
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
  listChatMembers: (chatId: string) => request<{ id: string }[]>("GET", `/api/chats/${chatId}/members`),

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
  clearChatHistory: (chatId: string) => request<{ ok: boolean }>("DELETE", `/api/chats/${chatId}/history`),
  botCallback: (chatId: string, messageId: string, data: string) =>
    request<{ ok: boolean }>("POST", `/api/chats/${chatId}/callback`, { messageId, data }),
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
  compassComplete: (
    messages: { role: "user" | "assistant"; content: string }[],
    model?: string,
  ) => request<{ reply: string }>("POST", "/api/compass/complete", { messages, model }),
  /** Same request as compassComplete, but the reply streams in as plain-text
   * SSE deltas (one `data:` line per chunk) instead of one JSON blob at the
   * end — `onDelta` fires per chunk, the promise resolves with the full
   * text once the stream ends. Used only by the local-only Compass chat,
   * where showing a reply arrive incrementally matters; the DM-mention path
   * still uses the non-streaming call since it just posts the finished text. */
  compassCompleteStream: (
    messages: { role: "user" | "assistant"; content: string }[],
    onDelta: (delta: string) => void,
    opts?: { signal?: AbortSignal; model?: string },
  ) => streamCompassComplete(messages, onDelta, opts),
  /** Compass's real user id — generated at server startup, not something
   * either side can hardcode. Used to tell its messages apart from a
   * human's when building a transcript for the gateway. */
  compassInfo: () => request<{ userId: string }>("GET", "/api/compass/info"),

  createSpace: (body: { title?: string; html: string; parentSpaceId?: string }) =>
    request<{ id: string; title: string; html: string; creatorId: string; parentSpaceId: string | null; createdAt: string }>(
      "POST",
      "/api/spaces",
      body,
    ),
  getSpace: (id: string) =>
    request<{ id: string; title: string; html: string; creatorId: string; parentSpaceId: string | null; createdAt: string }>(
      "GET",
      `/api/spaces/${id}`,
    ),
  getSpacePublic: (id: string) =>
    request<{ id: string; title: string; html: string }>("GET", `/api/spaces/${id}/public`),

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
  registerDevice: (token: string, platform = "android") =>
    request<{ ok: boolean }>("POST", "/api/devices", { token, platform }),

  // E2EE v2 prekey bundles (X3DH + Double Ratchet)
  publishBundle: (bundle: {
    identityKey: string;
    signingKey: string;
    signedPrekey: string;
    signedPrekeyId: number;
    signedPrekeySig: string;
  }) => request<{ ok: boolean }>("POST", "/api/keys/bundle", bundle),
  getBundle: (userId: string) =>
    request<{
      userId: string;
      identityKey: string;
      signingKey: string;
      signedPrekey: string;
      signedPrekeyId: number;
      signedPrekeySig: string;
    }>("GET", `/api/keys/bundle/${userId}`),
  resetBundle: () => request<{ ok: boolean }>("POST", "/api/keys/bundle/reset"),
  uploadPrekeys: (packages: string[]) =>
    request<{ ok: boolean }>("POST", "/api/keys/packages", { deviceId: "primary", packages }),
  prekeyCount: () => request<{ available: number }>("GET", "/api/keys/packages/count"),
  claimPrekey: (userId: string) =>
    request<{ userId: string; deviceId: string; package: string }>(
      "POST",
      `/api/keys/packages/${userId}/claim`,
    ),

  // calls
  iceServers: () => request<{ iceServers: IceServer[]; ttl: number }>("GET", "/api/calls/ice-servers"),

  listEmoji: () => request<EmojiLibraryDto>("GET", "/api/emoji"),
  uploadEmoji: (data: Blob, meta: { name?: string; mime?: string; width?: number; height?: number }) => {
    const params = new URLSearchParams();
    if (meta.name) params.set("name", meta.name);
    if (meta.mime) params.set("mime", meta.mime);
    if (meta.width != null) params.set("width", String(meta.width));
    if (meta.height != null) params.set("height", String(meta.height));
    const q = params.toString();
    return request<CustomEmojiDto>("POST", `/api/emoji${q ? `?${q}` : ""}`, undefined, { raw: data });
  },
  deleteEmoji: (id: string) => request<{ ok: boolean }>("DELETE", `/api/emoji/${id}`),
  emojiMeta: (id: string) => request<CustomEmojiMetaDto>("GET", `/api/emoji/${id}/meta`),
  fetchEmojiUrl: (id: string): Promise<string> => fetchBlobUrl(`/api/emoji/${id}`),
  saveEmojiPack: (ownerId: string) => request<EmojiLibraryDto>("POST", `/api/emoji/packs/${ownerId}`),

  // Atlas X — Compass Minds. Server-side rooms of persistent personas that
  // talk to each other as well as to you; see lib/minds.ts for the types and
  // screens/Minds*.tsx for the UI. Every route is gated on Atlas X server-side
  // (routes/minds.rs::require_x), which is also what the client keys the whole
  // surface's visibility on.
  listMinds: () => request<MindDto[]>("GET", "/api/minds"),
  /** Can this account use Minds right now (Atlas X bit or FREE_MINDS flag)?
   *  The client gates the whole surface on this so flipping the flag lights
   *  the UI up without a relogin. */
  mindAccess: () => request<{ allowed: boolean }>("GET", "/api/minds/access"),
  createMind: (body: { name: string; prompt?: string; tools?: Record<string, boolean> }) =>
    request<MindDto>("POST", "/api/minds", body),
  updateMind: (
    id: string,
    body: { name: string; prompt?: string; tools?: Record<string, boolean>; isActive?: boolean },
  ) => request<MindDto>("PATCH", `/api/minds/${id}`, body),
  deleteMind: (id: string) => request<{ ok: boolean }>("DELETE", `/api/minds/${id}`),
  runMind: (id: string, input: string) =>
    request<MindRunDto>("POST", `/api/minds/${id}/run`, { input }),
  /** Streaming run: same job, live SSE events (`status`/`say`/`tool_start`/
   *  `tool_end`/`done`). Resolves with the final run once `done` arrives. */
  runMindStream: (
    id: string,
    input: string,
    onEvent: (ev: { kind: string; data: any }) => void,
    opts?: { signal?: AbortSignal },
  ): Promise<MindRunDto> =>
    streamMindRun(id, input, onEvent, opts),
  listMindRuns: (id: string) => request<MindRunDto[]>("GET", `/api/minds/${id}/runs`),
  listMindSchedules: (id: string) =>
    request<MindScheduleDto[]>("GET", `/api/minds/${id}/schedules`),
  createMindSchedule: (
    id: string,
    body: { label: string; cronExpr: string; tz?: string; task: string },
  ) => request<MindScheduleDto>("POST", `/api/minds/${id}/schedules`, body),
  toggleMindSchedule: (mindId: string, scheduleId: string) =>
    request<MindScheduleDto>("PATCH", `/api/minds/${mindId}/schedules/${scheduleId}`),
  deleteMindSchedule: (mindId: string, scheduleId: string) =>
    request<{ ok: boolean }>("DELETE", `/api/minds/${mindId}/schedules/${scheduleId}`),
  listMindRooms: () => request<MindRoomDto[]>("GET", "/api/minds/rooms"),
  getMindRoom: (id: string) => request<MindRoomDto>("GET", `/api/minds/rooms/${id}`),
  createMindRoom: (body: { title?: string; mindIds: string[] }) =>
    request<MindRoomDto>("POST", "/api/minds/rooms", body),
  deleteMindRoom: (id: string) => request<{ ok: boolean }>("DELETE", `/api/minds/rooms/${id}`),
  listMindMessages: (roomId: string) =>
    request<MindMessageDto[]>("GET", `/api/minds/rooms/${roomId}/messages`),
  /** One turn: the human's line goes in, every Mind in the room answers in
   *  order (each seeing the ones before it), and the whole transcript comes
   *  back. Not streaming — a reply you can't attribute to a Mind yet isn't
   *  worth rendering. */
  sendMindTurn: (roomId: string, text: string) =>
    request<MindMessageDto[]>("POST", `/api/minds/rooms/${roomId}/messages`, { text }),

  createCanvas: () => request<{ id: string; creatorId: string | null }>("POST", "/api/canvas"),
  getCanvas: (id: string) => request<{ id: string; creatorId: string | null }>("GET", `/api/canvas/${id}`),
};

/**
 * A Compass Mind — an autonomous agent owned by one Atlas X account. It runs
 * on the server 24/7 in an isolated sandbox with tools (web fetch, shell,
 * owner messaging) and optional cron schedules.
 */
export type MindDto = {
  id: string;
  name: string;
  /** Gradient start/end; every Mind gets its own colour so a room is readable
   *  at a glance without reading the names. */
  color: string;
  colorEnd: string;
  /** Character + job description, in the owner's own words. */
  prompt: string;
  /** Paused Minds keep their schedules and history but never wake up. */
  isActive: boolean;
  /** Tool allowlist: { browser: bool, web_fetch: bool, shell: bool, set_schedule: bool, message_owner: bool }. */
  tools: Record<string, boolean>;
  lastStatus: string;
  lastRunAt: string | null;
  createdAt: string;
};

export type MindScheduleDto = {
  id: string;
  label: string;
  cronExpr: string;
  tz: string;
  task: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type MindRunDto = {
  id: string;
  trigger: string;
  input: string;
  output: string;
  toolCalls?: Array<{ name: string; arguments: any; output: string }>;
  status: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

export type MindRoomDto = {
  id: string;
  title: string;
  minds: MindDto[];
  createdAt: string;
};

export type MindMessageDto = {
  id: string;
  /** null for the human's own lines. */
  mindId: string | null;
  role: "user" | "mind";
  content: string;
  createdAt: string;
};

export type CustomEmojiDto = {
  id: string;
  ownerId: string;
  name: string;
  mime: string;
  width?: number | null;
  height?: number | null;
};

export type CustomEmojiMetaDto = CustomEmojiDto & {
  ownerName: string;
  ownerHandle: string;
  inMyPack: boolean;
};

export type EmojiLibraryDto = {
  mine: CustomEmojiDto[];
  packs: { ownerId: string; ownerName: string; ownerHandle: string; emojis: CustomEmojiDto[] }[];
};
