import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Button, GridLoader } from "@atlas/ui";
import { mindsStore, mindInRoom } from "../store/minds";
import MindOrb from "../components/MindOrb";
import MarkdownContent from "../components/MarkdownContent";
import { BackIcon, SendIcon, TrashIcon } from "../icons";
import { t } from "../lib/i18n";
import { useIsDesktopLayout } from "../lib/platform";

/**
 * A room: you plus up to four Minds, talking.
 *
 * The transcript is grouped into turns, not rendered as a flat list, because
 * a turn is the unit that matters here — "I said X, and here's what the room
 * made of it." Each Mind's reply carries its own colour and orb so you can
 * read who's talking without reading the names.
 */
export default function MindRoom() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();

  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let scrollRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;

  const room = () => mindsStore.state.rooms?.find((r) => r.id === params.id);
  const messages = () => mindsStore.state.messages[params.id] ?? [];
  const thinking = () => mindsStore.state.thinking[params.id] ?? [];

  onMount(() => {
    // Rooms are usually reached from the list (already loaded), but a deep
    // link or a reload has neither the room nor its transcript.
    if (!mindsStore.state.rooms) void mindsStore.loadRooms();
    void mindsStore.loadMessages(params.id);
  });

  // A room deleted elsewhere (or one that isn't yours) has nothing to show.
  createEffect(() => {
    if (mindsStore.state.rooms && !room() && !sending()) navigate("/minds", { replace: true });
  });

  const scrollToBottom = (smooth = true) => {
    scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  createEffect(() => {
    // Re-run when the transcript grows or a Mind starts/stops thinking.
    void messages().length;
    void thinking().length;
    queueMicrotask(() => scrollToBottom());
  });

  const submit = async () => {
    const text = draft().trim();
    if (!text || sending() || !room()) return;
    setDraft("");
    setSending(true);
    queueMicrotask(() => scrollToBottom());
    try {
      await mindsStore.sendTurn(
        params.id,
        text,
        room()!.minds.map((m) => m.id),
      );
    } catch {
      /* the store surfaces the error under the composer */
    } finally {
      setSending(false);
      inputRef?.focus();
    }
  };

  const allowed = () => mindsStore.hasAccess();

  return (
    <div class="flex h-full flex-col">
      <header class="flex shrink-0 items-center gap-3 border-b border-border bg-appbar px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
        <Show when={!isDesktop()}>
          <A
            href="/minds"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
          >
            <BackIcon size={22} />
          </A>
        </Show>

        <Show when={room()}>
          {(r) => (
            <>
              <span class="flex shrink-0 -space-x-2">
                <For each={r().minds.slice(0, 3)}>
                  {(m) => (
                    <span class="rounded-full ring-2 ring-appbar">
                      <MindOrb color={m.color} colorEnd={m.colorEnd} size={30} />
                    </span>
                  )}
                </For>
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold leading-tight">{r().title}</p>
                <p class="truncate text-xs text-ink-subtle">
                  {r().minds.map((m) => m.name).join(", ")}
                </p>
              </div>
              <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle transition hover:bg-surface hover:text-danger"
                aria-label={t("minds.deleteRoomAria")}
                onClick={async () => {
                  if (!confirm(t("minds.deleteRoomConfirm"))) return;
                  await mindsStore.deleteRoom(r().id);
                  navigate("/minds");
                }}
              >
                <TrashIcon size={16} />
              </button>
            </>
          )}
        </Show>
      </header>

      <Show
        when={allowed()}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-ink-muted">
            {t("minds.lockedBody")}
          </div>
        }
      >
        <div ref={scrollRef} class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <Show
            when={messages().length > 0}
            fallback={
              <div class="mx-auto flex max-w-md flex-col items-center px-4 py-10 text-center">
                <Show when={room()}>
                  {(r) => (
                    <span class="mb-4 flex -space-x-3">
                      <For each={r().minds.slice(0, 3)}>
                        {(m) => (
                          <span class="rounded-full ring-2 ring-bg">
                            <MindOrb color={m.color} colorEnd={m.colorEnd} size={44} />
                          </span>
                        )}
                      </For>
                    </span>
                  )}
                </Show>
                <h2 class="font-heading text-xl font-semibold">{room()?.title ?? t("minds.title")}</h2>
                <p class="mt-2 text-[15px] text-ink-muted">{t("minds.roomEmpty")}</p>
                <p class="mt-1 text-sm text-ink-subtle">{t("minds.roomEmptyHint")}</p>
              </div>
            }
          >
            <div class="mx-auto flex max-w-2xl flex-col gap-5">
              <For each={groupTurns(messages())}>
                {(turn) => (
                  <div class="flex flex-col gap-3">
                    {/* The human's line, right-aligned like a sent bubble. */}
                    <Show when={turn.human}>
                      <div class="ml-auto w-fit max-w-[85%] rounded-2xl bg-bubble-sent px-3.5 py-2 text-[15px] leading-snug text-bubble-sent-ink">
                        <p class="whitespace-pre-wrap break-words">{turn.human}</p>
                      </div>
                    </Show>

                    <For each={turn.replies}>
                      {(reply) => {
                        const mind = () => mindInRoom(room(), reply.mindId);
                        return (
                          <div class="flex gap-2.5">
                            <span class="mt-0.5 shrink-0">
                              <MindOrb
                                color={mind()?.color ?? "#8a8a8a"}
                                colorEnd={mind()?.colorEnd}
                                size={32}
                              />
                            </span>
                            <div class="min-w-0 flex-1">
                              <p
                                class="text-[11px] font-semibold uppercase tracking-wide"
                                style={{ color: mind()?.color }}
                              >
                                {mind()?.name ?? t("minds.someoneLeft")}
                              </p>
                              <div class="text-[15px] leading-relaxed text-ink">
                                <MarkdownContent text={reply.content} />
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>

              {/* Whoever is mid-reply right now, in the order they'll answer. */}
              <Show when={thinking().length > 0}>
                <div class="flex flex-col gap-2.5 border-t border-border pt-4">
                  <For each={thinking()}>
                    {(mindId) => {
                      const mind = () => room()?.minds.find((m) => m.id === mindId);
                      return (
                        <div class="flex items-center gap-2.5">
                          <MindOrb
                            color={mind()?.color ?? "#8a8a8a"}
                            colorEnd={mind()?.colorEnd}
                            size={28}
                            thinking
                          />
                          <GridLoader pattern="hollow" size="sm" />
                          <p class="text-sm text-ink-subtle">
                            {mind()?.name ?? t("minds.title")} · {t("minds.thinking")}…
                          </p>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        <div class="shrink-0 border-t border-border bg-surface/95 px-[max(var(--safe-left),0.75rem)] pb-[max(var(--safe-bottom),0.75rem)] pt-2.5 backdrop-blur">
          <Show when={mindsStore.state.error}>
            <p class="mb-2 px-1 text-xs text-danger">{mindsStore.state.error}</p>
          </Show>
          <form
            class="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              ref={inputRef}
              value={draft()}
              rows="1"
              placeholder={t("minds.placeholder")}
              disabled={sending()}
              class="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-bg px-3.5 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent disabled:opacity-60"
              onInput={(e) => {
                setDraft(e.currentTarget.value);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 128)}px`;
              }}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter newlines — the muscle memory
                // everyone already has from every other messenger.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <Button
              type="submit"
              size="md"
              disabled={!draft().trim() || sending()}
              loading={sending()}
              ariaLabel={t("minds.send")}
            >
              <Show when={!sending()}>
                <SendIcon size={18} />
              </Show>
            </Button>
          </form>
        </div>
      </Show>
    </div>
  );
}

type Turn = { human: string | null; replies: { mindId: string | null; content: string }[] };

/**
 * Splits the flat transcript into turns: a human line followed by every Mind
 * reply that came after it, until the next human line.
 *
 * Server-side, Mind replies within one turn are appended in order, so ordering
 * by arrival is already correct — no need to re-sort by timestamp, which would
 * tie (they're written milliseconds apart) and could shuffle a Mind's reply.
 */
function groupTurns(messages: { mindId: string | null; role: string; content: string }[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user" || m.mindId === null) {
      turns.push({ human: m.content, replies: [] });
      continue;
    }
    const last = turns[turns.length - 1];
    if (last) last.replies.push({ mindId: m.mindId, content: m.content });
    else turns.push({ human: null, replies: [{ mindId: m.mindId, content: m.content }] });
  }
  return turns;
}
