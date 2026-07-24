// Peer identity-key cache + per-chat encryption preference.
//
// The preference (which DMs send encrypted) is not secret, so it lives in
// localStorage; the keys involved are public keys; all private-key operations
// happen in the Rust core (see src-tauri/src/e2ee.rs).

import { createRoot, createSignal } from "solid-js";
import { api } from "../data/api";
import { e2eeAvailable } from "../lib/tauri";

const PREF_KEY = "atlas.e2ee.chats.v1";

function loadPrefs(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function createE2eeStore() {
  const [prefs, setPrefs] = createSignal<Record<string, boolean>>(loadPrefs());
  const peerKeys = new Map<string, Promise<string | null>>();

  /**
   * Peer's public identity key. Only a *found* key is cached — once
   * published, a key is stable for the session (rotation requires
   * re-registration server-side). A "not published yet" result is
   * deliberately NOT cached: it's a normal, self-resolving race (the peer
   * publishes theirs shortly after opening the app), and caching it would
   * mean the very first message exchanged before that happens permanently
   * poisons every later decrypt attempt with "peer key unavailable" for the
   * rest of the session.
   */
  const peerKey = (userId: string): Promise<string | null> => {
    const cached = peerKeys.get(userId);
    if (cached) return cached;

    const fetch = api
      .getIdentity(userId)
      .then((r) => r.identityKey)
      .catch(() => null);
    fetch.then((key) => {
      if (!key) peerKeys.delete(userId); // allow retry: not found or errored
    });
    peerKeys.set(userId, fetch);
    return fetch;
  };

  const enabledFor = (chatId: string) => e2eeAvailable && (prefs()[chatId] ?? false);

  const setEnabled = (chatId: string, enabled: boolean) => {
    const next = { ...prefs(), [chatId]: enabled };
    setPrefs(next);
    localStorage.setItem(PREF_KEY, JSON.stringify(next));
  };

  return { peerKey, enabledFor, setEnabled };
}

export const e2ee = createRoot(createE2eeStore);
