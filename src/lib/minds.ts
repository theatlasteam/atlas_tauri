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

export interface MindColorPreset {
  color: string;
  colorEnd: string;
}

export const MIND_PALETTE: MindColorPreset[] = [
  { color: "#FF0080", colorEnd: "#99004D" },
  { color: "#C9772E", colorEnd: "#7A4A1C" },
  { color: "#3B82F6", colorEnd: "#1D4ED8" },
  { color: "#22C55E", colorEnd: "#15803D" },
  { color: "#A855F7", colorEnd: "#6B21A8" },
  { color: "#E24B4A", colorEnd: "#991B1B" },
  { color: "#14B8A6", colorEnd: "#0F766E" },
  { color: "#F59E0B", colorEnd: "#B45309" },
  { color: "#06B6D4", colorEnd: "#0E7490" },
  { color: "#EC4899", colorEnd: "#BE185D" },
  { color: "#8B5CF6", colorEnd: "#5B21B6" },
  { color: "#64748B", colorEnd: "#334155" },
];

/** Darken a hex color by a ratio (default 35%) to generate a pleasing gradient bottom. */
export function darkenColor(hex: string, amount = 0.35): string {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return hex;
  const r = Math.max(0, Math.min(255, Math.floor((num >> 16) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.floor(((num >> 8) & 0xff) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.floor((num & 0xff) * (1 - amount))));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

