import { createSignal, Show } from "solid-js";
import { preferences, setPreferences } from "../../store/preferences";
import { session } from "../../store/session";
import { SettingsSection, SettingsRow, SettingsLinkRow } from "../../components/SettingsSection";
import Appbar from "../../components/Appbar";
import Switch from "../../ui/Switch";
import { ProhibitIcon } from "../../icons";
import Button from "../../ui/Button";
import Dialog from "../../ui/Dialog";
import { Progress } from "@atlas/ui";
import { t } from "../../lib/i18n";

export default function Privacy() {
  const [error, setError] = createSignal<string | null>(null);
  const [deleting, setDeleting] = createSignal(false);
  const [deleteProgress, setDeleteProgress] = createSignal(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = createSignal(false);
  const [deleteStep, setDeleteStep] = createSignal<1 | 2 | 3>(1);
  const [deletePhrase, setDeletePhrase] = createSignal("");
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

  const openDeleteDialog = () => {
    if (deleting()) return;
    setDeleteStep(1);
    setDeletePhrase("");
    setDeleteDialogOpen(true);
  };

  const executeDelete = async () => {
    if (deletePhrase() !== "DELETE") return;
    setDeleting(true);
    setDeleteProgress(10);
    setError(null);
    try {
      setDeleteProgress(35);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setDeleteProgress(65);
      await session.deleteAccount();
      setDeleteProgress(90);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setDeleteProgress(100);
    } catch {
      setError(t("settingsPrivacy.saveError"));
      setDeleting(false);
      setDeleteProgress(0);
      setDeleteDialogOpen(false);
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

      <SettingsSection title={t("settingsPrivacy.dangerZone")}>
        <SettingsRow
          label={t("settingsPrivacy.deleteAccount")}
          description={t("settingsPrivacy.deleteAccountDesc")}
        >
          <Button variant="danger" size="sm" disabled={deleting()} onClick={openDeleteDialog}>
            {deleting() ? t("settingsPrivacy.deletingAccount") : t("settingsPrivacy.deleteAccount")}
          </Button>
        </SettingsRow>
      </SettingsSection>

      <Dialog open={deleteDialogOpen()} onOpenChange={setDeleteDialogOpen} title={t("settingsPrivacy.deleteAccount")}>
        <Show when={!deleting()} fallback={
          <div role="status" aria-live="polite">
            <p class="mb-3 text-sm text-ink-subtle">{t("settingsPrivacy.deletingAccount")}</p>
            <Progress value={deleteProgress()} />
          </div>
        }>
          <Show when={deleteStep() === 1}>
            <p class="mb-5 text-sm text-ink-subtle">{t("settingsPrivacy.deleteAccountWarning")}</p>
            <div class="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(false)}>{t("settingsPrivacy.cancel")}</Button><Button variant="danger" size="sm" onClick={() => setDeleteStep(2)}>{t("settingsPrivacy.continue")}</Button></div>
          </Show>
          <Show when={deleteStep() === 2}>
            <p class="mb-5 text-sm text-ink-subtle">{t("settingsPrivacy.deleteAccountFinalWarning")}</p>
            <div class="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(false)}>{t("settingsPrivacy.cancel")}</Button><Button variant="danger" size="sm" onClick={() => setDeleteStep(3)}>{t("settingsPrivacy.continue")}</Button></div>
          </Show>
          <Show when={deleteStep() === 3}>
            <p class="mb-2 text-sm text-ink-subtle">{t("settingsPrivacy.deleteAccountTypePrompt")}</p>
            <input value={deletePhrase()} onInput={(e) => setDeletePhrase(e.currentTarget.value)} class="mb-5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink outline-none focus:border-danger focus:ring-2 focus:ring-danger/15" autocomplete="off" spellcheck={false} />
            <div class="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setDeleteDialogOpen(false)}>{t("settingsPrivacy.cancel")}</Button><Button variant="danger" size="sm" disabled={deletePhrase() !== "DELETE"} onClick={() => void executeDelete()}>{t("settingsPrivacy.deleteAccount")}</Button></div>
          </Show>
        </Show>
      </Dialog>
    </div>
  );
}
