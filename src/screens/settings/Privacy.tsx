import { createSignal, Show } from "solid-js";
import { preferences, setPreferences } from "../../store/preferences";
import { session } from "../../store/session";
import { SettingsSection, SettingsRow, SettingsLinkRow } from "../../components/SettingsSection";
import Appbar from "../../components/Appbar";
import Switch from "../../ui/Switch";
import { ProhibitIcon } from "../../icons";
import { t } from "../../lib/i18n";

export default function Privacy() {
  const [error, setError] = createSignal<string | null>(null);
  const me = () => session.user();

  /**
   * These two are account settings, not device settings: the server enforces
   * them, so a failed request must not leave a switch showing a promise that
   * isn't being kept. On failure the switch snaps back to what the server
   * still believes, and says why.
   */
  const save = async (patch: { readReceipts?: boolean; lastSeenVisible?: boolean }) => {
    setError(null);
    try {
      await session.setPrivacy(patch);
    } catch {
      setError(t("settingsPrivacy.saveError"));
    }
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <Appbar title={t("settingsPrivacy.title")} back="/settings" sticky />

      <SettingsSection title={t("settingsPrivacy.visibility")}>
        <SettingsRow
          label={t("settingsPrivacy.readReceipts")}
          description={t("settingsPrivacy.readReceiptsDesc")}
        >
          <Switch
            checked={me()?.readReceipts ?? true}
            onChange={(v) => void save({ readReceipts: v })}
          />
        </SettingsRow>
        <SettingsRow label={t("settingsPrivacy.lastSeen")} description={t("settingsPrivacy.lastSeenDesc")}>
          <Switch
            checked={me()?.lastSeenVisible ?? true}
            onChange={(v) => void save({ lastSeenVisible: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <Show when={error()}>
        <p class="-mt-4 px-6 pb-6 text-sm text-danger">{error()}</p>
      </Show>

      <SettingsSection title={t("settingsPrivacy.liveTyping")}>
        <SettingsRow
          label={t("settingsPrivacy.shareTyping")}
          description={t("settingsPrivacy.shareTypingDesc")}
        >
          <Switch
            checked={preferences.liveTyping}
            onChange={(v) => setPreferences("liveTyping", v)}
          />
        </SettingsRow>
      </SettingsSection>

      <p class="-mt-4 px-6 pb-6 text-xs text-ink-subtle">{t("settingsPrivacy.draftsNote")}</p>

      <SettingsSection title={t("settingsPrivacy.blocking")}>
        <SettingsLinkRow
          href="/settings/blocked"
          label={t("settingsPrivacy.blockedUsers")}
          description={t("settingsPrivacy.blockedUsersDesc")}
          icon={ProhibitIcon}
        />
      </SettingsSection>
    </div>
  );
}
