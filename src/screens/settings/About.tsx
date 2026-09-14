import { Show } from "solid-js";
import Appbar from "../../components/Appbar";
import { SettingsSection, SettingsLinkRow, SettingsRow } from "../../components/SettingsSection";
import { AppIcon } from "@atlas/ui";
import { t } from "../../lib/i18n";
import { APP_BUILD } from "../../lib/app-update";
import { isTauri } from "../../lib/tauri";
import { isAndroid } from "../../lib/platform";
import { InfoIcon } from "../../icons";

const VERSION = "0.1.0-1";

function platformLabel(): string {
  if (isAndroid()) return t("about.platformAndroid");
  if (isTauri) return t("about.platformDesktop");
  return t("about.platformWeb");
}

export default function About() {
  return (
    <div class="h-full overflow-y-auto pb-28 md:pb-6">
      <Appbar title={t("about.title")} back="/settings" sticky />

      <div class="flex flex-col items-center px-5 py-8 text-center">
        <AppIcon size={88} static />
        <h1 class="mt-4 font-heading text-xl font-semibold text-ink">Atlas</h1>
        <p class="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">{t("about.tagline")}</p>
      </div>

      <SettingsSection title={t("about.details")}>
        <SettingsRow label={t("about.version")} description={VERSION} />
        <SettingsRow label={t("about.platform")} description={platformLabel()} />
        <Show when={APP_BUILD}>
          <SettingsRow label={t("about.build")} description={APP_BUILD} />
        </Show>
        <SettingsRow label={t("about.license")} description="MIT" />
      </SettingsSection>

      <SettingsSection title={t("about.privacy")}>
        <SettingsRow label={t("about.e2ee")} description={t("about.e2eeDesc")} />
        <SettingsRow label={t("about.keys")} description={t("about.keysDesc")} />
      </SettingsSection>

      <SettingsSection title={t("about.legal")}>
        <SettingsLinkRow href="/privacy" label={t("about.privacyPolicy")} description={t("about.privacyPolicyDesc")} icon={InfoIcon} external />
        <SettingsLinkRow href="/terms" label={t("about.terms")} description={t("about.termsDesc")} icon={InfoIcon} external />
        <SettingsLinkRow href="/oferta" label={t("about.oferta")} description={t("about.ofertaDesc")} icon={InfoIcon} external />
        <SettingsLinkRow href="/settings/about/licenses" label={t("licenses.title")} description={t("licenses.introShort")} icon={InfoIcon} />
      </SettingsSection>
    </div>
  );
}
