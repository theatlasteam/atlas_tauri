import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { cx } from "./lib/cx";

const MASK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 306 218'%3E%3Cpath fill='black' d='M270.213.029C270.667.012 271.123 0 271.581 0 290.59 0 306 15.41 306 34.419c0 14.622-9.119 27.113-21.979 32.1l-12.449 6.525c20.791 14.266 34.429 38.2 34.429 65.319 0 43.03-34.332 78.041-77.099 79.136v.027H45.795l-.01-.031c-.453.018-.909.03-1.366.03C25.41 217.525 10 202.116 10 183.107c0-14.619 9.115-27.108 21.972-32.097l12.455-6.531C23.637 130.213 10 106.281 10 79.163 10 36.133 44.332 1.121 87.098.025V0h183.107l.008.029Z'/%3E%3C/svg%3E\") center / contain no-repeat";

export default function Logo(props: {
  class?: string;
  /** Skip the feather reveal (nav, favicon-scale). */
  static?: boolean;
  width?: number;
  label?: string;
}) {
  let host: HTMLDivElement | undefined;
  const [tick, setTick] = createSignal(0);

  const play = () => {
    if (props.static || !host) return;
    const layer = document.createElement("div");
    layer.className = "atlas-logo-fill-enter";
    layer.style.cssText = `position:absolute;inset:-1px;background:linear-gradient(180deg,var(--color-logo-top),var(--color-logo-bottom))`;
    host.appendChild(layer);
    const done = () => {
      [...host!.children].filter((n) => n !== layer).forEach((n) => n.remove());
      layer.classList.remove("atlas-logo-fill-enter");
    };
    layer.addEventListener("animationend", done, { once: true });
  };

  createEffect(
    on(
      () => tick(),
      () => play(),
    ),
  );

  onMount(() => {
    const mo = new MutationObserver(() => setTick((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent", "style"] });
    onCleanup(() => mo.disconnect());
    play();
  });

  return (
    <div
      ref={host}
      role="img"
      aria-label={props.label ?? "Atlas"}
      class={cx("relative overflow-hidden", props.class)}
      style={{
        width: `${props.width ?? 120}px`,
        "aspect-ratio": "306 / 218",
        "-webkit-mask": MASK,
        mask: MASK,
      }}
    >
      <div
        class="absolute inset-[-1px]"
        style={{ background: "linear-gradient(180deg, var(--color-logo-top), var(--color-logo-bottom))" }}
      />
    </div>
  );
}
