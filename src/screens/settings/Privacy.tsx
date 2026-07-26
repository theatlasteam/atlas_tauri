import { preferences, setPreferences } from "../../store/preferences";
import { SettingsSection, SettingsRow, SettingsLinkRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Switch from "../../ui/Switch";
import { ProhibitIcon } from "../../icons";

export default function Privacy() {
  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title="Privacy & Security" />

      <SettingsSection title="Visibility">
        <SettingsRow label="Read receipts" description="Let others see when you've read their messages">
          <Switch checked={preferences.readReceipts} onChange={(v) => setPreferences("readReceipts", v)} />
        </SettingsRow>
        <SettingsRow label="Last seen" description="Show others when you were last online">
          <Switch checked={preferences.lastSeenVisible} onChange={(v) => setPreferences("lastSeenVisible", v)} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Blocking">
        <SettingsLinkRow
          href="/settings/blocked"
          label="Blocked users"
          description="People who can't message you"
          icon={ProhibitIcon}
        />
      </SettingsSection>
    </div>
  );
}
