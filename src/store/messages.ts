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
import { allPlaintexts, cacheForChat, cachePut, forgetPlaintext, loadPlaintextsSync, putPlaintext } from "../data/messageCache";
import type { MessageDto } from "../data/generated";
import { toMessage } from "../data/mapping";
import type { Message } from "../data/types";
import { e2eeAvailable, e2eeOpen, isTauri } from "../lib/tauri";
import { mentionsCompass } from "../lib/compassMention";
import { loadCompassModel } from "../lib/compassModels";
import { emitMessageReceived, emitMessageSent, transformBeforeSend } from "../plugins/runtime";
import { e2ee } from "./e2ee";
import { compassUserId } from "./compassIdentity";
import { session } from "./session";

export const PAGE_SIZE = 50;

interface ChatMessages {
  messages: Message[];
  reachedStart: boolean; // no older history left
  loaded: boolean;
}

function createMessagesStore() {
  const [state, setState] = createStore<Record<string, ChatMessages>>({});
  /** Survives loadInitial wiping the in-memory list: a ciphertext must only
   *  be opened once (the ratchet advances). Live events decrypt in the
   *  background; opening the chat later must reuse this, not decrypt again. */
  const openedPlaintext = new Map<string, string>(Object.entries(loadPlaintextsSync()));

  const plaintextVersions = new Map<string, string>();
  const syncs = new Map<string, Promise<void>>();
  const decryptingVersions = new Set<string>();
  const myId = () => session.user()?.id ?? "";
  const forget = (id: string) => {
    openedPlaintext.delete(id);
    plaintextVersions.delete(id);
    void forgetPlaintext(id);
  };

  const rememberPlaintext = (messageId: string, text: string, seed?: Message) => {
    if (text && text !== "🔒 Encrypted message" && !text.startsWith("🔒 ")) {
      openedPlaintext.set(messageId, text);
      if (seed?.contentVersion) plaintextVersions.set(messageId, seed.contentVersion);
      void putPlaintext(messageId, seed?.chatId ?? "", text);
      if (seed) void cachePut({ ...seed, text, decrypting: false, decryptFailed: false, sourceText: text });
    }
  };

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
    const version = state[chatId]?.messages.find((m) => m.id === messageId)?.contentVersion;
    const isCurrent = () => {
      const row = state[chatId]?.messages.find((m) => m.id === messageId);
      return !!row && !row.deleted && row.contentVersion === version;
    };
    const decryptKey = JSON.stringify([chatId, messageId, version]);
    if (decryptingVersions.has(decryptKey)) return;
    const already = openedPlaintext.get(messageId);
    if (already && !already.startsWith("🔒 ")) {
      patch(chatId, messageId, { text: already, decrypting: false, decryptFailed: false, sourceText: already });
      return;
    }
    if (!e2eeAvailable || (scheme !== "olm-v1" && scheme !== "dr-v1" && scheme !== "x25519-v1")) {
      patch(chatId, messageId, { text: "🔒 Encrypted message (unsupported here)", decrypting: false });
      return;
    }
    // Legacy x25519-v1 bodies (pre-ratchet history) still open through the
    // old static-DH path; new traffic is dr-v1 only.
    if (scheme === "x25519-v1") {
      const otherId = peerUserId ?? "";
      decryptingVersions.add(decryptKey);
      void (async () => {
        try {
          const { identityKey } = await api.getIdentity(otherId);
          if (!identityKey) throw new Error("no key");
          const text = await e2eeOpen(identityKey, body);
          if (!isCurrent()) return;
          const row = state[chatId]?.messages.find((m) => m.id === messageId);
          rememberPlaintext(messageId, text, row ? { ...row, text } : undefined);
          patch(chatId, messageId, { text, decrypting: false, decryptFailed: false });
        } catch {
          if (!isCurrent()) return;
          patch(chatId, messageId, { text: "🔒 Unable to decrypt", decrypting: false, decryptFailed: true });
        }
      })().finally(() => decryptingVersions.delete(decryptKey));
      return;
    }
    const otherId = peerUserId ?? "";
    if (!otherId) {
      patch(chatId, messageId, { text: "🔒 Unable to decrypt", decrypting: false, decryptFailed: true });
      return;
    }
    decryptingVersions.add(decryptKey);
    void (async () => {
      // The first message of a new conversation carries the sender's X3DH
      // payload and establishes the session on open; a brand-new peer's
      // prekey bundle can still race its own sign-in publish, so retry a
      // few times before surfacing a real failure.
      const attempts = [0, 1000, 3000, 6000, 12000];
      for (let i = 0; i < attempts.length; i++) {
        if (attempts[i]) await sleep(attempts[i]);
        if (!isCurrent()) return;
        const hit = openedPlaintext.get(messageId);
        if (hit && !hit.startsWith("🔒 ")) {
          patch(chatId, messageId, { text: hit, decrypting: false, decryptFailed: false, sourceText: hit });
          return;
        }
        try {
          const text = await Promise.race([
            e2ee.open(otherId, body),
            sleep(8000).then(() => {
              throw new Error("decrypt timeout");
            }),
          ]);
          if (!isCurrent()) return;
          const row = state[chatId]?.messages.find((m) => m.id === messageId);
          rememberPlaintext(messageId, text, row ? { ...row, text } : undefined);
          patch(chatId, messageId, { text, decrypting: false, decryptFailed: false });
          return;
        } catch (e) {
          console.warn("[atlas] decrypt attempt failed", messageId, e);
        }
      }
      if (isCurrent()) patch(chatId, messageId, { text: "🔒 Unable to decrypt", decrypting: false, decryptFailed: true });
    })().finally(() => decryptingVersions.delete(decryptKey));
  };

  /**
   * Re-attempt every message in a chat that previously gave up decrypting.
   * Called when the chat is opened (see ChatView) — cheap (a handful of
   * `refresh` calls at most, since most chats have none), and turns "stuck
   * forever this session" into "fixes itself the next time you look at it"
   * once the peer's key has actually propagated.
   */
  const retryFailedDecryptions = (chatId: string, peerUserId?: string) => {
    const failed = state[chatId]?.messages.filter((m) => m.decryptFailed) ?? [];
    for (const m of failed) void refresh(m.id, peerUserId);
  };

  /**
   * An encrypted chat's @compass mention: this client is the only party
   * that actually has the plaintext, so it builds the transcript, calls the
   * gateway itself, and hands the finished reply to the server to post
   * under Compass's identity. The server never sees this chat's plaintext
   * at any point — see api.ts's compassComplete/compassReply docs.
   */
  const replyAsCompass = async (chatId: string) => {
    try {
      const compassId = await compassUserId();
      const turns: { role: "user" | "assistant"; content: string }[] = (state[chatId]?.messages ?? [])
        .filter((m) => !m.pending && !m.failed && !m.deleted && !m.callLog && m.text)
        .slice(-20)
        .map((m) => ({ role: m.authorId === compassId ? "assistant" : "user", content: m.text }));
      if (turns.length === 0) return;
      const { reply } = await api.compassComplete(turns, loadCompassModel());
      await api.compassReply(chatId, reply);
    } catch (e) {
      console.warn("[atlas] compass reply failed:", e);
    }
  };

  const patch = (chatId: string, messageId: string, changes: Partial<Message>) => {
    setState(
      chatId,
      "messages",
      (m) => m.id === messageId,
      (m) => ({ ...m, ...changes }),
    );
    const row = state[chatId]?.messages.find((m) => m.id === messageId);
    if (row) void cachePut(row);
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
          const prev = chat.messages[existing]!;
          if (prev.deleted && !message.deleted) return;
          if (!message.deleted && prev.editedAt && (!message.editedAt || prev.editedAt > message.editedAt)) return;
          const sameVersion = !!message.contentVersion && prev.contentVersion === message.contentVersion;
          const keepText = !message.deleted && message.decrypting && sameVersion
            ? (openedPlaintext.get(message.id) ?? (!prev.decrypting && !prev.decryptFailed ? prev.text : undefined))
            : undefined;
          chat.messages[existing] = {
            ...prev,
            ...message,
            sourceText: message.sourceText,
            ...(keepText
              ? { text: keepText, decrypting: false, decryptFailed: false, sourceText: keepText }
              : null),
          };
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
    const written = state[chatId]?.messages.find((m) => m.id === message.id) ?? message;
    if (!written.pending && !written.decrypting) void cachePut(written);
  };

  const ingestDto = (dto: MessageDto, opts?: { peerUserId?: string }) => {
    const message = toMessage(dto, myId());
    const previous = state[dto.chatId]?.messages.find((m) => m.id === dto.id);
    if (previous?.deleted && !message.deleted) return previous;
    if (!message.deleted && previous?.editedAt && (!message.editedAt || previous.editedAt > message.editedAt)) return previous;
    if (message.deleted) {
      forget(dto.id);
      upsert(dto.chatId, { ...message, sourceText: undefined, attachment: undefined });
      return message;
    }
    const knownVersion = plaintextVersions.get(dto.id) ?? previous?.contentVersion;
    // Legacy unversioned caches are only safe for never-edited messages.
    if ((knownVersion && knownVersion !== message.contentVersion) || (!knownVersion && message.editedAt)) forget(dto.id);
    const cached = openedPlaintext.get(dto.id);
    // Double Ratchet cannot open our own ciphertext after send() already
    // advanced the sending chain. Feeding the echo into decrypt() poisons
    // the session (it looks like a new DH from the peer). Keep the plaintext
    // we already had on the optimistic row.
    if (message.mine && message.decrypting) {
      ensure(dto.chatId);
      const pending = state[dto.chatId]?.messages.find(
        (m) => (message.clientTag && m.clientTag === message.clientTag && m.pending) || (m.pending && m.mine),
      );
      const kept = cached ?? (!message.editedAt ? pending?.sourceText ?? pending?.text : undefined);
      if (kept && kept !== "🔒 Encrypted message" && !kept.startsWith("🔒 ")) {
        rememberPlaintext(dto.id, kept, { ...message, text: kept, decrypting: false });
        message.text = kept;
        message.decrypting = false;
        message.sourceText = kept;
        upsert(dto.chatId, message);
        return message;
      }
      message.decrypting = false;
      upsert(dto.chatId, message);
      return message;
    }
    if (cached && message.decrypting) {
      if (message.contentVersion) plaintextVersions.set(dto.id, message.contentVersion);
      message.text = cached;
      message.decrypting = false;
      message.decryptFailed = false;
      upsert(dto.chatId, message);
      return message;
    }
    const already = state[dto.chatId]?.messages.find((m) => m.id === dto.id);
    if (message.decrypting && already && already.contentVersion === message.contentVersion && !already.decrypting && !already.decryptFailed && already.text && !already.text.startsWith("🔒 ")) {
      rememberPlaintext(dto.id, already.text, already);
      message.text = already.text;
      message.decrypting = false;
      upsert(dto.chatId, message);
      return message;
    }
    upsert(dto.chatId, message);
    if (message.decrypting) {
      decrypt(dto.chatId, dto.id, dto.scheme, dto.body, message.authorId || opts?.peerUserId);
    }
    // Plugins observe messages that reached this device (never our own echo,
    // and not the still-sealed bodies). Fire-and-forget by design.
    if (!message.mine && !message.deleted && !message.decrypting && !message.decryptFailed) {
      emitMessageReceived({
        chatId: dto.chatId,
        text: message.text,
        mine: false,
        authorId: message.authorId,
        sentAt: message.sentAt,
      });
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
    if (!isTauri) {
      const { loadE2eeWasm } = await import("../lib/e2ee-wasm");
      await loadE2eeWasm();
    }
    for (const [id, text] of Object.entries(await allPlaintexts())) {
      openedPlaintext.set(id, text);
    }
    const local = await cacheForChat(chatId);
    for (const row of local) {
      if (row.deleted) { forget(row.id); continue; }
      if (row.text && !row.decrypting && !row.decryptFailed) {
        openedPlaintext.set(row.id, row.text);
        if (row.contentVersion) plaintextVersions.set(row.id, row.contentVersion);
      }
    }
    if (state[chatId].loaded) {
      for (const row of local) {
        if (!state[chatId].messages.some((m) => m.id === row.id)) upsert(chatId, row);
      }
      await resync(chatId, peerUserId);
      return;
    }
    if (local.length > 0) {
      setState(chatId, {
        messages: local.map((m) => ({ ...m, mine: m.authorId === myId() || m.mine })),
        reachedStart: false,
        loaded: true,
      });
    }
    const dtos = await api.listMessages(chatId, { limit: PAGE_SIZE });
    const hadLive = (state[chatId].messages?.length ?? 0) > 0;
    if (!hadLive) {
      setState(chatId, { messages: [], reachedStart: dtos.length < PAGE_SIZE, loaded: true });
    } else {
      setState(chatId, "loaded", true);
      setState(chatId, "reachedStart", dtos.length < PAGE_SIZE);
    }
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
  const resync = (chatId: string, peerUserId?: string): Promise<void> => {
    const running = syncs.get(chatId);
    if (running) return running;
    const task = (async () => {
      const chat = state[chatId];
      if (!chat?.loaded) return;
      let cursor = [...chat.messages].reverse().find((m) => !m.pending && !m.failed)?.id;
      while (true) {
        const dtos = await api.listMessages(chatId, cursor ? { after: cursor, limit: 200 } : { limit: PAGE_SIZE });
        for (const dto of dtos) ingestDto(dto, { peerUserId });
        if (!cursor || dtos.length < 200) break;
        const next = dtos[dtos.length - 1]?.id;
        if (!next || next <= cursor) break;
        cursor = next;
      }
    })();
    syncs.set(chatId, task);
    void task.finally(() => { if (syncs.get(chatId) === task) syncs.delete(chatId); }).catch(() => {});
    return task;
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

    // Plugin hooks run before anything is sent: a plugin can rewrite the
    // text (e.g. append a signature) or return null to veto the send.
    const pluginText = await transformBeforeSend(chatId, text);
    if (pluginText === null) return;
    text = pluginText;
    if (!text.trim()) return;

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
      scheme: mustEncrypt ? "olm-v1" : "plain",
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

    // Computed from the plaintext we're about to encrypt, not something the
    // server could ever derive itself for an E2EE chat. Skipped for a time
    // capsule: it'd give away that the hidden body mentions Compass (and
    // trigger a reply) before the capsule is supposed to open at all.
    const mentioned = !opts?.unlockAt && mentionsCompass(text);

    try {
      let scheme = "plain";
      let body = text;
      if (mustEncrypt) {
        body = await e2ee.seal(opts!.peerUserId!, text);
        scheme = "olm-v1";
      }

      const dto = await api.sendMessage(chatId, {
        scheme,
        body,
        clientTag,
        replyToId: opts?.replyToId,
        attachmentId: opts?.attachmentId,
        unlockAt: opts?.unlockAt,
        mentionsCompass: mentioned,
      });
      const message = toMessage(dto, myId());
      message.clientTag = clientTag;
      if (message.decrypting) {
        // We know the plaintext we just sent; skip the decrypt round-trip.
        message.text = text;
        message.decrypting = false;
      }
      rememberPlaintext(message.id, text, { ...message, text });
      upsert(chatId, message);

      // Plugins observe messages that actually made it out (their own sends
      // too — onSent hooks run for every sent message).
      emitMessageSent({
        chatId,
        text,
        mine: true,
        messageId: message.id,
        sentAt: message.sentAt,
      });

      // A 'plain' (group) mention is handled entirely server-side — it can
      // already read the message. An encrypted chat's server never can, so
      // this client — the only party that actually has the plaintext —
      // generates the reply itself and hands the finished text to the
      // server to post under Compass's identity.
      if (mentioned && mustEncrypt) void replyAsCompass(chatId);
    } catch (e) {
      console.error("[atlas] send failed:", e);
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
    const previousEditedAt = message.editedAt;
    patch(chatId, message.id, { text: trimmed });
    try {
      let scheme = "plain";
      let body = trimmed;
      if (peerUserId && e2ee.enabledFor(chatId)) {
        body = await e2ee.seal(peerUserId, trimmed);
        scheme = "olm-v1";
      }
      const dto = await api.editMessage(message.id, { scheme, body });
      // The echoed DTO carries ciphertext we already know the plaintext of.
      const updated = toMessage(dto, myId());
      if (updated.decrypting) {
        updated.text = trimmed;
        updated.decrypting = false;
      }
      rememberPlaintext(updated.id, trimmed, { ...updated, text: trimmed, sourceText: trimmed });
      upsert(chatId, updated);
    } catch (e) {
      patch(chatId, message.id, { text: previous, editedAt: previousEditedAt });
      throw e;
    }
  };

  /** Unsend for everyone. Optimistic: the tombstone is what the server will
   *  send back anyway, and rolling it back on failure keeps that honest. */
  const unsend = async (chatId: string, message: Message) => {
    const before = { text: message.text, sourceText: message.sourceText, deleted: message.deleted, attachment: message.attachment };
    patch(chatId, message.id, { text: "Message deleted", sourceText: undefined, deleted: true, attachment: undefined });
    try {
      await api.deleteMessage(message.id);
      forget(message.id);
      patch(chatId, message.id, { contentVersion: undefined, sourceText: undefined });
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
    retryFailedDecryptions,
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
