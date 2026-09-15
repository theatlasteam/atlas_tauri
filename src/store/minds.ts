// Compass Minds (Atlas X) — the client-side half of routes/minds.rs.
//
// Unlike store/compassChat.ts this is *not* local-only: Minds and their rooms
// live in Postgres so they follow your account between devices. The client
// holds no derived state it couldn't refetch — the only thing it adds is who
// is currently mid-reply, which is a fact about an in-flight request and not
// about the data.

import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { api, type MindDto, type MindMessageDto, type MindRoomDto, type MindRunDto, type MindScheduleDto } from "../data/api";

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
    error: string | null;
  }>({ minds: null, rooms: null, messages: {}, schedules: {}, runs: {}, thinking: {}, error: null });

  const setError = (e: unknown, fallback: string) => {
    setState("error", e instanceof Error ? e.message : fallback);
  };

  const loadMinds = async () => {
    try {
      setState("minds", await api.listMinds());
    } catch (e) {
      setError(e, "Couldn't load Minds.");
    }
  };

  const loadRooms = async () => {
    try {
      setState("rooms", await api.listMindRooms());
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
    setState({ minds: null, rooms: null, messages: {}, schedules: {}, runs: {}, thinking: {}, error: null });
  };

  const loadRuns = async (mindId: string) => {
    try {
      const runs = await api.listMindRuns(mindId);
      setState("runs", mindId, runs);
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

  const loadSchedules = async (mindId: string) => {
    try {
      const list = await api.listMindSchedules(mindId);
      setState("schedules", mindId, list);
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
    loadSchedules,
    createSchedule,
    toggleSchedule,
    deleteSchedule,
    reset,
  };
}

export const mindsStore = createRoot(createMindsStore);

/** Look up a Mind that's in this room — transcripts only carry mind ids. */
export function mindInRoom(room: MindRoomDto | undefined, mindId: string | null): MindDto | undefined {
  if (!room || !mindId) return undefined;
  return room.minds.find((m) => m.id === mindId);
}
