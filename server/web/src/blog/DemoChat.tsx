import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { CheckCircle, Clock, PaperPlaneRight } from "phosphor-solid-js";
import { t } from "../lib/i18n";
import MascotOrb from "./MascotOrb";

/**
 * A self-playing slice of the Atlas chat UI: header with the Mind's orb and
 * live status, your blue bubble on the right, the Mind's answer on the
 * left with its tool card underneath — the exact shapes of the real
 * MindDetail screen, performing a version check on a loop.
 */
export default function DemoChat() {
  // 0=user, 1=status+tool running, 2=tool done, 3=answer
  const [step, setStep] = createSignal(0);
  const timers: number[] = [];

  const loop = () => {
    setStep(0);
    timers.push(window.setTimeout(() => setStep(1), 1400));
    timers.push(window.setTimeout(() => setStep(2), 3600));
    timers.push(window.setTimeout(() => setStep(3), 4400));
    timers.push(window.setTimeout(loop, 9200));
  };
  onCleanup(() => timers.forEach(clearTimeout));

  // Restart the loop if the locale changes mid-cycle so strings never mix.
  // (Runs on mount too — this is the only place the loop starts.)
  createEffect(() => {
    t("blog.demo.user");
    timers.forEach(clearTimeout);
    timers.length = 0;
    loop();
  });

  const working = () => step() >= 1 && step() < 3;

  return (
    <div class="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#111]">
      {/* Chat header, like the app: orb, name, live status */}
      <div class="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <MascotOrb state={step() >= 3 ? "idle" : "thinking"} size={36} />
        <div class="min-w-0 flex-1">
          <p class="truncate text-[15px] font-semibold text-white">{t("blog.demo.name")}</p>
          <p
            class="truncate text-xs"
            classList={{ "animate-pulse text-emerald-300": working(), "text-white/40": !working() }}
          >
            {working() ? t("blog.demo.status") : step() >= 3 ? t("blog.demo.done") : t("blog.demo.name")}
          </p>
        </div>
      </div>

      <div class="flex flex-col gap-2.5 px-4 py-4">
        {/* Yours, right */}
        <div class="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[#2f7bf6] px-4 py-2.5 text-[15px] leading-snug text-white">
          {t("blog.demo.user")}
        </div>

        {/* Tool card under the answer's future spot, like the app */}
        <Show when={step() >= 1}>
          <div class="mr-auto w-full max-w-[85%] overflow-hidden rounded-xl border border-white/10 bg-white/[0.05]">
            <div class="flex items-center justify-between gap-2 p-2.5">
              <span class="flex min-w-0 items-center gap-2">
                <span class="truncate text-[13px] font-semibold text-white">{t("blog.demo.tool")}</span>
                <span
                  class="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  classList={{
                    "bg-white/10 text-white/70": step() < 2,
                    "bg-emerald-500/15 text-emerald-300": step() >= 2,
                  }}
                >
                  {step() < 2 ? <Clock size={12} class="animate-pulse" /> : <CheckCircle size={12} />}
                  {step() < 2 ? t("blog.minds.demo.thinking") : t("blog.demo.done")}
                </span>
              </span>
              <span class="max-w-[45%] truncate font-mono text-[11px] text-white/40">
                {t("blog.demo.toolDetail")}
              </span>
            </div>
          </div>
        </Show>

        {/* The Mind's answer, left */}
        <Show when={step() >= 3}>
          <div class="mr-auto w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.08] px-4 py-2.5 text-[15px] leading-relaxed text-white">
            {t("blog.demo.answer")}
          </div>
        </Show>
      </div>

      {/* Dead composer for the look — mirrors the app without pretending to work */}
      <div class="border-t border-white/10 px-4 py-3">
        <div class="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5">
          <p class="flex-1 truncate text-sm text-white/30">{t("blog.demo.user")}</p>
          <PaperPlaneRight size={16} class="shrink-0 text-white/30" />
        </div>
      </div>
    </div>
  );
}
