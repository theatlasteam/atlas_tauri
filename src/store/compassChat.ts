// A separate, local-only conversation with Compass — not a chat, not a
// message row, nothing server-side at all. Each turn is one stateless
// request to /api/compass/complete (see api.ts); the server never persists
// any of it. The only place this conversation exists is here, in this
// device's own localStorage — same spirit as preferences.ts, just bigger.

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { api } from "../data/api";

export interface CompassTurn {
  role: "user" | "assistant";
  content: string;
  sentAt: string;
  /** Set on the optimistic user turn while waiting for a reply. */
  pending?: boolean;
  failed?: boolean;
}

const STORAGE_KEY = "atlas.compassChat.v1";

function loadInitial(): CompassTurn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompassTurn[]) : [];
  } catch {
    return [];
  }
}

function createCompassChatStore() {
  const [turns, setTurns] = createStore<CompassTurn[]>(loadInitial());

  const persist = () => {
    try {
      // Bounded so a very long-lived local conversation can't grow
      // localStorage without limit — same reasoning as the server's own
      // HISTORY_LIMIT for group mentions.
      const trimmed = turns.slice(-200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* storage full or unavailable — the in-memory conversation still works */
    }
  };

  const send = async (content: string) => {
    const userTurn: CompassTurn = { role: "user", content, sentAt: new Date().toISOString() };
    setTurns(turns.length, userTurn);
    persist();

    try {
      const request = turns
        .filter((t) => !t.pending && !t.failed)
        .map((t) => ({ role: t.role, content: t.content }));
      request.push({ role: "user", content });
      const { reply } = await api.compassComplete(request);
      setTurns(turns.length, { role: "assistant", content: reply, sentAt: new Date().toISOString() });
    } catch (e) {
      setTurns(turns.length - 1, "failed", true);
      throw e;
    } finally {
      persist();
    }
  };

  const clear = () => {
    setTurns([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return { turns, send, clear };
}

export const compassChat = createRoot(createCompassChatStore);
