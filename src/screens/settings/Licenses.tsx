import { For } from "solid-js";
import Appbar from "../../components/Appbar";
import { SettingsSection, SettingsLinkRow } from "../../components/SettingsSection";
import { InfoIcon } from "../../icons";
import { t } from "../../lib/i18n";

const OSS: { name: string; license: string; href: string }[] = [
  { name: "Atlas", license: "MIT", href: "https://github.com/theatlasteam/atlas_tauri" },
  { name: "Solid.js", license: "MIT", href: "https://www.solidjs.com" },
  { name: "Solid Router", license: "MIT", href: "https://github.com/solidjs/solid-router" },
  { name: "Tauri", license: "MIT OR Apache-2.0", href: "https://tauri.app" },
  { name: "vodozemac", license: "Apache-2.0", href: "https://github.com/matrix-org/vodozemac" },
  { name: "Phosphor Icons", license: "MIT", href: "https://phosphoricons.com" },
  { name: "DOMPurify", license: "Apache-2.0 OR MPL-2.0", href: "https://github.com/cure53/DOMPurify" },
  { name: "marked", license: "MIT", href: "https://marked.js.org" },
  { name: "Tailwind CSS", license: "MIT", href: "https://tailwindcss.com" },
  { name: "@noble/curves", license: "MIT", href: "https://github.com/paulmillr/noble-curves" },
  { name: "@noble/hashes", license: "MIT", href: "https://github.com/paulmillr/noble-hashes" },
  { name: "emoji-mart", license: "MIT", href: "https://github.com/missive/emoji-mart" },
];

export default function Licenses() {
  return (
    <div class="h-full overflow-y-auto pb-28 md:pb-6">
      <Appbar title={t("licenses.title")} back="/settings/about" sticky />
      <p class="px-6 pb-4 text-sm leading-relaxed text-ink-muted">{t("licenses.intro")}</p>
      <SettingsSection title={t("licenses.list")}>
        <For each={OSS}>
          {(item) => (
            <SettingsLinkRow href={item.href} label={item.name} description={item.license} icon={InfoIcon} external />
          )}
        </For>
      </SettingsSection>
    </div>
  );
}
