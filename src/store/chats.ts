// Live chat-list store: seeded over REST, kept current by server events, and
// resynced from scratch on every socket (re)connect. Also owns typing state
// and routes message/reaction events into the messages store.

import { createEffect, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { api } from "../data/api";
import { previewText, toChat, toMessage } from "../data/mapping";
import { onResync, onServerEvent, wsSend } from "../data/socket";
import type { Chat, Folder } from "../data/types";
import { e2eeAvailable, e2eeOpen, e2eeSeal } from "../lib/tauri";
import { notifyIncoming } from "../lib/notify";
import { preferences } from "./preferences";
import { e2ee } from "./e2ee";
import { messagesStore } from "./messages";
import { session } from "./session";

interface ChatsState {
  chats: Chat[];
  folders: Folder[];
  loaded: boolean;
  /** chatId -> userIds currently typing (with expiry timers). */
  typing: Record<string, string[]>;
  /**
   * Live typing: chatId -> userId -> the draft as it stands right now.
   * Never persisted and dropped the instant the typist stops, exactly like
   * the plain indicator it rides along with.
   */
  typingPreview: Record<string, Record<string, string>>;
  /**
   * Co-presence: chatId -> userIds who have this exact conversation open
   * right now. Distinct from `online`, which only says the app is running
   * somewhere.
   */
  present: Record<string, string[]>;
}

const TYPING_TTL_MS = 4000;

function createChatsStore() {
  const [state, setState] = createStore<ChatsState>({
    chats: [],
    folders: [],
    loaded: false,
    typing: {},
    typingPreview: {},
    present: {},
  });
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The chat currently open in the UI — its incoming messages mark-read live. */
  let activeChatId: string | null = null;

  const myId = () => session.user()?.id ?? "";
  const chat = (id: string) => state.chats.find((c) => c.id === id);

  const refresh = async () => {
    const me = myId();
    if (!me) return;
    const [chatDtos, folderDtos] = await Promise.all([api.listChats(), api.listFolders()]);
    setState({
      chats: chatDtos.map((dto) => toChat(dto, me)),
      folders: folderDtos.map((f) => ({ id: f.id, name: f.name })),
      loaded: true,
    });
  };

  const sortChats = () => {
    setState(
      "chats",
      produce((chats) => {
        chats.sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
      }),
    );
  };

  const patchChat = (chatId: string, changes: Partial<Chat>) => {
    setState("chats", (c) => c.id === chatId, (c) => ({ ...c, ...changes }));
  };

  const setActiveChat = (chatId: string | null) => {
    activeChatId = chatId;
    // Tell the other members of the room I've walked in (or out). Best-effort:
    // if the socket is down there is no co-presence to report anyway, and the
    // server re-derives it from scratch when the connection comes back.
    wsSend({ type: "focus", chat_id: chatId ?? undefined });
    // Co-presence is per-connection server state, so anything we believed
    // about the chat we just left is now stale.
    if (!chatId) setState("present", {});
  };

  const markRead = async (chatId: string, messageId?: string) => {
    patchChat(chatId, { unreadCount: 0 });
    // WS when we know the exact cursor; REST otherwise (server resolves the
    // latest message) or when the socket is down.
    if (messageId && wsSend({ type: "mark_read", chat_id: chatId, message_id: messageId })) return;
    await api.markRead(chatId, messageId).catch(() => {});
  };

  /**
   * Announce that I'm typing, optionally carrying the draft itself.
   *
   * In a DM the preview is sealed with the peer's key before it leaves the
   * device — live typing must not be the one feature that quietly hands the
   * server a plaintext stream of everything you write. Group chats aren't
   * end-to-end encrypted in the first place, so their previews travel as
   * "plain" and say so on the wire.
   */
  const sendTyping = async (chatId: string, draft?: string) => {
    if (draft === undefined) {
      wsSend({ type: "typing", chat_id: chatId });
      return;
    }
    const peerUserId = chat(chatId)?.peerUserId;
    if (!peerUserId) {
      wsSend({ type: "typing", chat_id: chatId, preview: draft, scheme: "plain" });
      return;
    }
    if (!e2eeAvailable) {
      wsSend({ type: "typing", chat_id: chatId }); // indicator only, never a plaintext draft
      return;
    }
    try {
      const key = await e2ee.peerKey(peerUserId);
      if (!key) return; // no key published yet — nothing safe to send
      wsSend({
        type: "typing",
        chat_id: chatId,
        preview: await e2eeSeal(key, draft),
        scheme: "x25519-v1",
      });
    } catch {
      // Sealing failed: send nothing rather than falling back to plaintext.
    }
  };

  const setMuted = async (chatId: string, muted: boolean) => {
    patchChat(chatId, { muted });
    await api.setMuted(chatId, muted);
  };

  const createFolder = async (name: string) => {
    const folder = await api.createFolder(name);
    setState("folders", (f) => [...f, { id: folder.id, name: folder.name }]);
    return folder;
  };

  const deleteFolder = async (folderId: string) => {
    await api.deleteFolder(folderId);
    setState("folders", (f) => f.filter((folder) => folder.id !== folderId));
    setState("chats", {}, "folderIds", (ids) => ids.filter((id) => id !== folderId));
  };

  const assignFolder = async (chatId: string, folderId: string, inFolder: boolean) => {
    if (inFolder) {
      await api.addChatToFolder(folderId, chatId);
      setState("chats", (c) => c.id === chatId, "folderIds", (ids) => [...new Set([...ids, folderId])]);
    } else {
      await api.removeChatFromFolder(folderId, chatId);
      setState("chats", (c) => c.id === chatId, "folderIds", (ids) => ids.filter((id) => id !== folderId));
    }
  };

  const openDm = async (userId: string): Promise<Chat> => {
    const dto = await api.createDm(userId);
    const mapped = toChat(dto, myId());
    if (!chat(mapped.id)) setState("chats", (c) => [mapped, ...c]);
    return mapped;
  };

  const createGroup = async (name: string, memberIds: string[]): Promise<Chat> => {
    const dto = await api.createGroup(name, memberIds);
    const mapped = toChat(dto, myId());
    if (!chat(mapped.id)) setState("chats", (c) => [mapped, ...c]);
    return mapped;
  };

  const setPreview = (chatId: string, userId: string, text: string | undefined) => {
    setState("typingPreview", chatId, (previews) => {
      const next = { ...(previews ?? {}) };
      if (text === undefined || text === "") delete next[userId];
      else next[userId] = text;
      return next;
    });
  };

  const bumpTyping = (chatId: string, userId: string) => {
    const key = `${chatId}:${userId}`;
    const existing = typingTimers.get(key);
    if (existing) clearTimeout(existing);
    if (!state.typing[chatId]?.includes(userId)) {
      setState("typing", chatId, (ids) => [...(ids ?? []), userId]);
    }
    typingTimers.set(
      key,
      setTimeout(() => {
        typingTimers.delete(key);
        setState("typing", chatId, (ids) => (ids ?? []).filter((id) => id !== userId));
        setPreview(chatId, userId, undefined);
      }, TYPING_TTL_MS),
    );
  };

  /**
   * Take in a live-typing preview.
   *
   * Live typing is reciprocal: a client that doesn't share its own drafts
   * doesn't render anyone else's. That's enforced here rather than only in the
   * composer so the rule holds however the preference is flipped mid-session —
   * turning it off blanks whatever is currently on screen.
   */
  const ingestPreview = async (
    chatId: string,
    userId: string,
    preview: string,
    scheme: string | undefined,
  ) => {
    if (!preferences.liveTyping) return;
    if (scheme === "plain" || scheme === undefined) {
      setPreview(chatId, userId, preview);
      return;
    }
    if (!e2eeAvailable || scheme !== "x25519-v1") return;
    try {
      const key = await e2ee.peerKey(userId);
      if (!key) return;
      const text = await e2eeOpen(key, preview);
      // A slow decrypt can land after the typist already stopped; don't
      // resurrect a preview whose indicator has already expired.
      if (state.typing[chatId]?.includes(userId)) setPreview(chatId, userId, text);
    } catch {
      // An undecryptable draft is not worth surfacing — the plain "typing…"
      // indicator is already showing.
    }
  };

  const clearTyping = (chatId: string, userId: string) => {
    const key = `${chatId}:${userId}`;
    const timer = typingTimers.get(key);
    if (timer) clearTimeout(timer);
    typingTimers.delete(key);
    setState("typing", chatId, (ids) => (ids ?? []).filter((id) => id !== userId));
    setPreview(chatId, userId, undefined);
  };

  // ---- server event routing ----
  onServerEvent((event) => {
    const me = myId();
    switch (event.type) {
      case "message":
      case "message_ack": {
        const dto = event.message;
        const target = chat(dto.chatId);
        const message = toMessage(dto, me);
        messagesStore.ingestDto(dto, { peerUserId: target?.peerUserId });
        clearTyping(dto.chatId, dto.authorId);

        if (target) {
          // Nothing is unread if I wrote it, or if I'm looking at the chat
          // right now — in which case it also gets marked read immediately.
          const inOpenChat = activeChatId === dto.chatId;
          const countsAsUnread = !message.mine && !inOpenChat;
          patchChat(dto.chatId, {
            lastMessage: previewText(message),
            lastMessageAt: message.sentAt,
            unreadCount: countsAsUnread ? target.unreadCount + 1 : target.unreadCount,
          });
          sortChats();
          if (inOpenChat && !message.mine && event.type === "message") {
            void markRead(dto.chatId, dto.id);
          }
          if (countsAsUnread && !target.muted) {
            notifyIncoming({
              title: target.name,
              body: previewText(message),
              tag: dto.chatId,
            });
          }
        } else {
          // Message for a chat we don't know yet (created elsewhere): refetch.
          void refresh();
        }
        break;
      }
      case "message_updated": {
        // Edited or unsent. Either way the fix is the same: replace the row we
        // already hold. No unread/preview bookkeeping unless it was the chat's
        // latest message, which refresh() below settles.
        const dto = event.message;
        messagesStore.ingestDto(dto, { peerUserId: chat(dto.chatId)?.peerUserId });
        const target = chat(dto.chatId);
        if (target && target.lastMessageAt === dto.sentAt) {
          patchChat(dto.chatId, { lastMessage: previewText(toMessage(dto, me)) });
        }
        break;
      }
      case "focus": {
        if (event.user_id === me) break;
        setState("present", event.chat_id, (ids) => {
          const others = (ids ?? []).filter((id) => id !== event.user_id);
          return event.present ? [...others, event.user_id] : others;
        });
        break;
      }
      case "chat_created": {
        const mapped = toChat(event.chat, me);
        if (!chat(mapped.id)) {
          setState("chats", (c) => [mapped, ...c]);
          sortChats();
        }
        break;
      }
      case "presence": {
        setState("chats", (c) => c.peerUserId === event.user_id, (c) => ({
          ...c,
          online: event.online,
          // Absent when the peer hides their last seen — keep the previous
          // value rather than blanking a header that was already correct.
          peerLastSeenAt: event.last_seen_at ?? c.peerLastSeenAt,
        }));
        break;
      }
      case "typing": {
        if (event.user_id === me) break;
        bumpTyping(event.chat_id, event.user_id);
        if (event.preview) {
          void ingestPreview(event.chat_id, event.user_id, event.preview, event.scheme);
        } else {
          setPreview(event.chat_id, event.user_id, undefined);
        }
        break;
      }
      case "read": {
        if (event.user_id === me) {
          patchChat(event.chat_id, { unreadCount: 0 });
        } else {
          // Peer read cursor advanced -> ✓✓ for our messages up to that id.
          const target = chat(event.chat_id);
          if (target?.peerUserId === event.user_id) {
            patchChat(event.chat_id, { peerReadUpTo: event.message_id });
          }
        }
        break;
      }
      case "reaction": {
        messagesStore.applyReaction(
          event.chat_id,
          event.message_id,
          event.user_id,
          event.emoji,
          event.added,
        );
        break;
      }
    }
  });

  // Turning live typing off has to take effect on what's already on screen,
  // not just on the next keystroke — otherwise a draft stays frozen mid-word
  // in the thread until its owner stops typing.
  createEffect(() => {
    if (!preferences.liveTyping) setState("typingPreview", {});
  });

  // Full resync every time the socket comes (back) up: the chat list is one
  // query, and the open chat backfills anything missed while offline.
  onResync(() => {
    void refresh();
    if (activeChatId) {
      const target = chat(activeChatId);
      void messagesStore.resync(activeChatId, target?.peerUserId);
      // Focus lives on the connection that reported it, so a new socket has
      // forgotten we're in this room. Re-announce, and drop what we believed
      // about everyone else — the server replays the current occupants.
      setState("present", {});
      wsSend({ type: "focus", chat_id: activeChatId });
    }
  });

  return {
    state,
    chat,
    refresh,
    markRead,
    setActiveChat,
    sendTyping,
    typingPreview: (chatId: string) => state.typingPreview[chatId] ?? {},
    /** Users with this exact conversation open right now (never me). */
    presentIn: (chatId: string) => state.present[chatId] ?? [],
    setMuted,
    createFolder,
    deleteFolder,
    assignFolder,
    openDm,
    createGroup,
  };
}

export const chatsStore = createRoot(createChatsStore);

/**
 * "typing…" / "Ana, Rue typing…" — one implementation for the chat list and
 * the chat header, which previously disagreed: the list said a flat "typing…"
 * even in a twelve-person group where the header named everyone.
 *
 * `resolveName` is optional because the chat list has no reason to have loaded
 * member profiles; unnamed typists fall back to a count.
 */
export function typingLabel(chatId: string, resolveName?: (userId: string) => string | undefined) {
  const ids = chatsStore.state.typing[chatId];
  if (!ids || ids.length === 0) return null;
  const chat = chatsStore.chat(chatId);
  if (chat?.kind !== "group") return "typing…";
  const names = ids.map((id) => resolveName?.(id)).filter((name): name is string => !!name);
  if (names.length === ids.length) return `${names.join(", ")} typing…`;
  return ids.length === 1 ? "someone is typing…" : `${ids.length} people are typing…`;
}

// Legacy-style named exports so existing screens keep working.
export const chatsState = chatsStore.state;
export const refreshChats = chatsStore.refresh;
export const markRead = chatsStore.markRead;
export const setMuted = chatsStore.setMuted;
export const createFolder = chatsStore.createFolder;
export const deleteFolder = chatsStore.deleteFolder;
