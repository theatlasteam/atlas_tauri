import { createSignal, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import { X } from "phosphor-solid-js";
import { joinWaitlist } from "../lib/api";
import { t } from "../lib/i18n";

interface WaitlistModalProps {
  open: boolean;
  onClose: () => void;
}

export default function WaitlistModal(props: WaitlistModalProps) {
  const [email, setEmail] = createSignal("");
  const [consent, setConsent] = createSignal(false);
  const [status, setStatus] = createSignal<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = createSignal("");

  async function submit(e: Event) {
    e.preventDefault();
    if (status() === "loading" || !consent()) return;
    setStatus("loading");
    try {
      await joinWaitlist(email());
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function close() {
    props.onClose();
    setStatus("idle");
    setEmail("");
    setConsent(false);
  }

  return (
    <>
      <Transition name="fade">
        <Show when={props.open}>
          <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={close} />
        </Show>
      </Transition>
      <Transition name="pop">
        <Show when={props.open}>
          <div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="pointer-events-auto relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-floating">
              <button
            type="button"
            onClick={close}
            aria-label="Close"
            class="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-pill text-ink-subtle hover:text-ink"
          >
            <X size={18} />
          </button>

          <Show
            when={status() !== "done"}
            fallback={
              <div class="py-4 text-center">
                <h3 class="mb-2 font-heading text-xl font-semibold">{t("waitlist.doneTitle")}</h3>
                <p class="text-ink-muted">{t("waitlist.doneBody")}</p>
              </div>
            }
          >
            <h3 class="mb-1 font-heading text-xl font-semibold">{t("waitlist.title")}</h3>
            <p class="mb-5 text-sm text-ink-muted">{t("waitlist.body")}</p>
            <form onSubmit={submit} class="flex flex-col gap-3">
              <input
                type="email"
                required
                autofocus
                placeholder={t("waitlist.placeholder")}
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                class="rounded-xl border border-border bg-base px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
              <label class="group flex items-start gap-2.5 text-xs text-ink-muted">
                <span class="relative mt-px inline-flex h-[18px] w-[18px] shrink-0 transition-transform duration-150 active:scale-90">
                  <input
                    type="checkbox"
                    required
                    checked={consent()}
                    onChange={(e) => setConsent(e.currentTarget.checked)}
                    class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md border border-border bg-base outline-none transition-[background-color,border-color] duration-150 checked:border-accent checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                  {/* pathLength="1" normalizes the checkmark's real length to 1
                      unit, so stroke-dasharray/dashoffset can just be 1/0 —
                      no measuring the actual path in pixels. Drawn on check,
                      un-drawn (not just faded) on uncheck, so toggling fast
                      reverses the stroke instead of crossfading. */}
                  <svg
                    viewBox="0 0 16 16"
                    class="pointer-events-none absolute inset-0 h-full w-full p-[3px] text-white peer-checked:[&_path]:[stroke-dashoffset:0]"
                    fill="none"
                  >
                    <path
                      d="M3 8.2L6.5 11.7L13 4.3"
                      pathLength="1"
                      stroke="currentColor"
                      stroke-width="2.2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-300 ease-out"
                    />
                  </svg>
                </span>
                <span class="cursor-pointer">
                  {t("waitlist.consentPrefix")}{" "}
                  <a href="/privacy" target="_blank" class="text-accent underline" onClick={(e) => e.stopPropagation()}>
                    {t("waitlist.consentLink")}
                  </a>
                </span>
              </label>
              <button
                type="submit"
                disabled={status() === "loading" || !consent()}
                class="rounded-pill bg-accent px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-60"
              >
                {status() === "loading" ? t("waitlist.joining") : t("waitlist.join")}
              </button>
              <Show when={status() === "error"}>
                <p class="text-center text-xs text-red-500">{errorMsg()}</p>
              </Show>
            </form>
          </Show>
        </div>
      </div>
        </Show>
      </Transition>
    </>
  );
}
