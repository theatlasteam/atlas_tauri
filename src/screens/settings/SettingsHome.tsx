import { Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SettingsSection, SettingsLinkRow } from "../../components/SettingsSection";
import { session } from "../../store/session";
import { BellIcon, FolderIcon, PaletteIcon, ProfileIcon, ShieldIcon, VerifiedIcon } from "../../icons";

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
      <header class="mb-4 border-b border-border bg-appbar px-5 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <h1 class="select-none font-heading text-2xl font-bold active:opacity-70" onClick={onTitleTap}>
          Settings
        </h1>
      </header>

      <SettingsSection title="Preferences">
        <SettingsLinkRow
          href="/settings/appearance"
          label="Appearance"
          description="Theme, accent, font, wallpaper"
          icon={PaletteIcon}
        />
        <SettingsLinkRow
          href="/settings/notifications"
          label="Notifications"
          description="Sound and per-chat alerts"
          icon={BellIcon}
        />
        <SettingsLinkRow
          href="/settings/folders"
          label="Chats & Folders"
          description="Organize conversations into folders"
          icon={FolderIcon}
        />
      </SettingsSection>

      <SettingsSection title="You">
        <SettingsLinkRow href="/profile" label="Account" description="Profile info and editable fields" icon={ProfileIcon} />
        <SettingsLinkRow
          href="/settings/privacy"
          label="Privacy & Security"
          description="Control who can reach you"
          icon={ShieldIcon}
        />
      </SettingsSection>

      {/* Only the "atlas" account can grant checkmarks, so the entry point is
          hidden for everyone else — the server enforces it either way. */}
      <Show when={isAtlas()}>
        <SettingsSection title="Admin">
          <SettingsLinkRow
            href="/settings/verification"
            label="Verification"
            description="Grant or remove verified checkmarks"
            icon={VerifiedIcon}
          />
        </SettingsSection>
      </Show>
    </div>
  );
}
