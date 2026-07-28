// Local-only conversations with Compass — not chats, not message rows,
// nothing server-side at all. Each turn is one stateless request to
// /api/compass/complete (see api.ts); the server never persists any of it.
// The only place any of this exists is here, in this device's own
// localStorage — same spirit as preferences.ts, just bigger, and now
// multiple threads instead of one.

import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { api } from "../data/api";

export interface CompassTurn {
  role: "user" | "assistant";
  content: string;
  sentAt: string;
  /** Set on the optimistic user turn while waiting for a reply. */
  pending?: boolean;
  failed?: boolean;
  /** Set on the assistant turn while its reply is still streaming in. */
  streaming?: boolean;
}

export interface CompassThread {
  id: string;
  /** First user message, trimmed — "New chat" until one exists. */
  title: string;
  turns: CompassTurn[];
  updatedAt: string;
}

const STORAGE_KEY = "atlas.compassChat.v2";
const OLD_STORAGE_KEY = "atlas.compassChat.v1";
const MAX_TURNS_PER_THREAD = 200;
const MAX_THREADS = 100;

function newId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function titleFrom(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

function loadInitial(): CompassThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CompassThread[];
    // One-time migration from the old single-thread shape.
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      const turns = JSON.parse(old) as CompassTurn[];
      if (turns.length > 0) {
        const firstUser = turns.find((t) => t.role === "user");
        return [
          {
            id: newId(),
            title: firstUser ? titleFrom(firstUser.content) : "",
            turns,
            updatedAt: turns[turns.length - 1]?.sentAt ?? new Date().toISOString(),
          },
        ];
      }
    }
    return [];
  } catch {
    return [];
  }
}

function createCompassChatStore() {
  const [threads, setThreads] = createStore<CompassThread[]>(loadInitial());

  const persist = () => {
    try {
      const bounded = threads
        .slice(0, MAX_THREADS)
        .map((t) => ({ ...t, turns: t.turns.slice(-MAX_TURNS_PER_THREAD) }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
      localStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      /* storage full or unavailable — the in-memory conversation still works */
    }
  };

  const byId = (id: string) => threads.find((t) => t.id === id);

  const create = (): string => {
    const id = newId();
    setThreads(
      produce((list) => {
        list.unshift({ id, title: "", turns: [], updatedAt: new Date().toISOString() });
      }),
    );
    persist();
    return id;
  };

  const remove = (id: string) => {
    setThreads((list) => list.filter((t) => t.id !== id));
    persist();
  };

  const send = async (threadId: string, content: string) => {
    const index = threads.findIndex((t) => t.id === threadId);
    if (index === -1) return;

    const userTurn: CompassTurn = { role: "user", content, sentAt: new Date().toISOString() };
    setThreads(index, "turns", threads[index].turns.length, userTurn);
    setThreads(index, "updatedAt", userTurn.sentAt);
    if (!threads[index].title) setThreads(index, "title", titleFrom(content));
    persist();

    const request = threads[index].turns
      .filter((t) => !t.pending && !t.failed)
      .map((t) => ({ role: t.role, content: t.content }));

    // The reply turn is appended once, empty, and grows in place as deltas
    // arrive — this is what lets the bubble render text incrementally
    // instead of popping in all at once when the stream finishes.
    const replyIndex = threads[index].turns.length;
    setThreads(index, "turns", replyIndex, {
      role: "assistant",
      content: "",
      sentAt: new Date().toISOString(),
      streaming: true,
    });

    const currentThreadIndex = () => threads.findIndex((t) => t.id === threadId);

    try {
      await api.compassCompleteStream(request, (delta) => {
        const at = currentThreadIndex();
        if (at === -1) return; // thread was deleted mid-stream
        setThreads(at, "turns", replyIndex, "content", (c) => c + delta);
      });
      const at = currentThreadIndex();
      if (at === -1) return;
      setThreads(at, "turns", replyIndex, "streaming", false);
      setThreads(at, "updatedAt", new Date().toISOString());
    } catch (e) {
      const at = currentThreadIndex();
      if (at !== -1) {
        // No content ever arrived — treat as a failed turn like before. If
        // some text did stream in before the error, keep it rather than
        // discarding a partial (but real) reply.
        if (!threads[at].turns[replyIndex]?.content) {
          setThreads(at, "turns", replyIndex, "failed", true);
        }
        setThreads(at, "turns", replyIndex, "streaming", false);
      }
      throw e;
    } finally {
      persist();
    }
  };

  return { threads, byId, create, remove, send };
}

export const compassChat = createRoot(createCompassChatStore);
