import { createResource, For, Show } from "solid-js";
import { repository } from "../../data/repository";
import { preferences, setPreferences } from "../../store/preferences";
import type { AccentId, BubbleStyle, FontId, FontSize, ThemeMode } from "../../data/types";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import Appbar from "../../components/Appbar";
import Picker from "../../ui/Picker";
import Slider from "../../ui/Slider";
import { CheckIcon } from "../../icons";
import { Logo, MessageBubble } from "@atlas/ui";
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

/** Hue (0-360) -> #rrggbb. Used to feed the custom-accent slider. */
function hueToHex(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);
  const [r, g, b] =
    h < 60 ? [1, x, 0] : h < 120 ? [x, 1, 0] : h < 180 ? [0, 1, x] : h < 240 ? [0, x, 1] : h < 300 ? [x, 0, 1] : [1, 0, x];
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The current custom accent's hue (0-360), for positioning the slider thumb. */
function customHue(): number {
  const hex = preferences.customAccent.replace(/^#/, "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  // Normalize to [0, 6) — the `% 6` above keeps the sign in JS, so red-adjacent
  // hues just below 360 would otherwise come out negative and yank the thumb
  // back to the start.
  h = ((h % 6) + 6) % 6;
  return h * 60;
}

export default function Appearance() {
  const [wallpapers] = createResource(() => repository.listWallpapers());

  const themeOptions = () => [
    { value: "light" as ThemeMode, label: t("appearance.themeLight") },
    { value: "dark" as ThemeMode, label: t("appearance.themeDark") },
    { value: "system" as ThemeMode, label: t("appearance.themeSystem") },
  ];

  const fontOptions = () => [
    { value: "inter" as FontId, label: "Manrope" },
    { value: "system" as FontId, label: t("appearance.fontSystem") },
    { value: "serif" as FontId, label: "Serif" },
    { value: "mono" as FontId, label: "Mono" },
  ];

  const bubbleOptions = () => [
    { value: "comfortable" as BubbleStyle, label: t("appearance.bubbleComfortable") },
    { value: "compact" as BubbleStyle, label: t("appearance.bubbleCompact") },
  ];

  const fontSizeOptions = () => [
    { value: "sm" as FontSize, label: t("appearance.fontSizeSmall") },
    { value: "md" as FontSize, label: t("appearance.fontSizeMedium") },
    { value: "lg" as FontSize, label: t("appearance.fontSizeLarge") },
    { value: "xl" as FontSize, label: t("appearance.fontSizeExtraLarge") },
  ];

  return (
    <div class="h-full overflow-y-auto pb-28 md:pb-6">
      <Appbar title={t("appearance.title")} back="/settings" sticky />

      <div class="mx-5 mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <div class="flex items-center gap-3 border-b border-border px-4 py-3">
          <Logo width={48} static />
          <div class="min-w-0 flex-1">
            <p class="font-heading text-sm font-semibold">Atlas</p>
            <p class="text-[13px] text-ink-subtle">{t("appearance.preview")}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1 p-2">
          <For each={bubbleOptions()}>
            {(opt) => (
              <button
                type="button"
                class="atlas-focus min-h-11 rounded-xl text-sm font-medium"
                classList={{
                  "bg-accent text-accent-ink": preferences.bubbleStyle === opt.value,
                  "bg-bg text-ink-muted": preferences.bubbleStyle !== opt.value,
                }}
                onClick={() => setPreferences("bubbleStyle", opt.value)}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
        <Show
          when={preferences.bubbleStyle === "compact"}
          fallback={
            <div class="flex flex-col items-start gap-0.5 px-4 py-3">
              <MessageBubble side="received">Keys stay on this device.</MessageBubble>
              <MessageBubble side="sent">Looks good.</MessageBubble>
              <MessageBubble side="sent">And this one too.</MessageBubble>
            </div>
          }
        >
          <div class="space-y-3 px-4 py-3">
            <div class="flex gap-2.5">
              <span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                A
              </span>
              <div class="min-w-0">
                <p class="text-[13px] font-semibold text-ink">Atlas</p>
                <p class="text-[15px] leading-snug text-ink">Keys stay on this device.</p>
              </div>
            </div>
            <div class="flex gap-2.5">
              <span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bubble-sent text-sm font-semibold text-accent-ink">
                Y
              </span>
              <div class="min-w-0">
                <p class="text-[13px] font-semibold text-ink">{t("appearance.previewYou")}</p>
                <p class="text-[15px] leading-snug text-ink">Looks good.</p>
                <p class="text-[15px] leading-snug text-ink">And this one too.</p>
              </div>
            </div>
          </div>
        </Show>
        <div class="flex items-center gap-2 border-t border-border bg-bg px-3 py-2">
          <span class="min-h-11 flex-1 rounded-full border border-border bg-surface px-3 text-[14px] leading-[44px] text-ink-subtle">
            Message…
          </span>
          <span class="grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-ink">↑</span>
        </div>
      </div>

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

        {/* Custom accent slider — the presets above set `accent` to a named
            id; this one sets `accent: "custom"` and feeds the raw hue hex. */}
        <div class="border-t border-border/60 px-4 pb-4 pt-3">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2"
                classList={{
                  "border-ink": preferences.accent === "custom",
                  "border-transparent": preferences.accent !== "custom",
                }}
              >
                <span
                  class="block h-7 w-7 rounded-full"
                  style={{ "background-color": preferences.customAccent }}
                />
              </span>
              <div>
                <p class="text-sm font-medium text-ink">{t("appearance.accentCustom")}</p>
                <p class="font-mono text-[11px] text-ink-subtle">
                  {preferences.customAccent.toUpperCase()}
                </p>
              </div>
            </div>
            <Show when={preferences.accent === "custom"}>
              <span class="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
                {t("appearance.accentActive")}
              </span>
            </Show>
          </div>
          <div class="mt-3">
            <Slider
              variant="color"
              value={customHue() / 360}
              onChange={(v) => {
                // Clamp to 359, not 360: hue 360 === hue 0, so a full drag to
                // the right would write #ff0000 and snap the thumb back to the
                // start. 359 keeps it parked at the far end.
                const hue = Math.min(359, Math.max(0, Math.round(v * 360)));
                setPreferences("customAccent", hueToHex(hue));
                setPreferences("accent", "custom" as AccentId);
              }}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title={t("appearance.bubbles")}>
        <SettingsRow label={t("appearance.bubbleStyle")} description={t("appearance.bubbleCompactDesc")}>
          <Picker
            value={preferences.bubbleStyle}
            onChange={(v) => setPreferences("bubbleStyle", v as BubbleStyle)}
            options={bubbleOptions()}
          />
        </SettingsRow>
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
