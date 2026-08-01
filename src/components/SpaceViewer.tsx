import { createEffect, createResource, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Transition } from "solid-transition-group";
import { api } from "../data/api";
import { messagesStore } from "../store/messages";
import { useEscapeKey } from "../ui/lib/dismiss";
import { CloseIcon, RemixIcon, SpinnerIcon } from "../icons";
import { t } from "../lib/i18n";
import SpacePromptModal from "./SpacePromptModal";

/**
 * Full-screen viewer for a shared Atlas Space. The iframe is the entire
 * security boundary for whatever the model generated: `sandbox="allow-scripts"`
 * only — no allow-same-origin (so the generated app cannot read this app's
 * storage/cookies or make same-origin requests), no allow-top-navigation, no
 * allow-popups. The system prompt in server/src/spaces.rs asks the model to
 * play along, but this sandbox attribute is what actually holds if it doesn't.
 */
export default function SpaceViewer(props: {
  /** null = closed. */
  spaceId: string | null;
  /** Chat to post a remix's share message into. */
  chatId: string;
  onClose: () => void;
}) {
  // Owns its own "which Space is on screen" id so "View original" can
  // navigate to the parent without involving the caller — only the initial
  // value and full close come from outside.
  const [currentId, setCurrentId] = createSignal<string | null>(null);
  const [remixOpen, setRemixOpen] = createSignal(false);

  createEffect(() => setCurrentId(props.spaceId));

  const [space] = createResource(currentId, (id) => api.getSpace(id));

  useEscapeKey(props.onClose, () => props.spaceId !== null);

  createEffect(() => {
    if (!props.spaceId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.body.style.overflow = previousOverflow;
    });
  });

  const onRemixed = (newSpaceId: string) => {
    setRemixOpen(false);
    void messagesStore.sendSpace(props.chatId, newSpaceId);
    setCurrentId(newSpaceId);
  };

  return (
    <Portal>
      <Transition name="fade">
        <Show when={props.spaceId !== null}>
          <div class="fixed inset-0 z-[45] flex flex-col bg-bg">
            <header class="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
              <button
                type="button"
                onClick={props.onClose}
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-bg hover:text-ink active:bg-bg"
                aria-label={t("space.closeAria")}
              >
                <CloseIcon size={18} />
              </button>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-ink">{t("space.viewerTitle")}</p>
                <Show when={space()?.parentSpaceId}>
                  {(parentId) => (
                    <button
                      type="button"
                      onClick={() => setCurrentId(parentId())}
                      class="truncate text-xs text-ink-subtle underline-offset-2 hover:underline"
                    >
                      {t("space.remixedFrom")}
                    </button>
                  )}
                </Show>
              </div>
              <button
                type="button"
                onClick={() => setRemixOpen(true)}
                disabled={!space()}
                class="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-bg disabled:opacity-40"
              >
                <RemixIcon size={16} />
                {t("space.remix")}
              </button>
            </header>

            <div class="relative flex-1">
              <Show
                when={!space.loading}
                fallback={
                  <div class="flex h-full items-center justify-center gap-2 text-ink-subtle">
                    <SpinnerIcon size={18} class="animate-spin" />
                    <span class="text-sm">{t("space.loading")}</span>
                  </div>
                }
              >
                <Show
                  when={space()}
                  fallback={<div class="flex h-full items-center justify-center text-sm text-ink-subtle">{t("space.loadError")}</div>}
                >
                  {(dto) => (
                    <iframe
                      sandbox="allow-scripts"
                      srcdoc={dto().html}
                      class="h-full w-full border-0 bg-white"
                      title={t("space.viewerTitle")}
                    />
                  )}
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </Transition>

      <SpacePromptModal
        open={remixOpen()}
        onOpenChange={setRemixOpen}
        mode="remix"
        parentSpaceId={currentId() ?? undefined}
        onGenerated={onRemixed}
      />
    </Portal>
  );
}
