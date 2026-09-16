import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { t } from "../lib/i18n";
import MascotOrb, { type MascotState } from "./MascotOrb";

interface Line {
  mood: MascotState;
  text: string;
  holdMs: number;
}

/**
 * The hero mascot, performing on its own: it cycles moods and speaks each
 * line with a typewriter, then moves to the next. Nobody clicks anything —
 * it runs the show itself while its eyes keep following your cursor.
 */
export default function TalkingMascot(props: { size?: number }) {
  const script = (): Line[] => [
    { mood: "thinking", text: t("blog.mascot.say1"), holdMs: 2200 },
    { mood: "happy", text: t("blog.mascot.say2"), holdMs: 2800 },
    { mood: "idle", text: t("blog.mascot.say3"), holdMs: 2600 },
    { mood: "sleeping", text: t("blog.mascot.say4"), holdMs: 2800 },
  ];

  const [mood, setMood] = createSignal<MascotState>("thinking");
  const [shown, setShown] = createSignal("");
  const [typing, setTyping] = createSignal(true);
  const timers: number[] = [];
  let lineIdx = 0;
  let charTimer = 0;

  const playLine = () => {
    const lines = script();
    const line = lines[lineIdx % lines.length];
    setMood(line.mood);
    setShown("");
    setTyping(true);
    let i = 0;
    window.clearInterval(charTimer);
    charTimer = window.setInterval(() => {
      i += 1;
      setShown(line.text.slice(0, i));
      if (i >= line.text.length) {
        window.clearInterval(charTimer);
        setTyping(false);
        timers.push(window.setTimeout(() => {
          lineIdx += 1;
          playLine();
        }, line.holdMs));
      }
    }, 26);
  };

  // Restart on locale change so the voice never mixes languages mid-line.
  createEffect(() => {
    t("blog.mascot.say1");
    timers.forEach(clearTimeout);
    timers.length = 0;
    window.clearInterval(charTimer);
    lineIdx = 0;
    playLine();
  });
  onCleanup(() => {
    timers.forEach(clearTimeout);
    window.clearInterval(charTimer);
  });

  return (
    <div class="flex flex-col items-center gap-4">
      <div
        aria-live="polite"
        class="relative min-h-[3.5rem] w-full max-w-[16rem] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-left text-sm leading-snug text-black"
      >
        {shown()}
        <Show when={typing()}>
          <span class="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-black/60 align-text-bottom" />
        </Show>
      </div>
      <div class="transition-transform duration-300 hover:scale-[1.03]">
        <MascotOrb state={mood()} size={props.size ?? 200} />
      </div>
    </div>
  );
}
