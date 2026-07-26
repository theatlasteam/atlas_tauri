import { onCleanup, onMount, type JSX } from "solid-js";

/** Fades + lifts children in once they scroll into view. Cheap, one-shot
 * (unobserves after first reveal), respects prefers-reduced-motion. */
export default function Reveal(props: { children: JSX.Element; delay?: number; class?: string }) {
  let el: HTMLDivElement | undefined;

  onMount(() => {
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.opacity = "1";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("reveal-in");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div ref={el} class={`reveal${props.class ? ` ${props.class}` : ""}`} style={{ "transition-delay": `${props.delay ?? 0}ms` }}>
      {props.children}
    </div>
  );
}
