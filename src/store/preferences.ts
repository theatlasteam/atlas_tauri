import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import type { AccentId, FontId, FontSize, ThemeMode } from "../data/types";

export interface Preferences {
  theme: ThemeMode;
  accent: AccentId;
  font: FontId;
  fontSize: FontSize;
  wallpaper: string;
  compactNavbar: boolean;
  notificationSound: string;
  notificationsEnabled: boolean;
  readReceipts: boolean;
  lastSeenVisible: boolean;
}

const STORAGE_KEY = "atlas.preferences.v1";

const defaults: Preferences = {
  theme: "system",
  accent: "amber",
  font: "inter",
  fontSize: "md",
  wallpaper: "none",
  compactNavbar: false,
  notificationSound: "chime",
  notificationsEnabled: true,
  readReceipts: true,
  lastSeenVisible: true,
};

function loadInitial(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

const FONT_SIZE_PX: Record<FontSize, string> = {
  sm: "14px",
  md: "15px",
  lg: "16.5px",
  xl: "18px",
};

function createPreferencesStore() {
  const [preferences, setPreferences] = createStore<Preferences>(loadInitial());

  const applyToDom = () => {
    const root = document.documentElement;
    const resolvedTheme =
      preferences.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : preferences.theme;
    root.dataset.theme = resolvedTheme;
    root.dataset.accent = preferences.accent;
    root.dataset.font = preferences.font;
    root.style.setProperty("--font-size-base", FONT_SIZE_PX[preferences.fontSize]);
    root.classList.toggle("dark", resolvedTheme === "dark");
  };

  createEffect(() => {
    applyToDom();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  });

  if (typeof window !== "undefined") {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", () => {
      if (preferences.theme === "system") applyToDom();
    });
  }

  return { preferences, setPreferences };
}

export const { preferences, setPreferences } = createRoot(createPreferencesStore);
