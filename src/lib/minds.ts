import type { MindDto, MindRoomDto } from "../data/api";

/** Max Minds in one room — mirrors MAX_ROOM_MINDS in routes/minds.rs. */
export const MAX_ROOM_MINDS = 4;
/** Max Minds per account — mirrors MAX_MINDS in routes/minds.rs. */
export const MAX_MINDS = 8;

/**
 * Turns a personality into one line you can show in a list.
 *
 * These prompts are prose people write in a textarea, often with newlines and
 * sometimes several paragraphs. Rendering that raw inside a list row makes the
 * list ragged, so collapse to the first sentence — far enough to recognise the
 * Mind, short enough not to dominate the row.
 */
export function personalitySummary(prompt: string, fallback: string): string {
  const flat = prompt.replace(/\s+/g, " ").trim();
  if (!flat) return fallback;
  const sentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const text = sentence.length > 90 ? `${sentence.slice(0, 90)}…` : sentence;
  return text;
}

/** Stable per-Mind accent used anywhere the Mind's colour isn't available. */
export function mindInitial(mind: MindDto): string {
  return mind.name.trim().charAt(0).toUpperCase() || "?";
}

/** "Ada & Bruno" — the same default the server uses when a room is unnamed. */
export function roomTitleFromMinds(minds: MindDto[]): string {
  if (minds.length === 0) return "Room";
  if (minds.length === 1) return minds[0]!.name;
  if (minds.length === 2) return `${minds[0]!.name} & ${minds[1]!.name}`;
  return `${minds[0]!.name} & ${minds.length - 1} others`;
}

/** The names of whoever is in a room, for a header subtitle. */
export function roomRoster(room: MindRoomDto): string {
  return room.minds.map((m) => m.name).join(", ");
}
