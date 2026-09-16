import { For } from "solid-js";

/** Lede with an xAI-style 3D pop-in: word by word, each tilting up around
 *  its baseline axis with a fade. Remounts (replays) on locale change via
 *  the caller's key. */
export default function FlipLede(props: { text: string; baseDelayMs?: number }) {
  const words = () => props.text.split(/(\s+)/);
  const base = () => props.baseDelayMs ?? 500;
  let n = 0;
  return (
    <span class="mx-flip-stage" aria-label={props.text}>
      <For each={words()}>
        {(w) => {
          if (/^\s+$/.test(w)) return <>{w}</>;
          const i = n++;
          return (
            <span class="mx-flip-mask" aria-hidden="true">
              <span
                class="mx-flip-char"
                style={{ "animation-delay": `${Math.round(base() + i * 28)}ms` }}
              >
                {w}
              </span>
            </span>
          );
        }}
      </For>
    </span>
  );
}
