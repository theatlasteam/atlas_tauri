// Compass Minds (Atlas X) — the client-side half of routes/minds.rs.
//
// Unlike store/compassChat.ts this is *not* local-only: Minds and their rooms
// live in Postgres so they follow your account between devices. The client
// holds no derived state it couldn't refetch — the only thing it adds is who
// is currently mid-reply, which is a fact about an in-flight request and not
// about the data.

import { createEffect, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { api, type MindDto, type MindMessageDto, type MindRoomDto, type MindRunDto, type MindScheduleDto } from "../data/api";
import { session } from "./session";
import { t } from "../lib/i18n";

/** One item of a Mind's live stream, in the exact order it happened. */
export type LiveEvent =
  | { kind: "say"; text: string }
  | { kind: "tool"; name: string; args: string; output: string; state: "running" | "done" };

function createMindsStore() {
  const [state, setState] = createStore<{
    /** null until the first load — lets the UI tell "no Minds" from "not loaded yet". */
    minds: MindDto[] | null;
    rooms: MindRoomDto[] | null;
    messages: Record<string, MindMessageDto[]>;
    schedules: Record<string, MindScheduleDto[]>;
    runs: Record<string, MindRunDto[]>;
    /** Mind ids currently being waited on, per room. */
    thinking: Record<string, string[]>;
    /** Server-advertised Minds access (Atlas X bit or FREE_MINDS flag).
     *  Null until the first check — UI falls back to the account bit. */
    access: boolean | null;
    /** Live streaming state per mind while a run is in flight. */
    live: Record<string, {
      status: string;
      /** One chronological stream: `say` notes and tool cards in the exact
       *  order the Mind produced them — never grouped by kind. */
      events: LiveEvent[];
    }>;
    error: string | null;
  }>({ minds: null, rooms: null, messages: {}, schedules: {}, runs: {}, thinking: {}, live: {}, access: null, error: null });

  const setError = (e: unknown, fallback: string) => {
    setState("error", e instanceof Error ? e.message : fallback);
  };

  const checkAccess = async () => {
    try {
      const res = await api.mindAccess();
      setState("access", res.allowed);
      return res.allowed;
    } catch {
      /* access stays at its last value; the account bit covers us */
      return hasAccess();
    }
  };

  const loadMinds = async () => {
    try {
      setState("minds", await api.listMinds());
      // A successful load heals the banner: without this a single stale 404
      // (e.g. a room fetch fired with a mind id during a deep-link race)
      // sticks on screen forever, rendered by every Minds surface at once.
      setState("error", null);
    } catch (e) {
      setError(e, "Couldn't load Minds.");
    }
    await checkAccess();
  };

  /** Server-advertised gate: flag-aware access, falling back to the
   *  account's own Atlas X bit until the first check lands. */
  const hasAccess = () => state.access ?? session.user()?.atlasX === true;

  createEffect(() => {
    if (session.status() === "signedIn") {
      void checkAccess();
    } else if (session.status() === "signedOut") {
      reset();
    }
  });

  const loadRooms = async () => {
    try {
      setState("rooms", await api.listMindRooms());
      setState("error", null);
    } catch (e) {
      setError(e, "Couldn't load rooms.");
    }
  };

  /** Both lists, at once — the screen needs them together and they're cheap. */
  const refresh = async () => {
    await Promise.all([loadMinds(), loadRooms()]);
  };

  const createMind = async (name: string, prompt: string, tools?: Record<string, boolean>) => {
    setState("error", null);
    const mind = await api.createMind({ name: name.trim(), prompt: prompt.trim(), tools });
    setState("minds", (list) => [...(list ?? []), mind]);
    return mind;
  };

  const updateMind = async (
    id: string,
    name: string,
    prompt: string,
    opts?: { tools?: Record<string, boolean>; isActive?: boolean },
  ) => {
    setState("error", null);
    const updated = await api.updateMind(id, {
      name: name.trim(),
      prompt: prompt.trim(),
      ...opts,
    });
    setState("minds", (list) => (list ?? []).map((m) => (m.id === id ? updated : m)));
    // A Mind's name/colour is denormalised into every room it's in, so patch
    // those too — otherwise the room header keeps the old name until a reload.
    setState("rooms", (list) =>
      (list ?? []).map((room) => ({
        ...room,
        minds: room.minds.map((m) => (m.id === id ? updated : m)),
      })),
    );
    return updated;
  };

  const deleteMind = async (id: string) => {
    setState("error", null);
    await api.deleteMind(id);
    setState("minds", (list) => (list ?? []).filter((m) => m.id !== id));
    // Dropped from rooms too; the server keeps their past lines (ON DELETE SET
    // NULL) so the transcript still reads correctly, just without an author.
    setState("rooms", (list) =>
      (list ?? []).map((room) => ({ ...room, minds: room.minds.filter((m) => m.id !== id) })),
    );
    setState("messages", produce((map) => delete map[id]));
  };

  const createRoom = async (mindIds: string[], title?: string) => {
    setState("error", null);
    const room = await api.createMindRoom({ mindIds, title: title?.trim() || undefined });
    setState("rooms", (list) => [room, ...(list ?? [])]);
    return room;
  };

  const deleteRoom = async (id: string) => {
    setState("error", null);
    await api.deleteMindRoom(id);
    setState("rooms", (list) => (list ?? []).filter((r) => r.id !== id));
    setState("messages", produce((map) => delete map[id]));
    setState("thinking", produce((map) => delete map[id]));
  };

  const loadMessages = async (roomId: string) => {
    try {
      setState("messages", roomId, await api.listMindMessages(roomId));
      setState("error", null);
    } catch (e) {
      setError(e, "Couldn't load this room.");
    }
  };

  /**
   * One turn. Every Mind replies in order and can see the ones before it, so
   * this is a single round trip that resolves with the whole room's response.
   *
   * The `thinking` list is the optimistic part: it's set before the request so
   * the room shows the Minds it's waiting on in the order they'll answer, and
   * cleared when the replies land.
   */
  const sendTurn = async (roomId: string, text: string, mindIds: string[]) => {
    setState("error", null);
    setState("thinking", roomId, mindIds);
    try {
      const messages = await api.sendMindTurn(roomId, text);
      setState("messages", roomId, messages);
      return messages;
    } catch (e) {
      setError(e, "Couldn't reach the room.");
      throw e;
    } finally {
      setState("thinking", roomId, []);
    }
  };

  /** Forget cached transcripts on sign-out; the next account reloads them. */
  const reset = () => {
    setState({ minds: null, rooms: null, messages: {}, schedules: {}, runs: {}, thinking: {}, live: {}, access: null, error: null });
  };

  const loadRuns = async (mindId: string) => {
    try {
      const runs = await api.listMindRuns(mindId);
      setState("runs", mindId, runs);
      setState("error", null);
      return runs;
    } catch (e) {
      setError(e, "Couldn't load runs.");
      return [];
    }
  };

  const runMind = async (mindId: string, input: string) => {
    setState("error", null);
    try {
      const run = await api.runMind(mindId, input);
      setState("runs", mindId, (list) => [run, ...(list ?? [])]);
      // Refresh minds to update lastRunAt / lastStatus
      void loadMinds();
      return run;
    } catch (e) {
      setError(e, "Failed to run Mind.");
      throw e;
    }
  };

  /**
   * Streaming run: the same job, but `say` notes and tool activity land in
   * `live[mindId]` in real time so the chat reads like a conversation —
   * "Checking the price now…", tool activity, then the final answer — instead
   * of one long silence followed by everything at once.
   */
  const runMindLive = async (mindId: string, input: string, opts?: { signal?: AbortSignal }) => {
    setState("error", null);
    setState("live", mindId, { status: t("minds.statusTyping"), events: [] });
    try {
      const run = await api.runMindStream(
        mindId,
        input,
        (ev) => {
          if (ev.kind === "status") {
            const key = typeof ev.data?.text === "string" ? ev.data.text : "";
            if (key) setState("live", mindId, "status", statusText(key));
          } else if (ev.kind === "say") {
            const text = typeof ev.data?.text === "string" ? ev.data.text : "";
            if (text) {
              const item: LiveEvent = { kind: "say", text };
              setState("live", mindId, "events", (list) => [...list, item]);
            }
          } else if (ev.kind === "tool_start") {
            const name = typeof ev.data?.name === "string" ? ev.data.name : "working";
            const args =
              typeof ev.data?.arguments === "string"
                ? ev.data.arguments
                : JSON.stringify(ev.data?.arguments ?? {});
            const item: LiveEvent = { kind: "tool", name, args, output: "", state: "running" };
            setState("live", mindId, "events", (list) => [...list, item]);
            setState("live", mindId, "status", toolStatus(name));
          } else if (ev.kind === "tool_end") {
            const name = typeof ev.data?.name === "string" ? ev.data.name : "working";
            const output = typeof ev.data?.outputPreview === "string" ? ev.data.outputPreview : "";
            setState("live", mindId, "events", (list) => {
              const next: LiveEvent[] = [...list];
              for (let i = next.length - 1; i >= 0; i--) {
                const item = next[i];
                if (item.kind === "tool" && item.state === "running" && (item.name === name || name === "working")) {
                  next[i] = { ...item, output, state: "done" };
                  break;
                }
              }
              return next;
            });
          }
        },
        opts,
      );
      setState("runs", mindId, (list) => [run, ...(list ?? [])]);
      void loadMinds();
      return run;
    } catch (e) {
      setError(e, "Failed to run Mind.");
      throw e;
    } finally {
      // Reconcile with the persisted transcript: if `done` was missed (a
      // dropped SSE tail), the server-side run still landed in mind_runs —
      // refetch so the answer appears instead of the run vanishing silently.
      void loadRuns(mindId);
      setState("live", (map) => {
        const next = { ...map };
        delete next[mindId];
        return next;
      });
    }
  };

  const clearLive = (mindId: string) => {
    setState("live", (map) => {
      if (!(mindId in map)) return map;
      const next = { ...map };
      delete next[mindId];
      return next;
    });
  };

  const loadSchedules = async (mindId: string) => {
    try {
      const list = await api.listMindSchedules(mindId);
      setState("schedules", mindId, list);
      setState("error", null);
      return list;
    } catch (e) {
      setError(e, "Couldn't load schedules.");
      return [];
    }
  };

  const createSchedule = async (
    mindId: string,
    body: { label: string; cronExpr: string; tz?: string; task: string },
  ) => {
    setState("error", null);
    const sched = await api.createMindSchedule(mindId, body);
    setState("schedules", mindId, (list) => [...(list ?? []), sched]);
    return sched;
  };

  const toggleSchedule = async (mindId: string, scheduleId: string) => {
    setState("error", null);
    const updated = await api.toggleMindSchedule(mindId, scheduleId);
    setState("schedules", mindId, (list) =>
      (list ?? []).map((s) => (s.id === scheduleId ? updated : s)),
    );
    return updated;
  };

  const deleteSchedule = async (mindId: string, scheduleId: string) => {
    setState("error", null);
    await api.deleteMindSchedule(mindId, scheduleId);
    setState("schedules", mindId, (list) => (list ?? []).filter((s) => s.id !== scheduleId));
  };

  return {
    state,
    hasAccess,
    checkAccess,
    refresh,
    loadMinds,
    loadRooms,
    createMind,
    updateMind,
    deleteMind,
    createRoom,
    deleteRoom,
    loadMessages,
    sendTurn,
    loadRuns,
    runMind,
    runMindLive,
    clearLive,
    loadSchedules,
    createSchedule,
    toggleSchedule,
    deleteSchedule,
    reset,
  };
}

export const mindsStore = createRoot(createMindsStore);

/** Human status line for a live tool name — shown under the Mind's name. */
export function toolStatus(name: string): string {
  switch (name) {
    case "browser":
      return t("minds.statusBrowsing");
    case "web_fetch":
      return t("minds.statusReading");
    case "shell":
      return t("minds.statusSandbox");
    case "set_schedule":
      return t("minds.statusSchedule");
    case "message_owner":
      return t("minds.statusSending");
    default:
      return t("minds.statusWorking");
  }
}

/** Maps a streaming status key from the server to a localized line. */
export function statusText(key: string): string {
  switch (key) {
    case "typing":
      return t("minds.statusTyping");
    case "browsing":
      return t("minds.statusBrowsing");
    case "reading":
      return t("minds.statusReading");
    case "sandbox":
      return t("minds.statusSandbox");
    default:
      return key;
  }
}

/** Look up a Mind that's in this room — transcripts only carry mind ids. */
export function mindInRoom(room: MindRoomDto | undefined, mindId: string | null): MindDto | undefined {
  if (!room || !mindId) return undefined;
  return room.minds.find((m) => m.id === mindId);
}
