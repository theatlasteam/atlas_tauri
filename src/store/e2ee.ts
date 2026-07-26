// Peer identity-key cache. DMs are always encrypted when the platform
// supports it (see e2eeAvailable) — there is no user-facing opt-out; all
// private-key operations happen in the Rust core (see src-tauri/src/e2ee.rs).

import { api } from "../data/api";
import { e2eeAvailable } from "../lib/tauri";

// A found key is cached, but not forever: "rotation requires re-registration"
// is a real, if rare, supported operation (e.g. reinstalling the app clears
// the on-device identity, and a fresh one gets published under the same
// account). Without a TTL, any peer whose app process fetched the old key
// before a rotation would keep encrypting to it for the rest of that
// process's lifetime, with nothing to prompt a refetch. A few minutes bounds
// how long that staleness window can last, at the cost of an occasional
// extra lookup.
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  promise: Promise<string | null>;
  fetchedAt: number;
}

function createE2eeStore() {
  const peerKeys = new Map<string, CacheEntry>();

  const fetchKey = (userId: string): Promise<string | null> => {
    const fetch = api
      .getIdentity(userId)
      .then((r) => r.identityKey)
      .catch(() => null);
    fetch.then((key) => {
      if (!key) peerKeys.delete(userId); // allow retry: not found or errored
    });
    peerKeys.set(userId, { promise: fetch, fetchedAt: Date.now() });
    return fetch;
  };

  /**
   * Peer's public identity key. A "not published yet" result is deliberately
   * NOT cached: it's a normal, self-resolving race (the peer publishes
   * theirs shortly after opening the app), and caching it would mean the
   * very first message exchanged before that happens permanently poisons
   * every later decrypt attempt for the rest of the session. A *found* key
   * is cached for CACHE_TTL_MS, then re-checked on next use — see above.
   *
   * Pass `fresh: true` to force an immediate re-fetch, bypassing both the
   * cache and its TTL — used after a decrypt failure, which is the one
   * signal we get that a cached key might already be stale.
   */
  const peerKey = (userId: string, opts?: { fresh?: boolean }): Promise<string | null> => {
    const cached = peerKeys.get(userId);
    if (cached && !opts?.fresh && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.promise;
    }
    return fetchKey(userId);
  };

  /** Encryption is always on for DMs when the platform supports it — no per-chat opt-out. */
  const enabledFor = (_chatId: string) => e2eeAvailable;

  /** Dev tool: drop every cached peer key, forcing the next lookup to hit the server. */
  const clearPeerKeyCache = () => {
    const count = peerKeys.size;
    peerKeys.clear();
    return count;
  };

  return { peerKey, enabledFor, clearPeerKeyCache };
}

export const e2ee = createE2eeStore();
