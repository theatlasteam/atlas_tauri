import { createResource, createSignal, Show } from "solid-js";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import Appbar from "../../components/Appbar";
import Switch from "../../ui/Switch";
import { e2ee } from "../../store/e2ee";
import { api } from "../../data/api";
import { session } from "../../store/session";
import { clearAvatarCache } from "../../data/avatarCache";
import { getToken, apiBase } from "../../data/api";
import { preferences, setPreferences } from "../../store/preferences";
import {
  e2eeAvailable,
  e2ee2Bundle,
  e2ee2Fingerprint,
  nativeExperimentalAvailable,
  launchNativeExperimental,
} from "../../lib/tauri";
import { BroomIcon } from "../../icons";

/** Not linked from anywhere — reached by tapping the Settings title 7 times. */
export default function Dev() {
  const [myFingerprint] = createResource(async () => {
    if (!e2eeAvailable) return null;
    const bundle = await e2ee2Bundle();
    return e2ee2Fingerprint(bundle);
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

  const [bundleReset, setBundleReset] = createSignal<"idle" | "busy" | "done" | "error">("idle");
  const clearE2eeCache = async () => {
    setBundleReset("busy");
    try {
      await api.resetBundle();
      await e2ee.publishIdentity();
      setBundleReset("done");
    } catch {
      setBundleReset("error");
    }
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
      <Appbar title="Developer" back="/settings" sticky />

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
          label="E2EE prekey bundle"
          description={
            bundleReset() === "done"
              ? "Bundle reset and republished. Peers' sessions with you will re-establish on next send."
              : bundleReset() === "error"
                ? "Couldn't reset the bundle."
                : "Drop this account's published bundle and one-time prekeys, then republish fresh ones. Use after a reinstall if messages show 'Unable to decrypt'."
          }
        >
          <button
            type="button"
            onClick={() => void clearE2eeCache()}
            disabled={bundleReset() === "busy"}
            class="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:opacity-80 active:scale-95 disabled:opacity-50"
          >
            <BroomIcon size={14} /> {bundleReset() === "busy" ? "Resetting…" : "Reset"}
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
