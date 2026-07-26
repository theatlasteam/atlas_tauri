// Per-chat message cache: single source of truth for ChatView, reactions,
// receipts and search jump-ins. Fed by REST (history, sends) and by server
// events routed from the chats store.
//
// Send pipeline: optimistic row (pending, client_tag) -> REST POST (idempotent
// on client_tag, so retry after a network error can't duplicate) -> reconcile
// by clientTag. E2EE bodies decrypt asynchronously via the Rust core and
// patch the row in place.

import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { api } from "../data/api";
import type { MessageDto } from "../data/generated";
import { toMessage } from "../data/mapping";
import type { Message } from "../data/types";
import { e2eeAvailable, e2eeOpen, e2eeSeal } from "../lib/tauri";
import { e2ee } from "./e2ee";
import { session } from "./session";

export const PAGE_SIZE = 50;

interface ChatMessages {
  messages: Message[];
  reachedStart: boolean; // no older history left
  loaded: boolean;
}

function createMessagesStore() {
  const [state, setState] = createStore<Record<string, ChatMessages>>({});

  const myId = () => session.user()?.id ?? "";

  const ensure = (chatId: string) => {
    if (!state[chatId]) {
      setState(chatId, { messages: [], reachedStart: false, loaded: false });
    }
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Kick off async decryption of an E2EE message and patch the row.
   *
   * The peer's identity key can lag a few seconds behind the first message
   * in a conversation (they publish it on login, which races with delivery).
   * Retry a few times before surfacing a real failure — a single missed
   * fetch shouldn't be a permanent, unrecoverable "Unable to decrypt".
   */
  const decrypt = (chatId: string, messageId: string, scheme: string, body: string, peerUserId?: string) => {
    if (!e2eeAvailable || scheme !== "x25519-v1") {
      patch(chatId, messageId, { text: "🔒 Encrypted message (unsupported here)", decrypting: false });
      return;
    }
    const otherId = peerUserId ?? "";
    void (async () => {
      const attempts = [0, 800, 2000, 4000];
      let retriedWithFreshKey = false;
      for (let i = 0; i < attempts.length; i++) {
        if (attempts[i]) await sleep(attempts[i]);
        try {
          const key = otherId ? await e2ee.peerKey(otherId) : null;
          if (!key) continue; // peer hasn't published yet — worth another try
          const text = await e2eeOpen(key, body);
          patch(chatId, messageId, { text, decrypting: false });
          return;
        } catch {
          // Our cached copy of the peer's key might be stale (e.g. they
          // reinstalled and rotated it) — bypass the cache once and retry
          // with whatever the server has on file right now before giving up.
          if (!retriedWithFreshKey && otherId) {
            retriedWithFreshKey = true;
            try {
              const freshKey = await e2ee.peerKey(otherId, { fresh: true });
              if (freshKey) {
                const text = await e2eeOpen(freshKey, body);
                patch(chatId, messageId, { text, decrypting: false });
                return;
              }
            } catch {
              // Genuinely undecryptable even with a fresh key — stop.
            }
          }
          break;
        }
      }
      patch(chatId, messageId, { text: "🔒 Unable to decrypt", decrypting: false });
    })();
  };

  const patch = (chatId: string, messageId: string, changes: Partial<Message>) => {
    setState(
      chatId,
      "messages",
      (m) => m.id === messageId,
      (m) => ({ ...m, ...changes }),
    );
  };

  /**
   * Insert or replace by id, keeping UUIDv7 time order.
   *
   * The server fans a plain `message` event out to every chat member
   * INCLUDING the author (so other devices see it too) — that event carries
   * no client_tag. It routinely arrives at the sending client before that
   * client's own REST response does. Without a fallback, that race leaves
   * the optimistic `pending` row unmatched forever (stuck spinner) while a
   * second, real row appears alongside it (the duplicate). So reconciliation
   * has two paths: exact clientTag match when we have one (the REST-response
   * call site sets it), and otherwise — for our own messages — the oldest
   * still-pending row in this chat, since a single connection's messages
   * necessarily arrive in the order they were sent.
   */
  const upsert = (chatId: string, message: Message) => {
    ensure(chatId);
    setState(
      chatId,
      produce((chat) => {
        const existing = chat.messages.findIndex((m) => m.id === message.id);
        if (existing >= 0) {
          chat.messages[existing] = { ...chat.messages[existing], ...message };
          return;
        }

        let pendingIndex = -1;
        if (message.clientTag) {
          pendingIndex = chat.messages.findIndex((m) => m.clientTag === message.clientTag && m.pending);
        } else if (message.mine) {
          let oldestAt: string | undefined;
          chat.messages.forEach((m, i) => {
            if (m.pending && m.mine && (oldestAt === undefined || m.sentAt < oldestAt)) {
              oldestAt = m.sentAt;
              pendingIndex = i;
            }
          });
        }
        if (pendingIndex >= 0) {
          chat.messages[pendingIndex] = message;
          return;
        }

        chat.messages.push(message);
        chat.messages.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      }),
    );
  };

  const ingestDto = (dto: MessageDto, opts?: { peerUserId?: string }) => {
    const message = toMessage(dto, myId());
    upsert(dto.chatId, message);
    if (message.decrypting) {
      // Sealing is symmetric, so the key to open a body with is always the
      // *other* end of the conversation: the DM peer for something we sent,
      // the author for something we received.
      const counterparty = message.mine ? opts?.peerUserId : message.authorId;
      decrypt(dto.chatId, dto.id, dto.scheme, dto.body, counterparty);
    }
    return message;
  };

  /**
   * Refetch one message. A time capsule arrives hollow — the server withholds
   * the body until `unlockAt` — so the bubble asks for it again the moment its
   * countdown runs out, and the reply lands with the real contents.
   */
  const refresh = async (messageId: string, peerUserId?: string) => {
    try {
      ingestDto(await api.getMessage(messageId), { peerUserId });
    } catch {
      // Transient; the countdown component retries on its next tick.
    }
  };

  const loadInitial = async (chatId: string, peerUserId?: string) => {
    ensure(chatId);
    if (state[chatId].loaded) return;
    const dtos = await api.listMessages(chatId, { limit: PAGE_SIZE });
    setState(chatId, { messages: [], reachedStart: dtos.length < PAGE_SIZE, loaded: true });
    for (const dto of dtos) ingestDto(dto, { peerUserId });
  };

  const loadOlder = async (chatId: string, peerUserId?: string) => {
    const chat = state[chatId];
    if (!chat?.loaded || chat.reachedStart || chat.messages.length === 0) return 0;
    const oldest = chat.messages.find((m) => !m.pending);
    if (!oldest) return 0;
    const dtos = await api.listMessages(chatId, { before: oldest.id, limit: PAGE_SIZE });
    if (dtos.length < PAGE_SIZE) setState(chatId, "reachedStart", true);
    for (const dto of dtos) ingestDto(dto, { peerUserId });
    return dtos.length;
  };

  /** Refetch anything newer than the last known message (reconnect resync). */
  const resync = async (chatId: string, peerUserId?: string) => {
    const chat = state[chatId];
    if (!chat?.loaded) return;
    const newest = [...chat.messages].reverse().find((m) => !m.pending);
    const dtos = newest
      ? await api.listMessages(chatId, { after: newest.id, limit: 200 })
      : await api.listMessages(chatId, { limit: PAGE_SIZE });
    for (const dto of dtos) ingestDto(dto, { peerUserId });
  };

  const send = async (
    chatId: string,
    text: string,
    opts?: {
      replyToId?: string;
      attachmentId?: string;
      peerUserId?: string;
      attachmentPreview?: Message["attachment"];
      /** Time capsule: ISO instant before which the recipient can't read it. */
      unlockAt?: string;
    },
  ): Promise<void> => {
    ensure(chatId);
    const clientTag = crypto.randomUUID();
    const now = new Date().toISOString();

    // DMs always encrypt when the platform supports it — no opt-out, and no
    // silent plaintext fallback. If the peer's key isn't published yet, the
    // send fails (and lands in the "failed" retry state below) rather than
    // going out as "plain".
    const mustEncrypt = !!opts?.peerUserId && e2ee.enabledFor(chatId);

    const optimistic: Message = {
      id: `pending-${clientTag}`,
      chatId,
      authorId: myId(),
      text,
      scheme: mustEncrypt ? "x25519-v1" : "plain",
      sentAt: now,
      mine: true,
      reactions: [],
      attachment: opts?.attachmentPreview,
      unlockAt: opts?.unlockAt,
      // A capsule is sealed the moment it is sent, from its author too, so the
      // optimistic row shows the seal rather than flashing the text and then
      // hiding it. The plaintext rides along in sourceText for retries.
      sealed: !!opts?.unlockAt,
      sourceText: text,
      pending: true,
      clientTag,
    };
    if (opts?.unlockAt) optimistic.text = "⏳ Time capsule";
    setState(chatId, "messages", (m) => [...m, optimistic]);

    try {
      let scheme = "plain";
      let body = text;
      if (mustEncrypt) {
        const key = await e2ee.peerKey(opts!.peerUserId!);
        if (!key) {
          throw new Error("Can't send yet: this contact hasn't set up encryption on their device.");
        }
        body = await e2eeSeal(key, text);
        scheme = "x25519-v1";
      }

      const dto = await api.sendMessage(chatId, {
        scheme,
        body,
        clientTag,
        replyToId: opts?.replyToId,
        attachmentId: opts?.attachmentId,
        unlockAt: opts?.unlockAt,
      });
      const message = toMessage(dto, myId());
      message.clientTag = clientTag;
      if (message.decrypting) {
        // We know the plaintext we just sent; skip the decrypt round-trip.
        message.text = text;
        message.decrypting = false;
      }
      upsert(chatId, message);
    } catch (e) {
      patch(chatId, `pending-${clientTag}`, { pending: false, failed: true });
      throw e;
    }
  };

  /**
   * Resend a message that failed to go out.
   *
   * Every option the original send carried has to be carried again. Dropping
   * `peerUserId` in particular was not merely lossy: it is what decides
   * whether the body gets sealed, so a retry used to put a message that the
   * user had been shown as encrypted back on the wire in the clear. The reply
   * link, the attachment and the capsule's unlock time were lost the same way.
   *
   * The text comes from `sourceText`, not from what the bubble is showing: a
   * failed capsule displays a placeholder, and resending that would deliver
   * the words "⏳ Time capsule".
   */
  const retryFailed = async (chatId: string, message: Message, peerUserId?: string) => {
    if (!message.failed) return;
    setState(chatId, "messages", (m) => m.filter((x) => x.id !== message.id));
    await send(chatId, message.sourceText ?? message.text, {
      replyToId: message.replyTo?.id,
      peerUserId,
      attachmentId: message.attachment?.id,
      attachmentPreview: message.attachment,
      unlockAt: message.unlockAt,
    });
  };

  /**
   * Rewrite a message I sent.
   *
   * The new body is sealed the same way the original was — an edit that
   * downgraded an encrypted message to plaintext would quietly undo the
   * guarantee the bubble is still advertising with its padlock.
   */
  const edit = async (chatId: string, message: Message, text: string, peerUserId?: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === message.text) return;

    const previous = message.text;
    patch(chatId, message.id, { text: trimmed, editedAt: new Date().toISOString() });
    try {
      let scheme = "plain";
      let body = trimmed;
      if (peerUserId && e2ee.enabledFor(chatId)) {
        const key = await e2ee.peerKey(peerUserId);
        if (!key) throw new Error("Can't edit yet: this contact hasn't set up encryption.");
        body = await e2eeSeal(key, trimmed);
        scheme = "x25519-v1";
      }
      const dto = await api.editMessage(message.id, { scheme, body });
      // The echoed DTO carries ciphertext we already know the plaintext of.
      const updated = toMessage(dto, myId());
      if (updated.decrypting) {
        updated.text = trimmed;
        updated.decrypting = false;
      }
      upsert(chatId, updated);
    } catch (e) {
      patch(chatId, message.id, { text: previous, editedAt: message.editedAt });
      throw e;
    }
  };

  /** Unsend for everyone. Optimistic: the tombstone is what the server will
   *  send back anyway, and rolling it back on failure keeps that honest. */
  const unsend = async (chatId: string, message: Message) => {
    const before = { text: message.text, deleted: message.deleted, attachment: message.attachment };
    patch(chatId, message.id, { text: "Message deleted", deleted: true, attachment: undefined });
    try {
      await api.deleteMessage(message.id);
    } catch (e) {
      patch(chatId, message.id, before);
      throw e;
    }
  };

  const applyReaction = (chatId: string, messageId: string, userId: string, emoji: string, added: boolean) => {
    setState(
      chatId,
      "messages",
      (m) => m.id === messageId,
      "reactions",
      produce((reactions) => {
        const group = reactions.find((r) => r.emoji === emoji);
        if (added) {
          if (group) {
            if (!group.userIds.includes(userId)) group.userIds.push(userId);
          } else {
            reactions.push({ emoji, userIds: [userId] });
          }
        } else if (group) {
          group.userIds = group.userIds.filter((id) => id !== userId);
          if (group.userIds.length === 0) reactions.splice(reactions.indexOf(group), 1);
        }
      }),
    );
  };

  const toggleReaction = async (message: Message, emoji: string) => {
    const me = myId();
    const mine = message.reactions.find((r) => r.emoji === emoji)?.userIds.includes(me);
    // Optimistic; the echoed server event is idempotent on top of this.
    applyReaction(message.chatId, message.id, me, emoji, !mine);
    try {
      if (mine) await api.removeReaction(message.id, emoji);
      else await api.addReaction(message.id, emoji);
    } catch {
      applyReaction(message.chatId, message.id, me, emoji, !!mine); // roll back
    }
  };

  return {
    state,
    loadInitial,
    loadOlder,
    resync,
    send,
    retryFailed,
    refresh,
    edit,
    unsend,
    ingestDto,
    applyReaction,
    toggleReaction,
  };
}

export const messagesStore = createRoot(createMessagesStore);
