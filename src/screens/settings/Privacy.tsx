import { preferences, setPreferences } from "../../store/preferences";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Switch from "../../ui/Switch";

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
    </div>
  );
}
