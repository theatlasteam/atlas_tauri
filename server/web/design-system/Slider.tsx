import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { cx } from "./lib/cx";

const THUMB_W = 38;
const PAD = 2;
const FILL_PAST = 3;

export default function Slider(props: {
  value: number;
  variant?: "accent" | "color";
  height?: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  class?: string;
  disabled?: boolean;
}) {
  const min = () => props.min ?? 0;
  const max = () => props.max ?? 1;
  const span = () => max() - min();
  const step = () => props.step ?? span() / 100;
  const pct = () => {
    if (span() <= 0) return 0;
    return Math.max(0, Math.min(1, (props.value - min()) / span()));
  };

  const [dragging, setDragging] = createSignal(false);
  const [width, setWidth] = createSignal(0);
  let track: HTMLDivElement | undefined;

  const travel = () => Math.max(0, width() - PAD * 2 - THUMB_W);
  const thumbLeft = () => PAD + pct() * travel();
  const fillWidth = () => thumbLeft() + THUMB_W + FILL_PAST;

  function clamp(raw: number) {
    return Math.min(max(), Math.max(min(), raw));
  }
  function snap(raw: number) {
    const s = step();
    if (!(s > 0)) return clamp(raw);
    return clamp(Math.round((raw - min()) / s) * s + min());
  }

  function fromClientX(clientX: number, commit: boolean) {
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const t = travel();
    const x = clientX - rect.left - PAD - THUMB_W / 2;
    const unit = t <= 0 ? 0 : Math.max(0, Math.min(1, x / t));
    props.onChange(commit ? snap(min() + unit * span()) : clamp(min() + unit * span()));
  }

  function measure() {
    if (track) setWidth(track.clientWidth);
  }

  function onPointerDown(e: PointerEvent) {
    if (props.disabled) return;
    e.preventDefault();
    measure();
    setDragging(true);
    fromClientX(e.clientX, false);

    const move = (ev: PointerEvent) => fromClientX(ev.clientX, false);
    const up = (ev: PointerEvent) => {
      fromClientX(ev.clientX, true);
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  onMount(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (track) ro.observe(track);
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement !== track || props.disabled) return;
      const s = step();
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        props.onChange(snap(props.value + s));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        props.onChange(snap(props.value - s));
      } else if (e.key === "Home") {
        e.preventDefault();
        props.onChange(min());
      } else if (e.key === "End") {
        e.preventDefault();
        props.onChange(max());
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      ro.disconnect();
      document.removeEventListener("keydown", onKey);
    });
  });

  const motion = () => (dragging() ? "none" : "width 160ms ease, left 160ms ease");

  return (
    <div class={cx("flex flex-col gap-2", props.class, props.disabled && "opacity-50")}>
      <Show when={props.label}>
        <div class="flex justify-between text-sm font-medium text-ink">
          <span>{props.label}</span>
          <span class="tabular-nums text-ink-muted">{Math.round(pct() * 100)}%</span>
        </div>
      </Show>
      <div
        ref={(el) => {
          track = el;
          if (el) setWidth(el.clientWidth);
        }}
        role="slider"
        tabIndex={props.disabled ? -1 : 0}
        aria-valuemin={min()}
        aria-valuemax={max()}
        aria-valuenow={props.value}
        aria-label={props.label}
        aria-disabled={props.disabled}
        class="relative flex h-[44px] w-full cursor-grab touch-none select-none items-center outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ height: `${props.height ?? 44}px` }}
        onPointerDown={onPointerDown}
      >
        <div class="relative h-[28px] w-full overflow-hidden rounded-full bg-border" style={{ background: props.variant === "color" ? "linear-gradient(to right, #ff0000 0%, #ff7f00 16%, #ffff00 33%, #00ff00 50%, #0080ff 66%, #7f00ff 83%, #ff00ff 100%)" : undefined }}>
          <div
            class="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{
              width: `${fillWidth()}px`,
              display: props.variant === "color" ? "none" : undefined,
              transition: motion(),
            }}
          />
          <div
            class={cx(
              "pointer-events-none absolute top-[2px] h-[24px] w-[38px] rounded-full bg-ink shadow-sm",
              dragging() && "brightness-110",
            )}
            style={{
              left: `${thumbLeft()}px`,
              transition: motion(),
            }}
          />
        </div>
      </div>
    </div>
  );
}
