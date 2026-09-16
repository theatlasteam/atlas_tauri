import { createSignal, onCleanup, onMount } from "solid-js";
import { HourglassHigh } from "phosphor-solid-js";
import { locale } from "../../lib/i18n";

/** Next New Year, so the countdown never expires on a reader. */
function target(): Date {
  const now = new Date();
  return new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0);
}

function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

/** Live countdown in a sealed-capsule frame — the same "not yet" the app
 *  shows, ticking every second. */
export default function CapsuleCountdown() {
  const ru = () => locale() === "ru";
  const [now, setNow] = createSignal(Date.now());
  let timer = 0;

  onMount(() => {
    timer = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));
  });

  const left = () => Math.max(0, target().getTime() - now());
  const units = () => {
    const s = Math.floor(left() / 1000);
    return {
      d: Math.floor(s / 86400),
      h: Math.floor((s % 86400) / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60,
    };
  };
  const cells = () => {
    const u = units();
    return ru()
      ? [
          { v: u.d, l: plural(u.d, ["день", "дня", "дней"]) },
          { v: u.h, l: plural(u.h, ["час", "часа", "часов"]) },
          { v: u.m, l: plural(u.m, ["минута", "минуты", "минут"]) },
          { v: u.s, l: plural(u.s, ["секунда", "секунды", "секунд"]) },
        ]
      : [
          { v: u.d, l: u.d === 1 ? "day" : "days" },
          { v: u.h, l: u.h === 1 ? "hour" : "hours" },
          { v: u.m, l: u.m === 1 ? "min" : "min" },
          { v: u.s, l: u.s === 1 ? "sec" : "sec" },
        ];
  };

  return (
    <div class="rounded-2xl border border-dashed border-accent/50 bg-accent-soft p-6 text-center sm:p-8">
      <p class="mb-5 flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-accent">
        <HourglassHigh size={14} />
        {ru() ? "Капсула откроется" : "Capsule opens in"}
      </p>
      <div class="flex items-start justify-center gap-2 sm:gap-3">
        {cells().map((c, i) => (
          <>
            <div class="min-w-[4.2rem] rounded-xl bg-surface px-3 py-3 shadow-sm sm:min-w-[5rem]">
              <p class="font-mono text-3xl font-semibold tabular-nums sm:text-4xl">
                {String(c.v).padStart(2, "0")}
              </p>
              <p class="mt-1 text-[11px] uppercase tracking-wider text-ink-subtle">{c.l}</p>
            </div>
            {i < 3 && <span class="pt-3 font-mono text-2xl text-ink-subtle">:</span>}
          </>
        ))}
      </div>
      <p class="mt-5 text-sm text-ink-muted">
        {ru()
          ? "До этого момента внутри — только обратный отсчёт. Даже для автора."
          : "Until then, there's only a countdown inside. Even for the author."}
      </p>
    </div>
  );
}
