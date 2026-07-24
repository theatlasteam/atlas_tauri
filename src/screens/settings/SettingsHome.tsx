import { SettingsSection, SettingsLinkRow } from "../../components/SettingsSection";
import { BellIcon, FolderIcon, PaletteIcon, ProfileIcon, ShieldIcon } from "../../icons";

export default function SettingsHome() {
  return (
    <div class="h-full overflow-y-auto pb-28">
      <header class="mb-4 border-b border-border bg-appbar px-5 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <h1 class="font-heading text-2xl font-bold">Settings</h1>
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
    </div>
  );
}
