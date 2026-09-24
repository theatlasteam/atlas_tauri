import { For, Show, createEffect, onMount } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { compassChat } from "../store/compassChat";
import { mindsStore } from "../store/minds";
import EmptyState from "../components/EmptyState";
import AnimatedList from "../ui/AnimatedList";
import Appbar from "../components/Appbar";
import MindOrb from "../components/MindOrb";
import { CompassIcon, MindsIcon, PlusIcon, TrashIcon } from "../icons";
import { formatRelativeTime } from "../lib/time";
import { t } from "../lib/i18n";
import { openNativeOrNavigate } from "../lib/mobileWindows";

/**
 * List of local-only Compass conversations, one device's own — mirrors
 * ChatList's layout so Compass feels like part of the app, not a bolt-on.
 */
export default function CompassList() {
  const navigate = useNavigate();

  const startNew = () => {
    const id = compassChat.create();
    void openNativeOrNavigate(navigate, `/compass/${id}`);
  };

  const remove = (e: MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t("compass.deleteConfirm"))) return;
    compassChat.remove(id);
  };

  // Atlas X / Free Minds: Minds live here, inside Compass — not in Settings. A Mind is a
  // 24/7 sandbox agent (tools + schedules), and Compass is where you talk to
  // AI things, so this is where people look for them.
  const hasAccess = () => mindsStore.hasAccess();
  const minds = () => mindsStore.state.minds ?? [];
  onMount(() => {
    void mindsStore.checkAccess();
  });
  createEffect(() => {
    if (hasAccess()) {
      if (mindsStore.state.minds === null) void mindsStore.loadMinds();
      if (mindsStore.state.rooms === null) void mindsStore.loadRooms();
    }
  });

  return (
    <div class="flex h-full flex-col">
      <Appbar
        title={t("compass.title")}
        actions={
          <div class="flex items-center">
            {/* Atlas X: creating a Mind starts here, in Compass — not in a tab,
                not in Settings. One tap goes to Minds, where the creator lives. */}
            <Show when={hasAccess()}>
              <button
                type="button"
                onClick={() => navigate("/minds")}
                class="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                aria-label={t("minds.newMindAria")}
                title={t("minds.newMind")}
              >
                <MindsIcon size={21} />
              </button>
            </Show>
            <button
              type="button"
              onClick={startNew}
              class="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
              aria-label={t("compass.newChatAria")}
            >
              <PlusIcon size={21} />
            </button>
          </div>
        }
      />

      <div class="flex-1 overflow-y-auto overscroll-contain pb-28">
        {/* Minds row: horizontal snap-list of your agents above the chats. */}
        <Show when={hasAccess()}>
          <div class="border-b border-border px-5 pb-4 pt-2">
            <div class="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate("/minds")}
                class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle hover:text-ink"
              >
                <MindsIcon size={14} />
                {t("minds.title")}
              </button>
              <Show when={minds().length > 0}>
                <span class="text-[11px] text-ink-subtle">
                  {minds().filter((m) => m.isActive).length}/{minds().length} {t("minds.active")}
                </span>
              </Show>
            </div>
            <Show
              when={minds().length > 0}
              fallback={
                <button
                  type="button"
                  onClick={() => navigate("/minds")}
                  class="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border px-3 py-2.5 text-left transition hover:border-accent hover:bg-accent-soft"
                >
                  <MindsIcon size={18} class="shrink-0 text-ink-subtle" />
                  <span class="text-sm text-ink-muted">{t("minds.emptyHint")}</span>
                </button>
              }
            >
              <div class="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
                <For each={minds()}>
                  {(mind) => (
                    <button
                      type="button"
                      onClick={() => void openNativeOrNavigate(navigate, `/minds/${mind.id}`)}
                      class="flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border bg-surface px-2 py-3 transition hover:border-accent active:scale-95"
                      style={{ opacity: mind.isActive ? "1" : "0.5" }}
                    >
                      <MindOrb color={mind.color} colorEnd={mind.colorEnd} size={40} />
                      <span class="w-full truncate text-center text-xs font-medium text-ink">
                        {mind.name}
                      </span>
                      <Show when={!mind.isActive}>
                        <span class="text-[10px] text-ink-subtle">{t("minds.paused")}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

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
                    <div class="group flex items-center gap-1 rounded-2xl hover:bg-surface">
                    <A
                      href={`/compass/${thread.id}`}
                      class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3"
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
                    </A>
                      <button
                        type="button"
                        onClick={(e) => remove(e, thread.id)}
                        class="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-surface hover:text-danger"
                        aria-label={t("compass.deleteAria")}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
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
