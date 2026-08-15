import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

/** Hue stops that paint the color slider's track. */
const HUE_STOPS: Array<[number, string]> = [
  [0, "#ff0000"],
  [0.16, "#ff7f00"],
  [0.33, "#ffff00"],
  [0.5, "#00ff00"],
  [0.66, "#0080ff"],
  [0.83, "#7f00ff"],
  [1, "#ff00ff"],
];

interface SliderProps {
  /** 0..1 — the current position. */
  value: number;
  onChange: (value: number) => void;
  /** "color": hue-gradient track (the gradient is the fill).
   *  "accent" (default): a neutral track with the portion before the thumb
   *  filled with the app accent. */
  variant?: "color" | "accent";
  /** Height of the slider container in px (default 40). */
  height?: number;
}

/**
 * A generic slider: thick rounded track, a near-full-height thumb with a
 * translucent gray backdrop, and (in `accent` mode) the portion behind the
 * thumb filled with the accent color. In `color` mode the track is a hue
 * gradient and the thumb's backdrop tint is white.
 */
export default function Slider(props: SliderProps) {
  const [width, setWidth] = createSignal(0);
  const [dragging, setDragging] = createSignal(false);

  let rootRef: HTMLDivElement | undefined;

  const HEIGHT = props.height ?? 56;
  const TRACK_HEIGHT = 30; // the slider is the tall one — a thick pill
  const TRACK_Y = (HEIGHT - TRACK_HEIGHT) / 2;
  // The thumb is thin AND shorter than the slider itself: it sits on the
  // thick track like a cursor, not as a pill taller than the control.
  const THUMB_H = 46;
  const THUMB_W = 8; // thin
  const THUMB_BEND = 0; // flush with the track surface

  // One shared inset drives both the track's horizontal ends and the thumb's
  // 0-state position, so at value 0 the thumb's left padding equals its top
  // padding (the thumb is vertically centered, top pad = (H - thumbH)/2).
  const PAD = (HEIGHT - THUMB_H) / 2;

  // The thumb's center travels from PAD+halfThumb (left edge at PAD) to
  // width-PAD-halfThumb (right edge at width-PAD).
  const thumbX = () =>
    PAD + THUMB_W / 2 + props.value * (width() - PAD * 2 - THUMB_W);

  const measure = () => {
    if (rootRef) setWidth(rootRef.clientWidth);
  };

  onMount(() => {
    measure();
    window.addEventListener("resize", measure);
    onCleanup(() => window.removeEventListener("resize", measure));
  });

  createEffect(() => measure());

  const setFromClientX = (clientX: number) => {
    if (!rootRef) return;
    const rect = rootRef.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    props.onChange(x);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!rootRef) return;
    rootRef.setPointerCapture(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (dragging()) setFromClientX(e.clientX);
  };
  const endDrag = (e: PointerEvent) => {
    if (!dragging()) return;
    setDragging(false);
    if (rootRef) rootRef.releasePointerCapture(e.pointerId);
  };

  const isColor = () => props.variant === "color";

  return (
    <div
      ref={rootRef}
      style={{ height: `${HEIGHT}px`, cursor: "grab", "touch-action": "none" }}
      class="relative w-full select-none outline-none"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(props.value * 100)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Track */}
      <div
        class="absolute overflow-hidden"
        style={{
          top: `${TRACK_Y}px`,
          left: `${PAD}px`,
          right: `${PAD}px`,
          height: `${TRACK_HEIGHT}px`,
          "border-radius": "6px",
          background: isColor()
            ? "transparent"
            : "var(--color-border, rgba(0,0,0,0.15))",
        }}
      >
        <div
          class="absolute inset-0"
          style={{
            background: isColor()
              ? `linear-gradient(to right, ${HUE_STOPS.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(", ")})`
              : "transparent",
          }}
        />
        {/* Value fill: the portion before the thumb (accent mode only). */}
        <Show when={!isColor()}>
          <div
            class="absolute inset-y-0 left-0"
            style={{
              width: `${width() > PAD * 2 ? ((thumbX() - PAD - THUMB_W / 2) / (width() - PAD * 2)) * 100 : 0}%`,
              background: "var(--color-accent)",
              "border-radius": "inherit",
            }}
          />
        </Show>
      </div>

      {/* Thumb: thin, shorter than the slider, with a translucent gray backdrop.
          It slims down while dragging (active). */}
      <Show when={width() > 0}>
        <div
          class="absolute"
          style={{
            left: `${thumbX() - (dragging() ? 5 : THUMB_W) / 2}px`,
            top: `${PAD}px`,
            width: `${dragging() ? 5 : THUMB_W}px`,
            height: `${THUMB_H}px`,
            "border-radius": `${THUMB_W}px`,
            background: isColor() ? "#ffffff" : "var(--color-surface-raised, #fff)",
            // A thin dark outline keeps the thumb readable over bright hues
            // (yellow/cyan) plus a translucent gray backdrop + drop shadow.
            border: "1px solid rgba(0,0,0,0.55)",
            "box-shadow": `0 0 0 5px rgba(128,128,128,0.16), 0 1px 3px rgba(0,0,0,0.3)`,
            transform: `translateY(${THUMB_BEND}px)`,
            transition: dragging() ? "none" : "left 0.12s ease, width 0.12s ease, box-shadow 0.15s ease",
          }}
        />
      </Show>
    </div>
  );
}
