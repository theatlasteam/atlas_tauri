import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SettingsSection, SettingsLinkRow } from "../../components/SettingsSection";
import Appbar from "../../components/Appbar";
import { session } from "../../store/session";
import { t } from "../../lib/i18n";
import { BellIcon, FolderIcon, PaletteIcon, PluginsIcon, ProfileIcon, ShieldIcon, VerifiedIcon } from "../../icons";

const SECRET_TAP_COUNT = 7;
const SECRET_TAP_WINDOW_MS = 2500;

export default function SettingsHome() {
  const navigate = useNavigate();

  // session's user carries the raw handle (no leading "@" — unlike
  // repository.toUser), and handles are lowercased at registration.
  const isAtlas = () => session.user()?.handle === "atlas";

  // Tap the "Settings" title 7 times to reach the hidden dev tools page —
  // not everyday UI, so it isn't linked from the regular settings list.
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  const onTitleTap = () => {
    tapCount += 1;
    if (tapTimer) clearTimeout(tapTimer);
    if (tapCount >= SECRET_TAP_COUNT) {
      tapCount = 0;
      navigate("/settings/dev");
      return;
    }
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, SECRET_TAP_WINDOW_MS);
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <Appbar sticky title={t("settings.title")} onTitleClick={onTitleTap} class="mb-4" />

      <SettingsSection title={t("settings.preferences")}>
        <SettingsLinkRow
          href="/settings/appearance"
          label={t("settings.appearance")}
          description={t("settings.appearanceDesc")}
          icon={PaletteIcon}
        />
        <SettingsLinkRow
          href="/settings/notifications"
          label={t("settings.notifications")}
          description={t("settings.notificationsDesc")}
          icon={BellIcon}
        />
        <SettingsLinkRow
          href="/settings/folders"
          label={t("settings.folders")}
          description={t("settings.foldersDesc")}
          icon={FolderIcon}
        />
        <SettingsLinkRow
          href="/settings/plugins"
          label={t("settings.plugins")}
          description={t("settings.pluginsDesc")}
          icon={PluginsIcon}
        />
      </SettingsSection>

      <SettingsSection title={t("settings.you")}>
        <SettingsLinkRow href="/profile" label={t("settings.account")} description={t("settings.accountDesc")} icon={ProfileIcon} />
        <SettingsLinkRow
          href="/settings/privacy"
          label={t("settings.privacy")}
          description={t("settings.privacyDesc")}
          icon={ShieldIcon}
        />
      </SettingsSection>

      {/* Only the "atlas" account can grant checkmarks, so the entry point is
          hidden for everyone else — the server enforces it either way. */}
      <Show when={isAtlas()}>
        <SettingsSection title={t("settings.admin")}>
          <SettingsLinkRow
            href="/settings/verification"
            label={t("settings.verification")}
            description={t("settings.verificationDesc")}
            icon={VerifiedIcon}
          />
        </SettingsSection>
      </Show>
    </div>
  );
}
