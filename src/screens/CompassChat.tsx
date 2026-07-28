import { createEffect, createSignal, For, on, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { compassChat } from "../store/compassChat";
import EmptyState from "../components/EmptyState";
import MarkdownContent from "../components/MarkdownContent";
import { BackIcon, CompassIcon, SendIcon, SpinnerIcon } from "../icons";
import { useIsDesktopLayout } from "../lib/platform";
import { t } from "../lib/i18n";

/**
 * A single local-only Compass conversation — never touches the messages
 * table or any other server-side storage; it lives only in this device's
 * localStorage (see store/compassChat.ts). Each turn is a single stateless
 * call to the inference gateway. Styled to match ChatView's header/composer
 * so Compass reads as part of the app rather than a separate tool.
 */
export default function CompassChat() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();

  const thread = () => compassChat.byId(params.id);
  const turns = () => thread()?.turns ?? [];

  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let scrollRef: HTMLDivElement | undefined;

  // A stale/deleted thread id (e.g. deleted in another tab) has nothing to
  // show — bounce back to the list rather than rendering an empty shell.
  createEffect(() => {
    if (params.id && !thread()) navigate("/compass", { replace: true });
  });

  const scrollToBottom = (smooth = true) => {
    scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  // Keep pinned to the bottom while a reply streams in — content length is
  // a cheap enough key to re-run this on every delta without diffing turns.
  createEffect(
    on(
      () => turns().reduce((n, t) => n + t.content.length, 0),
      (_, prev) => {
        if (prev !== undefined) scrollToBottom();
      },
    ),
  );

  const submit = async (e: Event) => {
    e.preventDefault();
    const text = draft().trim();
    if (!text || sending() || !thread()) return;
    setDraft("");
    setSending(true);
    queueMicrotask(() => scrollToBottom());
    try {
      await compassChat.send(params.id, text);
    } catch {
      /* the failed turn already shows its own retry-less error state */
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="relative flex h-full flex-col">
      <header class="flex shrink-0 items-center gap-3 border-b border-border bg-appbar px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <Show when={!isDesktop()}>
          <A
            href="/compass"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
          >
            <BackIcon size={22} />
          </A>
        </Show>
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CompassIcon size={18} />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold leading-tight">{t("compass.title")}</p>
          <p class="truncate text-xs text-ink-subtle">{t("compass.localNote")}</p>
        </div>
      </header>

      <div ref={scrollRef} class="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">
        <Show
          when={turns().length > 0}
          fallback={<EmptyState icon={CompassIcon} title={t("compass.title")} subtitle={t("compass.empty")} />}
        >
          <div class="flex flex-col gap-2.5">
            <For each={turns()}>
              {(turn) => (
                <div class="flex" classList={{ "justify-end": turn.role === "user", "justify-start": turn.role === "assistant" }}>
                  <div
                    class="max-w-[80%] rounded-[1.1rem] px-3.5 py-2 text-[0.95em] leading-snug sm:max-w-[70%]"
                    classList={{
                      "bg-bubble-sent text-bubble-sent-ink": turn.role === "user",
                      "bg-bubble-received text-bubble-received-ink": turn.role === "assistant",
                      "opacity-60": !!turn.pending,
                      "outline outline-1 outline-danger/50": !!turn.failed,
                    }}
                  >
                    <Show
                      when={turn.role === "assistant"}
                      fallback={<p class="whitespace-pre-wrap break-words">{turn.content}</p>}
                    >
                      <Show when={turn.content} fallback={<SpinnerIcon size={14} class="animate-spin opacity-60" />}>
                        <MarkdownContent text={turn.content} />
                      </Show>
                    </Show>
                    <Show when={turn.streaming && turn.content}>
                      <span class="ml-0.5 inline-block h-[0.9em] w-[2px] animate-pulse bg-current align-text-bottom" />
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <form
        onSubmit={submit}
        class="flex shrink-0 gap-2 border-t border-border bg-surface/95 px-[max(var(--safe-left),0.75rem)] pb-[max(var(--safe-bottom),0.75rem)] pt-2.5 backdrop-blur"
      >
        <input
          type="text"
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder={t("compass.placeholder")}
          class="min-w-0 flex-1 rounded-pill border border-border bg-surface px-4 py-2.5 text-ink placeholder-ink-subtle outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        <button
          type="submit"
          disabled={sending() || !draft().trim()}
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform duration-150 hover:brightness-105 disabled:opacity-40 active:scale-95"
          aria-label={t("compass.send")}
        >
          <Show when={!sending()} fallback={<SpinnerIcon size={18} class="animate-spin" />}>
            <SendIcon size={18} />
          </Show>
        </button>
      </form>
    </div>
  );
}
