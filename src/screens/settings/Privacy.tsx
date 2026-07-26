import { createSignal, Show } from "solid-js";
import { preferences, setPreferences } from "../../store/preferences";
import { session } from "../../store/session";
import { SettingsSection, SettingsRow, SettingsLinkRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Switch from "../../ui/Switch";
import { ProhibitIcon } from "../../icons";

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
      setError("Couldn't save that — check your connection and try again.");
    }
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title="Privacy & Security" />

      <SettingsSection title="Visibility">
        <SettingsRow
          label="Read receipts"
          description="Let others see when you've read their messages. Turning this off also hides theirs from you."
        >
          <Switch
            checked={me()?.readReceipts ?? true}
            onChange={(v) => void save({ readReceipts: v })}
          />
        </SettingsRow>
        <SettingsRow label="Last seen" description="Show others when you were last online">
          <Switch
            checked={me()?.lastSeenVisible ?? true}
            onChange={(v) => void save({ lastSeenVisible: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <Show when={error()}>
        <p class="-mt-4 px-6 pb-6 text-sm text-danger">{error()}</p>
      </Show>

      <SettingsSection title="Live typing">
        <SettingsRow
          label="Share my typing"
          description="People you're chatting with watch your message form as you write it, instead of a plain 'typing…'. Reciprocal: you'll see theirs too, and only while this is on."
        >
          <Switch
            checked={preferences.liveTyping}
            onChange={(v) => setPreferences("liveTyping", v)}
          />
        </SettingsRow>
      </SettingsSection>

      <p class="-mt-4 px-6 pb-6 text-xs text-ink-subtle">
        Drafts are encrypted to the person you're writing to, exactly like messages are, and are
        never stored — not on your device, not on the server.
      </p>

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
