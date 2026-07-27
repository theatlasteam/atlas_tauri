import { createSignal, For, Show } from "solid-js";
import BackHeader from "../components/BackHeader";
import { compassChat } from "../store/compassChat";
import { BroomIcon, SendIcon, SpinnerIcon } from "../icons";
import { t } from "../lib/i18n";

/**
 * A separate screen, not a chat in the normal sense — this conversation
 * never touches the messages table or any other server-side storage; it
 * lives only in this device's localStorage (see store/compassChat.ts). Each
 * turn is a single stateless call to the inference gateway.
 */
export default function CompassChat() {
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  let scrollRef: HTMLDivElement | undefined;

  const submit = async (e: Event) => {
    e.preventDefault();
    const text = draft().trim();
    if (!text || sending()) return;
    setDraft("");
    setSending(true);
    try {
      await compassChat.send(text);
      queueMicrotask(() => scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" }));
    } catch {
      /* the failed turn already shows its own retry-less error state */
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="flex h-full flex-col">
      <BackHeader title={t("compass.title")} back="/" />

      <div class="flex items-center justify-between px-5 pb-3">
        <p class="text-xs text-ink-subtle">{t("compass.localNote")}</p>
        <Show when={compassChat.turns.length > 0}>
          <button
            type="button"
            onClick={() => compassChat.clear()}
            class="flex shrink-0 items-center gap-1 rounded-pill px-2 py-1 text-xs text-ink-subtle transition hover:bg-surface hover:text-ink"
          >
            <BroomIcon size={13} /> {t("compass.clear")}
          </button>
        </Show>
      </div>

      <div ref={scrollRef} class="flex-1 overflow-y-auto px-4 pb-4">
        <Show
          when={compassChat.turns.length > 0}
          fallback={<p class="px-4 py-10 text-center text-sm text-ink-subtle">{t("compass.empty")}</p>}
        >
          <div class="flex flex-col gap-2.5">
            <For each={compassChat.turns}>
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
                    <p class="whitespace-pre-wrap break-words">{turn.content}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <form onSubmit={submit} class="flex gap-2 border-t border-border px-3 pb-[max(var(--safe-bottom),0.75rem)] pt-2.5">
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
