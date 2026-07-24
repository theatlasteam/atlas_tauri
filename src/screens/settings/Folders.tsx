import { createSignal, For, Show } from "solid-js";
import { chatsState, createFolder, deleteFolder } from "../../store/chats";
import { SettingsSection } from "../../components/SettingsSection";
import BackHeader from "../../components/BackHeader";
import EmptyState from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import Dialog from "../../ui/Dialog";
import AnimatedList from "../../ui/AnimatedList";
import { FolderIcon, PlusIcon, TrashIcon } from "../../icons";

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
      <BackHeader title="Chats & Folders" />

      <SettingsSection title="Folders">
        <Show
          when={chatsState.loaded}
          fallback={
            <div class="flex flex-col gap-3 p-4">
              <Skeleton class="h-5 w-24" />
              <Skeleton class="h-5 w-32" />
            </div>
          }
        >
          <Show when={chatsState.folders.length > 0} fallback={<EmptyState icon={FolderIcon} title="No folders yet" subtitle="Add a folder to organize your chats." />}>
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
                        aria-label={`Delete folder ${folder.name}`}
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
          Add folder
        </button>
      </SettingsSection>

      <Dialog open={showDialog()} onOpenChange={setShowDialog} title="New folder">
        <form onSubmit={addFolder} class="flex flex-col gap-4">
          <input
            autofocus
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Folder name"
            class="rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!name().trim()}
            class="rounded-pill bg-accent py-2.5 text-sm font-semibold text-accent-ink disabled:opacity-40 active:scale-95"
          >
            Create
          </button>
        </form>
      </Dialog>

      <Dialog open={confirmDelete() !== null} onOpenChange={(open) => !open && setConfirmDelete(null)} title="Delete folder">
        <div class="flex flex-col gap-4">
          <p class="text-sm text-ink-subtle">
            Delete "{confirmDelete()?.name}"? Chats inside it won't be deleted, just unfiled.
          </p>
          <div class="flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              class="flex-1 rounded-pill border border-border py-2.5 text-sm font-semibold text-ink active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteFolder}
              class="flex-1 rounded-pill bg-danger py-2.5 text-sm font-semibold text-white active:scale-95"
            >
              Delete
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
