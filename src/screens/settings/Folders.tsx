import { createSignal, For, Show } from "solid-js";
import { chatsState, createFolder, deleteFolder } from "../../store/chats";
import { SettingsSection } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import EmptyState from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import Dialog from "../../ui/Dialog";
import AnimatedList from "../../ui/AnimatedList";
import { FolderIcon, PlusIcon, TrashIcon } from "../../icons";
import { t } from "../../lib/i18n";

export default function Folders() {
  const [showDialog, setShowDialog] = createSignal(false);
  const [name, setName] = createSignal("");
  const [confirmDelete, setConfirmDelete] = createSignal<{ id: string; name: string } | null>(null);

  const addFolder = async (e: Event) => {
    e.preventDefault();
    const trimmed = name().trim();
    if (!trimmed) return;
    await createFolder(trimmed);
    setName("");
    setShowDialog(false);
  };

  const confirmDeleteFolder = async () => {
    const target = confirmDelete();
    if (!target) return;
    setConfirmDelete(null);
    await deleteFolder(target.id);
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title={t("settingsFolders.title")} />

      <SettingsSection title={t("settingsFolders.folders")}>
        <Show
          when={chatsState.loaded}
          fallback={
            <div class="flex flex-col gap-3 p-4">
              <Skeleton class="h-5 w-24" />
              <Skeleton class="h-5 w-32" />
            </div>
          }
        >
          <Show when={chatsState.folders.length > 0} fallback={<EmptyState icon={FolderIcon} title={t("settingsFolders.noFoldersTitle")} subtitle={t("settingsFolders.noFoldersSubtitle")} />}>
            <AnimatedList>
              <For each={chatsState.folders}>
                {(folder) => (
                  <div class="flex items-center justify-between gap-3 px-4 py-3">
                    <div class="flex items-center gap-2.5 text-sm font-medium text-ink">
                      <FolderIcon size={17} class="text-ink-subtle" />
                      {folder.name}
                    </div>
                    <Show when={folder.id !== "all" && folder.id !== "unread"}>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ id: folder.id, name: folder.name })}
                        aria-label={t("settingsFolders.deleteFolderAria", { name: folder.name })}
                        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle active:bg-bg active:text-danger"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </AnimatedList>
          </Show>
        </Show>
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          class="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-accent active:bg-bg"
        >
          <PlusIcon size={17} />
          {t("settingsFolders.addFolder")}
        </button>
      </SettingsSection>

      <Dialog open={showDialog()} onOpenChange={setShowDialog} title={t("settingsFolders.newFolderTitle")}>
        <form onSubmit={addFolder} class="flex flex-col gap-4">
          <input
            autofocus
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder={t("settingsFolders.folderNamePlaceholder")}
            class="rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!name().trim()}
            class="rounded-pill bg-accent py-2.5 text-sm font-semibold text-accent-ink disabled:opacity-40 active:scale-95"
          >
            {t("settingsFolders.create")}
          </button>
        </form>
      </Dialog>

      <Dialog open={confirmDelete() !== null} onOpenChange={(open) => !open && setConfirmDelete(null)} title={t("settingsFolders.deleteFolderTitle")}>
        <div class="flex flex-col gap-4">
          <p class="text-sm text-ink-subtle">
            {t("settingsFolders.deleteFolderBody", { name: confirmDelete()?.name ?? "" })}
          </p>
          <div class="flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              class="flex-1 rounded-pill border border-border py-2.5 text-sm font-semibold text-ink active:scale-95"
            >
              {t("settingsFolders.cancel")}
            </button>
            <button
              type="button"
              onClick={confirmDeleteFolder}
              class="flex-1 rounded-pill bg-danger py-2.5 text-sm font-semibold text-white active:scale-95"
            >
              {t("settingsFolders.delete")}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
