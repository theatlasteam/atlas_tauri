import { createResource, createSignal, Show } from "solid-js";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Switch from "../../ui/Switch";
import { e2ee } from "../../store/e2ee";
import { session } from "../../store/session";
import { clearAvatarCache } from "../../data/avatarCache";
import { getToken, apiBase } from "../../data/api";
import { preferences, setPreferences } from "../../store/preferences";
import {
  e2eeAvailable,
  e2eePublicKey,
  e2eeFingerprint,
  nativeExperimentalAvailable,
  launchNativeExperimental,
} from "../../lib/tauri";
import { BroomIcon } from "../../icons";

/** Not linked from anywhere — reached by tapping the Settings title 7 times. */
export default function Dev() {
  const [myFingerprint] = createResource(async () => {
    if (!e2eeAvailable) return null;
    const key = await e2eePublicKey();
    return e2eeFingerprint(key);
  });

  const [identityReset, setIdentityReset] = createSignal<"idle" | "busy" | "done" | "error">("idle");
  const resetMyIdentity = async () => {
    setIdentityReset("busy");
    try {
      await session.resetIdentity();
      setIdentityReset("done");
    } catch {
      setIdentityReset("error");
    }
  };

  const [clearedPeerKeys, setClearedPeerKeys] = createSignal<number | null>(null);
  const clearE2eeCache = () => {
    const count = e2ee.clearPeerKeyCache();
    setClearedPeerKeys(count);
  };

  const [avatarsCleared, setAvatarsCleared] = createSignal(false);
  const clearAvatars = () => {
    clearAvatarCache();
    setAvatarsCleared(true);
  };

  const [nativeOn, setNativeOn] = createSignal(false);
  const [nativeError, setNativeError] = createSignal<string | null>(null);
  const toggleNative = async (on: boolean) => {
    setNativeError(null);
    if (!on) {
      setNativeOn(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setNativeError("No auth token available — sign in first.");
      return;
    }
    try {
      await launchNativeExperimental(apiBase(), token);
      setNativeOn(true);
    } catch (e) {
      setNativeError(e instanceof Error ? e.message : "Couldn't launch native screen.");
    }
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title="Developer" />

      <SettingsSection title="Plugins">
        <SettingsRow
          label="Developer mode"
          description="Enables exporting plugins as .atp files and importing them from disk, plus other plugin tooling."
        >
          <Switch
            checked={preferences.developerMode}
            onChange={(v) => setPreferences("developerMode", v)}
            label="Developer mode"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Identity">
        <SettingsRow label="E2EE available" description={e2eeAvailable ? "yes (Tauri)" : "no (web build)"} />
        <SettingsRow
          label="My fingerprint"
          description={myFingerprint.loading ? "loading…" : myFingerprint() ?? "unavailable"}
        />
        <SettingsRow
          label="Reset my identity key"
          description={
            identityReset() === "done"
              ? "Done — republished this device's key. Restart the app or reopen affected chats."
              : identityReset() === "error"
                ? "Couldn't reset — check your connection and try again."
                : "If this device shows 'Unable to decrypt' for everything (typical after a reinstall or factory reset), this device's local key no longer matches what's published for your account. Resetting clears the server's copy and republishes this device's real one. Cost: anyone already messaging you needs to refetch your key — DMs sent in that window still fail once."
          }
        >
          <button
            type="button"
            onClick={() => void resetMyIdentity()}
            disabled={identityReset() === "busy"}
            class="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95 disabled:opacity-50"
          >
            <BroomIcon size={14} /> Reset
          </button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Caches">
        <SettingsRow
          label="E2EE peer-key cache"
          description={
            clearedPeerKeys() === null
              ? "Cached public keys for people you've messaged. Clear if messages won't decrypt after a key change."
              : `Cleared ${clearedPeerKeys()} cached key${clearedPeerKeys() === 1 ? "" : "s"} — next lookup refetches from the server.`
          }
        >
          <button
            type="button"
            onClick={clearE2eeCache}
            class="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
          >
            <BroomIcon size={14} /> Clear
          </button>
        </SettingsRow>
        <SettingsRow
          label="Avatar cache"
          description={avatarsCleared() ? "Cleared — avatars will refetch." : "Cached profile photo URLs."}
        >
          <button
            type="button"
            onClick={clearAvatars}
            class="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95"
          >
            <BroomIcon size={14} /> Clear
          </button>
        </SettingsRow>
      </SettingsSection>

      <Show when={nativeExperimentalAvailable}>
        <SettingsSection title="Native Experimental">
          <SettingsRow
            label="Native chat UI"
            description={
              nativeError() ??
              "Swaps the main page and chat screen for a plain-Android-Views prototype that talks to the server directly — no WebView. Plaintext only, no live updates yet."
            }
          >
            <Switch checked={nativeOn()} onChange={(v) => void toggleNative(v)} label="Native Experimental" />
          </SettingsRow>
        </SettingsSection>
      </Show>

      <Show when={!e2eeAvailable}>
        <p class="px-6 text-xs text-ink-subtle">
          E2EE commands run in the Tauri core, so this page is limited when running as a plain web
          build.
        </p>
      </Show>
    </div>
  );
}
