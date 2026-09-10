// E2EE v2 session store. Sessions are X3DH-established Double Ratchet
// channels per peer (see src-tauri/src/e2ee2.rs). The webview keeps no
// key material — it only orchestrates bundle fetches and session setup.
//
// Flow:
//   - first send to a peer: fetch their prekey bundle + claim a one-time
//     prekey, run X3DH in the Rust core, then encrypt
//   - first receive: the ciphertext header carries the sender's X3DH
//     payload; the Rust core reproduces the session from our prekeys
//   - after that, both sides just ratchet
//
// "No bundle yet" is a normal, self-resolving race (the peer publishes
// theirs on sign-in) and is deliberately not cached.

import { api } from "../data/api";
import {
  e2ee2Bundle,
  e2ee2Decrypt,
  e2ee2Encrypt,
  e2ee2HasSession,
  e2ee2NewPrekeys,
  e2ee2StartSession,
  e2eeAvailable,
  megolmDecrypt,
  megolmEncrypt,
  megolmImportKey,
  type PrekeyBundle,
} from "../lib/tauri";


const PREKEY_BATCH = 50;
const PREKEY_LOW_WATER = 10;

function createE2eeStore() {
  /** Serialization guard: one session setup per peer at a time. */
  const setups = new Map<string, Promise<boolean>>();

  /** Publish our bundle + top up one-time prekeys. Called at sign-in. */
  const publishIdentity = async (): Promise<void> => {
    if (!e2eeAvailable) return;
    const bundle = await e2ee2Bundle();
    await api.publishBundle(bundle).catch((e) => {
      // A 404/405 here means the server predates E2EE v2 — nothing will
      // work until it's updated; say so loudly instead of failing silently.
      console.error("[atlas] prekey bundle publish failed (server too old?):", e);
      throw e;
    });
    const { available } = await api.prekeyCount();
    if (available < PREKEY_LOW_WATER) {
      const pubs = await e2ee2NewPrekeys(PREKEY_BATCH);
      await api.uploadPrekeys(pubs);
    }
  };

  /** Republish identity + always mint a fresh batch of one-time prekeys. */
  const replenishKeys = async (): Promise<void> => {
    if (!e2eeAvailable) throw new Error("E2EE unavailable");
    const bundle = await e2ee2Bundle();
    await api.publishBundle(bundle);
    const pubs = await e2ee2NewPrekeys(PREKEY_BATCH);
    if (pubs.length) await api.uploadPrekeys(pubs);
  };

  /**
   * Ensure a ratchet session exists with this peer. Returns false when the
   * peer hasn't published a bundle yet (caller should retry shortly).
   */
  const ensureSession = async (peer: string): Promise<boolean> => {
    if (!e2eeAvailable) return false;
    if (await e2ee2HasSession(peer)) return true;
    let pending = setups.get(peer);
    if (!pending) {
      pending = (async () => {
        try {
          const bundle: PrekeyBundle = await api.getBundle(peer);
          // One-time prekeys are best-effort: if the pool is empty the
          // session still establishes (3-DH instead of 4-DH).
          const opk = await api.claimPrekey(peer).then((p) => p.package).catch(() => null);
          if (!opk) {
            console.error("[atlas] olm: peer has no one-time prekeys yet");
            return false;
          }
          await e2ee2StartSession(peer, bundle, opk);
          return true;
        } catch (e) {
          console.error("[atlas] session setup failed (peer bundle missing?):", e);
          return false;
        } finally {
          setups.delete(peer);
        }
      })();
      setups.set(peer, pending);
    }
    return pending;
  };

  /** Encrypt for a peer with an established session. */
  const seal = async (peer: string, plaintext: string): Promise<string> => {
    const ok = await ensureSession(peer);
    if (!ok) {
      console.error(`[atlas] e2ee: no session with ${peer} — bundle fetch/X3DH failed (see error above)`);
      throw new Error("Can't send yet: this contact hasn't set up encryption on their device.");
    }
    return e2ee2Encrypt(peer, plaintext).catch((e) => {
      console.error(`[atlas] e2ee: encrypt failed for ${peer}:`, e);
      throw e;
    });
  };

  /** Decrypt a dr-v1 body from a peer. */
  const open = (peer: string, body: string): Promise<string> => e2ee2Decrypt(peer, body);

  /** Encryption is always on for DMs when the platform supports it. */
  const enabledFor = (_chatId: string) => e2eeAvailable;

  const hasSession = (peer: string): Promise<boolean> =>
    e2eeAvailable ? e2ee2HasSession(peer) : Promise.resolve(false);

  const sharedKey = (chatId: string, sessionId: string) => `atlas.megolm.shared.${chatId}.${sessionId}`;

  function loadShared(chatId: string, sessionId: string): Set<string> {
    try {
      const raw = localStorage.getItem(sharedKey(chatId, sessionId));
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }
  function saveShared(chatId: string, sessionId: string, ids: Set<string>) {
    try {
      localStorage.setItem(sharedKey(chatId, sessionId), JSON.stringify([...ids]));
    } catch {
      /* ignore */
    }
  }

  /** Encrypt a group message: Megolm ciphertext + Olm-wrapped session keys. */
  const sealGroup = async (
    chatId: string,
    memberIds: string[],
    plaintext: string,
    me: string,
  ): Promise<string> => {
    if (!e2eeAvailable) throw new Error("E2EE unavailable");
    const sealed = await megolmEncrypt(chatId, plaintext);
    const already = loadShared(chatId, sealed.sessionId);
    already.add(me);
    const shares: Record<string, string> = {};
    const payload = JSON.stringify({ sessionId: sealed.sessionId, sessionKey: sealed.sessionKey });
    for (const member of memberIds) {
      if (!member || member === me || already.has(member)) continue;
      try {
        shares[member] = await seal(member, payload);
        already.add(member);
      } catch (e) {
        console.warn("[atlas] megolm: could not share session with", member, e);
      }
    }
    saveShared(chatId, sealed.sessionId, already);
    await megolmImportKey(chatId, me, sealed.sessionId, sealed.sessionKey);
    return JSON.stringify({
      sessionId: sealed.sessionId,
      ciphertext: sealed.ciphertext,
      shares,
    });
  };

  const openGroup = async (
    chatId: string,
    senderId: string,
    body: string,
    me: string,
  ): Promise<string> => {
    const parsed = JSON.parse(body) as {
      sessionId: string;
      ciphertext: string;
      shares?: Record<string, string>;
    };
    const mine = parsed.shares?.[me];
    if (mine) {
      const raw = await open(senderId, mine);
      const key = JSON.parse(raw) as { sessionId: string; sessionKey: string };
      await megolmImportKey(chatId, senderId, key.sessionId, key.sessionKey);
    }
    return megolmDecrypt(chatId, senderId, parsed.sessionId, parsed.ciphertext);
  };

  return {
    publishIdentity,
    replenishKeys,
    ensureSession,
    seal,
    open,
    sealGroup,
    openGroup,
    enabledFor,
    hasSession,
  };
}

export const e2ee = createE2eeStore();
