import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import type { AccentId, FontId, FontSize, Locale, ThemeMode } from "../data/types";

function detectLocale(): Locale {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

// Device-local preferences only.
//
// Anything another person can observe — read receipts, last seen — belongs on
// the account, not here: those live on the user row and are enforced by the
// server (see store/session.ts::setPrivacy). They used to sit in this file,
// which meant switching them off changed nothing anyone else could see.
export interface Preferences {
  locale: Locale;
  theme: ThemeMode;
  accent: AccentId;
  font: FontId;
  fontSize: FontSize;
  wallpaper: string;
  compactNavbar: boolean;
  notificationSound: string;
  notificationsEnabled: boolean;
  /**
   * Live typing: share the draft itself, not just the fact that you're
   * typing. Off by default — it is a real change in what you reveal, so it is
   * opted into rather than out of.
   */
  liveTyping: boolean;
  /** Developer mode: enables .atp export/import and other plugin tooling. */
  developerMode: boolean;
  /** Custom accent hex (used when `accent === "custom"`). */
  customAccent: string;
}

const STORAGE_KEY = "atlas.preferences.v1";

const defaults: Preferences = {
  locale: detectLocale(),
  theme: "system",
  accent: "amber",
  font: "inter",
  fontSize: "md",
  wallpaper: "none",
  compactNavbar: false,
  notificationSound: "chime",
  notificationsEnabled: true,
  liveTyping: false,
  developerMode: false,
  customAccent: "#c9772e",
};

function loadInitial(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    // Only keys we still know about. A blanket spread carried retired
    // settings forward forever — including "readReceipts", which moved to the
    // account and would otherwise sit in local storage looking authoritative.
    const merged = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof Preferences>) {
      if (key in stored) (merged as Record<string, unknown>)[key] = stored[key];
    }
    return merged;
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
    // For the custom accent, feed the raw hex to CSS ([data-accent=custom]).
    root.style.setProperty("--custom-accent", preferences.customAccent);
    root.style.setProperty("--font-size-base", FONT_SIZE_PX[preferences.fontSize]);
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.lang = preferences.locale;
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
