import { createResource, For, Show } from "solid-js";
import { repository } from "../../data/repository";
import { chatsState, setMuted } from "../../store/chats";
import { preferences, setPreferences } from "../../store/preferences";
import { playNotificationSound, requestNotificationPermission } from "../../lib/notify";
import { SettingsSection, SettingsRow } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import Picker from "../../ui/Picker";
import Switch from "../../ui/Switch";
import AnimatedList from "../../ui/AnimatedList";
import Avatar from "../../components/Avatar";
import { t } from "../../lib/i18n";

export default function Notifications() {
  const [sounds] = createResource(() => repository.listNotificationSounds());
  const blockedByBrowser = () =>
    preferences.notificationsEnabled &&
    typeof Notification !== "undefined" &&
    Notification.permission === "denied";

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title={t("settingsNotifications.title")} />

      <SettingsSection title={t("settingsNotifications.general")}>
        <SettingsRow label={t("settingsNotifications.notifications")} description={t("settingsNotifications.notificationsDesc")}>
          <Switch
            checked={preferences.notificationsEnabled}
            onChange={(v) => {
              setPreferences("notificationsEnabled", v);
              // Ask here, where the user just said they want alerts, rather
              // than ambushing them with a permission prompt at sign-in.
              if (v) requestNotificationPermission();
            }}
          />
        </SettingsRow>
        <SettingsRow label={t("settingsNotifications.sound")} description={t("settingsNotifications.soundDesc")}>
          <Picker
            value={preferences.notificationSound}
            onChange={(v) => {
              setPreferences("notificationSound", v);
              playNotificationSound(v); // pick a sound, hear the sound
            }}
            options={(sounds() ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </SettingsRow>
      </SettingsSection>

      <Show when={blockedByBrowser()}>
        <p class="-mt-4 px-6 pb-6 text-xs text-ink-subtle">{t("settingsNotifications.blockedByBrowser")}</p>
      </Show>

      <SettingsSection title={t("settingsNotifications.perChat")}>
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
                  label={t("settingsNotifications.notifAriaFor", { name: chat.name })}
                />
              </div>
            )}
          </For>
        </AnimatedList>
      </SettingsSection>
    </div>
  );
}
