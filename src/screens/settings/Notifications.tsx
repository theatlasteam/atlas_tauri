import { createResource, For } from "solid-js";
import { repository } from "../../data/repository";
import { chatsState, setMuted } from "../../store/chats";
import { preferences, setPreferences } from "../../store/preferences";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Picker from "../../ui/Picker";
import Switch from "../../ui/Switch";
import AnimatedList from "../../ui/AnimatedList";
import Avatar from "../../components/Avatar";

export default function Notifications() {
  const [sounds] = createResource(() => repository.listNotificationSounds());

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title="Notifications" />

      <SettingsSection title="General">
        <SettingsRow label="Notifications" description="Show alerts for new messages">
          <Switch
            checked={preferences.notificationsEnabled}
            onChange={(v) => setPreferences("notificationsEnabled", v)}
          />
        </SettingsRow>
        <SettingsRow label="Sound">
          <Picker
            value={preferences.notificationSound}
            onChange={(v) => setPreferences("notificationSound", v)}
            options={(sounds() ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Per-chat">
        <AnimatedList>
          <For each={chatsState.chats}>
            {(chat) => (
              <div class="flex items-center gap-3 px-4 py-3">
                <Avatar
                  color={chat.avatarColor}
                  initial={chat.avatarInitial}
                  size={36}
                  userId={chat.peerUserId}
                  hasPhoto={chat.peerHasAvatar}
                />
                <p class="min-w-0 flex-1 truncate text-sm font-medium text-ink">{chat.name}</p>
                <Switch
                  checked={!chat.muted}
                  onChange={(v) => setMuted(chat.id, !v)}
                  label={`Notifications for ${chat.name}`}
                />
              </div>
            )}
          </For>
        </AnimatedList>
      </SettingsSection>
    </div>
  );
}
