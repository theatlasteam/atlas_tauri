import { createSignal, onCleanup, onMount } from "solid-js";
import { cx } from "./lib/cx";

/** Perimeter of a 3×3, clockwise from top-left. Center is index 4. */
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

export type GridLoaderPattern = "hollow" | "random";
export type GridLoaderSize = "sm" | "md" | "lg";

const SIZES: Record<GridLoaderSize, { gap: string; cell: string; round: string }> = {
  sm: { gap: "gap-0.5", cell: "h-1.5 w-1.5", round: "rounded-[2px]" },
  md: { gap: "gap-[3px]", cell: "h-2 w-2", round: "rounded-[3px]" },
  lg: { gap: "gap-1", cell: "h-2.5 w-2.5", round: "rounded-sm" },
};

export default function GridLoader(props: {
  pattern?: GridLoaderPattern;
  size?: GridLoaderSize;
  class?: string;
  /** Hollow chase interval / random reshuffle, ms. */
  interval?: number;
}) {
  const pattern = () => props.pattern ?? "hollow";
  const size = () => SIZES[props.size ?? "md"];
  const [lit, setLit] = createSignal<Set<number>>(new Set([0, 1]));

  onMount(() => {
    let step = 0;
    const tick = () => {
      if (pattern() === "hollow") {
        const a = RING[step % RING.length];
        const b = RING[(step + 1) % RING.length];
        const c = RING[(step + 2) % RING.length];
        setLit(new Set([a, b, c]));
        step += 1;
      } else {
        const next = new Set<number>();
        const count = 2 + Math.floor(Math.random() * 3);
        while (next.size < count) next.add(Math.floor(Math.random() * 9));
        setLit(next);
      }
    };
    tick();
    const id = window.setInterval(tick, props.interval ?? (pattern() === "hollow" ? 110 : 160));
    onCleanup(() => window.clearInterval(id));
  });

  return (
    <div
      class={cx("grid grid-cols-3", size().gap, props.class)}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span
          class={cx(
            size().cell,
            size().round,
            "transition-colors duration-150",
            lit().has(i) ? "bg-accent" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}
