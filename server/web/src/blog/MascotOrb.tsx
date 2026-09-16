import { createEffect, createSignal, onCleanup, Show } from "solid-js";

export type MascotState = "idle" | "thinking" | "happy" | "sleeping";

/** Same eight identities the app deals to Minds — the page never shows the
 *  same brown blob twice. */
const PALETTE: [string, string][] = [
  ["#ff5c9e", "#99004d"],
  ["#e8933c", "#7a4a1c"],
  ["#5b8cff", "#1d4ed8"],
  ["#3ddc74", "#15803d"],
  ["#c07bff", "#6b21a8"],
  ["#ff6b5e", "#991b1b"],
  ["#2dd4bf", "#0f766e"],
  ["#fbbf24", "#b45309"],
];

let orbSeq = 0;

/**
 * The Minds mascot for the blog — the same blob the app uses, with eyes
 * that follow your cursor and moods you can switch. Pupils track the
 * pointer (clamped, smoothed by CSS transition); blinking runs on a random
 * loop; each state changes the eyes and the body language.
 */
export default function MascotOrb(props: { state: MascotState; size?: number }) {
  const size = () => props.size ?? 220;
  let svgRef: SVGSVGElement | undefined;
  const [gaze, setGaze] = createSignal({ x: 0, y: 0 });
  const [blink, setBlink] = createSignal(false);
  // One random identity per mount (plus a unique gradient id — duplicates
  // would all resolve url(#…) to the first instance and share its colors).
  const gid = `mx-grad-${++orbSeq}`;
  const [colors] = createSignal(PALETTE[Math.floor(Math.random() * PALETTE.length)]);

  // Pupils follow the cursor: vector from orb centre to pointer, clamped to
  // the eye radius so they never leave the whites. Runs on rAF-throttled
  // mousemove; the CSS transition smooths the rest.
  let raf = 0;
  let target = { x: 0, y: 0 };
  const onMove = (e: MouseEvent) => {
    if (!svgRef) return;
    const r = svgRef.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const max = Math.min(r.width, r.height) * 0.045;
    target = { x: (dx / dist) * Math.min(max, dist * 0.06), y: (dy / dist) * Math.min(max, dist * 0.06) };
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        setGaze(target);
      });
    }
  };

  // Random-loop blink: shut for ~150ms every 2.4–5.2s. Faster cadence while
  // thinking reads as concentration rather than sleepiness.
  let blinkTimer = 0;
  const scheduleBlink = () => {
    const base = props.state === "thinking" ? 1600 : 3000;
    blinkTimer = window.setTimeout(
      () => {
        setBlink(true);
        window.setTimeout(() => {
          setBlink(false);
          scheduleBlink();
        }, 150);
      },
      base + Math.random() * 2200,
    );
  };

  createEffect(() => {
    void props.state;
    window.clearTimeout(blinkTimer);
    setBlink(false);
    scheduleBlink();
  });
  window.addEventListener("mousemove", onMove, { passive: true });
  scheduleBlink();
  onCleanup(() => {
    window.removeEventListener("mousemove", onMove);
    window.clearTimeout(blinkTimer);
    cancelAnimationFrame(raf);
  });

  const st = () => props.state;
  // Gaze freezes when asleep; thinking adds a quick dart on top.
  const px = () => (st() === "sleeping" ? 0 : gaze().x);
  const py = () => (st() === "sleeping" ? 0 : gaze().y);

  return (
    <div>
      <style>{`
        .mx-body { transform-box: fill-box; transform-origin: center; }
        .mx-idle { animation: mx-breathe 3.4s ease-in-out infinite; }
        .mx-thinking { animation: mx-think 1.1s ease-in-out infinite; }
        .mx-happy { animation: mx-bounce 0.9s ease-in-out infinite; }
        .mx-sleeping { animation: mx-sleep 4.6s ease-in-out infinite; }
        @keyframes mx-breathe { 0%,100% { transform: translateY(0) scale(1,1); } 50% { transform: translateY(-2.2%) scale(1.015,.99); } }
        @keyframes mx-think { 0%,100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-2.6%) rotate(-1.2deg); } 75% { transform: translateY(1%) rotate(1.2deg); } }
        @keyframes mx-bounce { 0%,100% { transform: translateY(0) scale(1,1); } 30% { transform: translateY(-5%) scale(0.97,1.04); } 55% { transform: translateY(0) scale(1.03,0.96); } }
        @keyframes mx-sleep { 0%,100% { transform: translateY(0) scale(1,1); } 50% { transform: translateY(1.6%) scale(1.03,.96); } }
        .mx-pupils { transition: transform 130ms ease-out; transform-box: fill-box; }
        .mx-dart { animation: mx-dart 1.25s ease-in-out infinite; }
        @keyframes mx-dart { 0%,100% { translate: -14px 0; } 50% { translate: 14px -3px; } }
        .mx-eyelid { transition: transform 90ms ease-in; transform-box: fill-box; transform-origin: center; }
        .mx-zzz { animation: mx-zzz 3s ease-out infinite; opacity: 0; }
        .mx-zzz-late { animation-delay: 1.5s; }
        @keyframes mx-zzz { 0% { opacity: 0; transform: translateY(6px) scale(.7); } 25% { opacity: .9; } 100% { opacity: 0; transform: translateY(-16px) scale(1.05); } }
        @media (prefers-reduced-motion: reduce) { .mx-idle,.mx-thinking,.mx-happy,.mx-sleeping,.mx-dart,.mx-zzz { animation: none; } }
      `}</style>
      <svg
        ref={svgRef}
        width={size()}
        height={size()}
        viewBox="0 0 481 357"
        fill="none"
        role="img"
        aria-label="Minds mascot"
        style={{ width: `${size()}px`, height: `${size()}px`, overflow: "visible" }}
      >
        <defs>
          <linearGradient id={gid} x1="231" y1="0" x2="231" y2="357" gradientUnits="userSpaceOnUse">
            <stop stop-color={colors()[0]} />
            <stop offset="1" stop-color={colors()[1]} />
          </linearGradient>
        </defs>
        <g
          class="mx-body"
          classList={{
            "mx-idle": st() === "idle",
            "mx-thinking": st() === "thinking",
            "mx-happy": st() === "happy",
            "mx-sleeping": st() === "sleeping",
          }}
          opacity={st() === "sleeping" ? 0.8 : 1}
        >
          <path
            d="M334 0C368.932 0 397.712 26.3406 401.562 60.2432C403.186 60.0823 404.833 60 406.5 60C433.838 60 456 82.1619 456 109.5C456 121.768 451.534 132.991 444.144 141.64C465.542 148.638 481 168.764 481 192.5C481 219.545 460.933 241.902 434.876 245.495C437.76 250.486 439.873 256.036 441.021 262.016C446.539 290.743 427.724 318.504 398.997 324.021C382.613 327.168 366.544 322.4 354.735 312.393C346.182 338.302 321.775 357 293 357C264.794 357 240.785 339.034 231.79 313.921C220.015 332.594 199.207 345 175.5 345C145.735 345 120.537 325.444 112.054 298.479C105.626 300.758 98.7083 302 91.5 302C57.5345 302 30 274.466 30 240.5C30 232.264 31.6185 224.406 34.5557 217.227C14.053 206.834 0 185.559 0 161C0 135.741 14.8655 113.953 36.3252 103.909C35.4574 99.7422 35 95.4245 35 91C35 56.2061 63.2061 28 98 28C98.6984 28 99.394 28.0116 100.087 28.0342C100.722 28.0112 101.36 28 102 28C115.382 28 127.582 33.0566 136.798 41.3613C139.213 43.2517 141.487 45.3145 143.601 47.5312C157.745 25.5548 182.423 11 210.5 11C235.27 11 257.393 22.3294 271.974 40.0879C282.626 16.4525 306.392 0 334 0Z"
            fill={`url(#${gid})`}
          />
          <Show
            when={st() === "sleeping" || st() === "happy"}
            fallback={
              <g class="mx-eyelid" style={{ transform: blink() ? "scaleY(0.08)" : "scaleY(1)" }}>
                {/* Pupil-less eyes: the whites themselves drift toward the
                    cursor and dart while thinking. */}
                <g
                  class="mx-pupils"
                  classList={{ "mx-dart": st() === "thinking" }}
                  style={{ transform: `translate(${px()}px, ${py()}px)` }}
                >
                  {/* Eyes are rounded rects, not circles: square proportions
                      read as circles, but a blink squashes them into a clean
                      horizontal line instead of a thinning oval. */}
                  <rect x="99" y="126" width="105" height="105" rx="52" fill="white" />
                  <rect x="275.3" y="126" width="105" height="105" rx="52" fill="white" />
                </g>
              </g>
            }
          >
            <Show
              when={st() === "happy"}
              fallback={
                <g stroke="#1a1410" stroke-width="14" stroke-linecap="round" opacity="0.55" fill="none">
                  <path d="M112 178 Q151 202 191 178" />
                  <path d="M288 178 Q328 202 368 178" />
                </g>
              }
            >
              <g stroke="#1a1410" stroke-width="14" stroke-linecap="round" opacity="0.7" fill="none">
                <path d="M112 186 Q151 150 191 186" />
                <path d="M288 186 Q328 150 368 186" />
              </g>
            </Show>
            <Show when={st() === "sleeping"}>
              <text x="392" y="120" font-size="64" font-weight="bold" fill={colors()[0]} class="mx-zzz">
                z
              </text>
              <text x="418" y="80" font-size="44" font-weight="bold" fill={colors()[0]} class="mx-zzz mx-zzz-late">
                z
              </text>
            </Show>
          </Show>
        </g>
      </svg>
    </div>
  );
}
