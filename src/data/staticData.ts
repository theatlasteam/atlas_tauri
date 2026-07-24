// Client-side option lists (pure preferences, not server data).

import type { NotificationSound, Wallpaper } from "./types";

export const NOTIFICATION_SOUNDS: NotificationSound[] = [
  { id: "chime", name: "Chime" },
  { id: "pulse", name: "Pulse" },
  { id: "note", name: "Note" },
  { id: "drop", name: "Drop" },
  { id: "none", name: "None" },
];

export const WALLPAPERS: Wallpaper[] = [
  { id: "none", name: "Plain", preview: "var(--color-bg)" },
  { id: "dawn", name: "Dawn", preview: "linear-gradient(160deg, #f6e3c8, #f4c9a8 45%, #eda98f)" },
  { id: "dusk", name: "Dusk", preview: "linear-gradient(160deg, #2c2440, #402b4d 45%, #522f45)" },
  { id: "grove", name: "Grove", preview: "linear-gradient(160deg, #e2ecd8, #c4dcc0 45%, #9fc7ae)" },
  { id: "paper", name: "Paper", preview: "#efe8d8" },
];
