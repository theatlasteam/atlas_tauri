import { createResource, For, Show } from "solid-js";
import { repository } from "../../data/repository";
import { preferences, setPreferences } from "../../store/preferences";
import type { AccentId, FontId, FontSize, ThemeMode } from "../../data/types";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Picker from "../../ui/Picker";
import Switch from "../../ui/Switch";
import { CheckIcon } from "../../icons";
import { LOCALE_OPTIONS, setLocale, t, type TranslationKey } from "../../lib/i18n";

const ACCENTS: { id: AccentId; labelKey: TranslationKey; swatch: string }[] = [
  { id: "amber", labelKey: "appearance.accent.amber", swatch: "#c9772e" },
  { id: "jade", labelKey: "appearance.accent.jade", swatch: "#2f8f6e" },
  { id: "violet", labelKey: "appearance.accent.violet", swatch: "#7b5ec9" },
  { id: "rose", labelKey: "appearance.accent.rose", swatch: "#c9436f" },
  { id: "slate", labelKey: "appearance.accent.slate", swatch: "#4a6b7c" },
  { id: "sky", labelKey: "appearance.accent.sky", swatch: "#2f6fc9" },
  { id: "teal", labelKey: "appearance.accent.teal", swatch: "#1f8f8a" },
  { id: "coral", labelKey: "appearance.accent.coral", swatch: "#d9603f" },
  { id: "indigo", labelKey: "appearance.accent.indigo", swatch: "#4550b8" },
  { id: "plum", labelKey: "appearance.accent.plum", swatch: "#9c4fa0" },
];

export default function Appearance() {
  const [wallpapers] = createResource(() => repository.listWallpapers());

  const themeOptions = () => [
    { value: "light" as ThemeMode, label: t("appearance.themeLight") },
    { value: "dark" as ThemeMode, label: t("appearance.themeDark") },
    { value: "system" as ThemeMode, label: t("appearance.themeSystem") },
  ];

  const fontOptions = () => [
    { value: "inter" as FontId, label: "Inter" },
    { value: "system" as FontId, label: t("appearance.fontSystem") },
    { value: "serif" as FontId, label: "Serif" },
    { value: "mono" as FontId, label: "Mono" },
  ];

  const fontSizeOptions = () => [
    { value: "sm" as FontSize, label: t("appearance.fontSizeSmall") },
    { value: "md" as FontSize, label: t("appearance.fontSizeMedium") },
    { value: "lg" as FontSize, label: t("appearance.fontSizeLarge") },
    { value: "xl" as FontSize, label: t("appearance.fontSizeExtraLarge") },
  ];

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title={t("appearance.title")} />

      <SettingsSection title={t("appearance.theme")}>
        <SettingsRow label={t("appearance.theme")}>
          <Picker
            value={preferences.theme}
            onChange={(v) => setPreferences("theme", v as ThemeMode)}
            options={themeOptions()}
          />
        </SettingsRow>
        <div class="px-4 py-3">
          <p class="mb-2.5 text-sm font-medium text-ink">{t("appearance.accentColor")}</p>
          <div class="flex flex-wrap gap-2.5">
            <For each={ACCENTS}>
              {(accent) => {
                const active = () => preferences.accent === accent.id;
                return (
                  <button
                    type="button"
                    aria-label={t(accent.labelKey)}
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

      <SettingsSection title={t("appearance.typography")}>
        <SettingsRow label={t("appearance.fontFamily")}>
          <Picker value={preferences.font} onChange={(v) => setPreferences("font", v as FontId)} options={fontOptions()} />
        </SettingsRow>
        <SettingsRow label={t("appearance.fontSize")}>
          <Picker
            value={preferences.fontSize}
            onChange={(v) => setPreferences("fontSize", v as FontSize)}
            options={fontSizeOptions()}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("appearance.language")}>
        <SettingsRow label={t("appearance.language")} description={t("appearance.languageDesc")}>
          <Picker value={preferences.locale} onChange={(v) => setLocale(v as "en" | "ru")} options={LOCALE_OPTIONS} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("appearance.navigation")}>
        <SettingsRow label={t("appearance.compactNavbar")} description={t("appearance.compactNavbarDesc")}>
          <Switch
            checked={preferences.compactNavbar}
            onChange={(v) => setPreferences("compactNavbar", v)}
            label={t("appearance.compactNavbar")}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("appearance.wallpaper")}>
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
