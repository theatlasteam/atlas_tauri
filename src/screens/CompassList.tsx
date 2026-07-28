import { For, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { compassChat } from "../store/compassChat";
import EmptyState from "../components/EmptyState";
import AnimatedList from "../ui/AnimatedList";
import { CompassIcon, PlusIcon, TrashIcon } from "../icons";
import { formatRelativeTime } from "../lib/time";
import { t } from "../lib/i18n";

/**
 * List of local-only Compass conversations, one device's own — mirrors
 * ChatList's layout so Compass feels like part of the app, not a bolt-on.
 */
export default function CompassList() {
  const navigate = useNavigate();

  const startNew = () => {
    const id = compassChat.create();
    navigate(`/compass/${id}`);
  };

  const remove = (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t("compass.deleteConfirm"))) return;
    compassChat.remove(id);
  };

  return (
    <div class="flex h-full flex-col">
      <header class="flex shrink-0 items-center justify-between border-b border-border bg-appbar px-5 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <h1 class="font-heading text-2xl font-bold">{t("compass.title")}</h1>
        <button
          type="button"
          onClick={startNew}
          class="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
          aria-label={t("compass.newChatAria")}
        >
          <PlusIcon size={21} />
        </button>
      </header>

      <div class="flex-1 overflow-y-auto overscroll-contain pb-28">
        <Show
          when={compassChat.threads.length > 0}
          fallback={
            <EmptyState icon={CompassIcon} title={t("compass.title")} subtitle={t("compass.noThreads")} />
          }
        >
          <ul class="relative flex flex-col px-3 pt-2">
            <AnimatedList>
              <For each={compassChat.threads}>
                {(thread) => (
                  <li>
                    <A
                      href={`/compass/${thread.id}`}
                      class="group flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors duration-150 hover:bg-surface active:bg-surface"
                    >
                      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <CompassIcon size={20} />
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-baseline justify-between gap-2">
                          <p class="truncate font-semibold text-ink">
                            {thread.title || t("compass.untitled")}
                          </p>
                          <span class="shrink-0 text-xs text-ink-subtle">
                            {formatRelativeTime(thread.updatedAt)}
                          </span>
                        </div>
                        <p class="truncate text-sm text-ink-muted">
                          {thread.turns[thread.turns.length - 1]?.content || ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => remove(e, thread.id)}
                        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle opacity-0 transition-[background-color,color,opacity] duration-150 hover:bg-surface hover:text-danger group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={t("compass.deleteAria")}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </A>
                  </li>
                )}
              </For>
            </AnimatedList>
          </ul>
        </Show>
      </div>
    </div>
  );
}
