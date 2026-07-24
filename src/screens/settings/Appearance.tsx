import { createResource, For, Show } from "solid-js";
import { repository } from "../../data/repository";
import { preferences, setPreferences } from "../../store/preferences";
import type { AccentId, FontId, FontSize, ThemeMode } from "../../data/types";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Picker from "../../ui/Picker";
import Switch from "../../ui/Switch";
import { CheckIcon } from "../../icons";

const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: "amber", label: "Amber", swatch: "#c9772e" },
  { id: "jade", label: "Jade", swatch: "#2f8f6e" },
  { id: "violet", label: "Violet", swatch: "#7b5ec9" },
  { id: "rose", label: "Rose", swatch: "#c9436f" },
  { id: "slate", label: "Slate", swatch: "#4a6b7c" },
  { id: "sky", label: "Sky", swatch: "#2f6fc9" },
  { id: "teal", label: "Teal", swatch: "#1f8f8a" },
  { id: "coral", label: "Coral", swatch: "#d9603f" },
  { id: "indigo", label: "Indigo", swatch: "#4550b8" },
  { id: "plum", label: "Plum", swatch: "#9c4fa0" },
];

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const FONT_OPTIONS: { value: FontId; label: string }[] = [
  { value: "inter", label: "Inter" },
  { value: "system", label: "System" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

export default function Appearance() {
  const [wallpapers] = createResource(() => repository.listWallpapers());

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title="Appearance" />

      <SettingsSection title="Theme">
        <SettingsRow label="Theme">
          <Picker
            value={preferences.theme}
            onChange={(v) => setPreferences("theme", v as ThemeMode)}
            options={THEME_OPTIONS}
          />
        </SettingsRow>
        <div class="px-4 py-3">
          <p class="mb-2.5 text-sm font-medium text-ink">Accent color</p>
          <div class="flex flex-wrap gap-2.5">
            <For each={ACCENTS}>
              {(accent) => {
                const active = () => preferences.accent === accent.id;
                return (
                  <button
                    type="button"
                    aria-label={accent.label}
                    onClick={() => setPreferences("accent", accent.id)}
                    class="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-[border-color,transform] duration-150 hover:scale-110 active:scale-90"
                    classList={{ "border-ink": active(), "border-transparent": !active() }}
                  >
                    <span
                      class="flex h-7 w-7 items-center justify-center rounded-full"
                      style={{ "background-color": accent.swatch }}
                    >
                      <Show when={active()}>
                        <CheckIcon size={14} class="text-white" />
                      </Show>
                    </span>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Typography">
        <SettingsRow label="Font family">
          <Picker value={preferences.font} onChange={(v) => setPreferences("font", v as FontId)} options={FONT_OPTIONS} />
        </SettingsRow>
        <SettingsRow label="Font size">
          <Picker
            value={preferences.fontSize}
            onChange={(v) => setPreferences("fontSize", v as FontSize)}
            options={FONT_SIZE_OPTIONS}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Navigation">
        <SettingsRow label="Compact navbar" description="Only the active tab shows its label">
          <Switch
            checked={preferences.compactNavbar}
            onChange={(v) => setPreferences("compactNavbar", v)}
            label="Compact navbar"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Chat wallpaper">
        <div class="grid grid-cols-3 gap-3 p-4">
          <For each={wallpapers()}>
            {(wallpaper) => {
              const active = () => preferences.wallpaper === wallpaper.id;
              return (
                <button
                  type="button"
                  onClick={() => setPreferences("wallpaper", wallpaper.id)}
                  class="flex flex-col items-center gap-1.5 transition-transform duration-150 hover:scale-[1.03] active:scale-95"
                >
                  <span
                    class="h-16 w-full rounded-xl border-2"
                    classList={{ "border-accent": active(), "border-border": !active() }}
                    style={{ background: wallpaper.preview }}
                  />
                  <span class="text-xs text-ink-muted">{wallpaper.name}</span>
                </button>
              );
            }}
          </For>
        </div>
      </SettingsSection>
    </div>
  );
}
