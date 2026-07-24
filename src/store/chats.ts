// Live chat-list store: seeded over REST, kept current by server events, and
// resynced from scratch on every socket (re)connect. Also owns typing state
// and routes message/reaction events into the messages store.

import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { api } from "../data/api";
import { previewText, toChat, toMessage } from "../data/mapping";
import { onResync, onServerEvent, wsSend } from "../data/socket";
import type { Chat, Folder } from "../data/types";
import { messagesStore } from "./messages";
import { session } from "./session";

interface ChatsState {
  chats: Chat[];
  folders: Folder[];
  loaded: boolean;
  /** chatId -> userIds currently typing (with expiry timers). */
  typing: Record<string, string[]>;
}

const TYPING_TTL_MS = 4000;

function createChatsStore() {
  const [state, setState] = createStore<ChatsState>({
    chats: [],
    folders: [],
    loaded: false,
    typing: {},
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
  };

  const markRead = async (chatId: string, messageId?: string) => {
    patchChat(chatId, { unreadCount: 0 });
    // WS when we know the exact cursor; REST otherwise (server resolves the
    // latest message) or when the socket is down.
    if (messageId && wsSend({ type: "mark_read", chat_id: chatId, message_id: messageId })) return;
    await api.markRead(chatId, messageId).catch(() => {});
  };

  const sendTyping = (chatId: string) => {
    wsSend({ type: "typing", chat_id: chatId });
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
      }, TYPING_TTL_MS),
    );
  };

  const clearTyping = (chatId: string, userId: string) => {
    const key = `${chatId}:${userId}`;
    const timer = typingTimers.get(key);
    if (timer) clearTimeout(timer);
    typingTimers.delete(key);
    setState("typing", chatId, (ids) => (ids ?? []).filter((id) => id !== userId));
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
          const isActive = activeChatId === dto.chatId && event.type === "message" && !message.mine;
          patchChat(dto.chatId, {
            lastMessage: previewText(message),
            lastMessageAt: message.sentAt,
            unreadCount:
              message.mine || isActive || activeChatId === dto.chatId
                ? target.unreadCount
                : target.unreadCount + 1,
          });
          sortChats();
          if (isActive) void markRead(dto.chatId, dto.id);
        } else {
          // Message for a chat we don't know yet (created elsewhere): refetch.
          void refresh();
        }
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
        setState(
          "chats",
          (c) => c.peerUserId === event.user_id,
          "online",
          event.online,
        );
        break;
      }
      case "typing": {
        if (event.user_id !== me) bumpTyping(event.chat_id, event.user_id);
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

  // Full resync every time the socket comes (back) up: the chat list is one
  // query, and the open chat backfills anything missed while offline.
  onResync(() => {
    void refresh();
    if (activeChatId) {
      const target = chat(activeChatId);
      void messagesStore.resync(activeChatId, target?.peerUserId);
    }
  });

  return {
    state,
    chat,
    refresh,
    markRead,
    setActiveChat,
    sendTyping,
    setMuted,
    createFolder,
    deleteFolder,
    assignFolder,
    openDm,
    createGroup,
  };
}

export const chatsStore = createRoot(createChatsStore);

// Legacy-style named exports so existing screens keep working.
export const chatsState = chatsStore.state;
export const refreshChats = chatsStore.refresh;
export const markRead = chatsStore.markRead;
export const setMuted = chatsStore.setMuted;
export const createFolder = chatsStore.createFolder;
export const deleteFolder = chatsStore.deleteFolder;
