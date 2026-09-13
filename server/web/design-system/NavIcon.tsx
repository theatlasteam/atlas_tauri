import { onCleanup } from "solid-js";

export type NavIconName = "chats" | "calls" | "profile" | "settings" | "compass";

const mounted = new Map<NavIconName, SVGSVGElement>();

function prep(el: Element, origin: string) {
  const node = el as HTMLElement & SVGElement;
  node.style.transformBox = "view-box";
  node.style.transformOrigin = origin;
}

function run(svg: SVGSVGElement, name: NavIconName) {
  const animate = (el: Element | null, keyframes: Keyframe[], duration: number, easing: string, delay = 0) => {
    if (!el) return;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(keyframes, { duration, easing, delay, fill: "none" });
  };

  if (name === "chats") {
    const a = svg.querySelector(".bubble-a");
    const b = svg.querySelector(".bubble-b");
    prep(a ?? svg, "104px 104px");
    prep(b ?? svg, "160px 152px");
    animate(a, [
      { transform: "translate(0,0) rotate(0deg)", offset: 0 },
      { transform: "translate(-6px,4px) rotate(-8deg)", offset: 0.2 },
      { transform: "translate(5px,-5px) rotate(6deg)", offset: 0.4 },
      { transform: "translate(-4px,3px) rotate(-4deg)", offset: 0.6 },
      { transform: "translate(3px,-2px) rotate(2deg)", offset: 0.8 },
      { transform: "translate(0,0) rotate(0deg)", offset: 1 },
    ], 1500, "ease");
    animate(b, [
      { transform: "translate(0,0) rotate(0deg)", offset: 0 },
      { transform: "translate(6px,-4px) rotate(8deg)", offset: 0.2 },
      { transform: "translate(-5px,5px) rotate(-6deg)", offset: 0.4 },
      { transform: "translate(4px,-3px) rotate(4deg)", offset: 0.6 },
      { transform: "translate(-3px,2px) rotate(-2deg)", offset: 0.8 },
      { transform: "translate(0,0) rotate(0deg)", offset: 1 },
    ], 1500, "ease", 150);
    return;
  }

  const glyph = svg.querySelector(".nav-glyph");
  prep(glyph ?? svg, "128px 128px");
  if (name === "calls") {
    animate(glyph, [
      { transform: "rotate(0deg)", offset: 0 },
      { transform: "rotate(-18deg)", offset: 0.15 },
      { transform: "rotate(14deg)", offset: 0.3 },
      { transform: "rotate(-10deg)", offset: 0.45 },
      { transform: "rotate(7deg)", offset: 0.6 },
      { transform: "rotate(-4deg)", offset: 0.75 },
      { transform: "rotate(2deg)", offset: 0.9 },
      { transform: "rotate(0deg)", offset: 1 },
    ], 1700, "ease");
    return;
  }
  if (name === "profile") {
    animate(glyph, [
      { transform: "translateY(0) scale(1)", offset: 0 },
      { transform: "translateY(8px) scale(0.94)", offset: 0.35 },
      { transform: "translateY(-10px) scale(1.04)", offset: 0.65 },
      { transform: "translateY(2px) scale(0.99)", offset: 0.85 },
      { transform: "translateY(0) scale(1)", offset: 1 },
    ], 1500, "cubic-bezier(0.34, 1.56, 0.64, 1)");
    return;
  }
  if (name === "compass") {
    animate(glyph, [
      { transform: "rotate(0deg) scale(1)", offset: 0 },
      { transform: "rotate(-12deg) scale(1.08)", offset: 0.35 },
      { transform: "rotate(8deg) scale(1.04)", offset: 0.65 },
      { transform: "rotate(0deg) scale(1)", offset: 1 },
    ], 900, "cubic-bezier(0.34, 1.3, 0.64, 1)");
    return;
  }
  animate(glyph, [
    { transform: "rotate(0deg)", offset: 0 },
    { transform: "rotate(200deg)", offset: 0.6 },
    { transform: "rotate(170deg)", offset: 0.8 },
    { transform: "rotate(180deg)", offset: 1 },
  ], 1700, "cubic-bezier(0.34, 1.3, 0.64, 1)");
}

export function playNavIcon(name: NavIconName) {
  const svg = mounted.get(name);
  if (svg) run(svg, name);
}

export default function NavIcon(props: { name: NavIconName; size?: number; class?: string }) {
  const size = () => props.size ?? 22;
  const stroke = () => props.name === "chats" || props.name === "compass";
  let svg: SVGSVGElement | undefined;
  onCleanup(() => {
    if (svg && mounted.get(props.name) === svg) mounted.delete(props.name);
  });
  return (
    <svg
      ref={(el) => {
        svg = el;
        if (el) mounted.set(props.name, el);
      }}
      viewBox="0 0 256 256"
      width={size()}
      height={size()}
      class={`nav-icon-svg ${stroke() ? "ph-stroke" : "ph"} ${props.class ?? ""}`}
      aria-hidden="true"
    >
      {paths(props.name)}
    </svg>
  );
}

function paths(name: NavIconName) {
  if (name === "chats") {
    return (
      <>
        <path class="bubble-b" d="M184,80 H200 A16,16 0 0 1 216,96 V208 L184,184 H104 A16,16 0 0 1 88,168 V152" />
        <path class="bubble-a" d="M40,160 V64 A16,16 0 0 1 56,48 H152 A16,16 0 0 1 168,64 V120 A16,16 0 0 1 152,136 H72 Z" />
      </>
    );
  }
  if (name === "calls") {
    return (
      <path class="nav-glyph" d="M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06l0-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46ZM176,208A128.14,128.14,0,0,1,48,80,40.2,40.2,0,0,1,82.87,40a.61.61,0,0,0,0,.12l21,47L83.2,111.86a6.13,6.13,0,0,0-.57.77,16,16,0,0,0-1,15.7c9.06,18.53,27.73,37.06,46.46,46.11a16,16,0,0,0,15.75-1.14,8.44,8.44,0,0,0,.74-.56L168.89,152l47,21.05h0s.08,0,.11,0A40.21,40.21,0,0,1,176,208Z" />
    );
  }
  if (name === "profile") {
    return (
      <path class="nav-glyph" d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z" />
    );
  }
  if (name === "compass") {
    return (
      <g class="nav-glyph" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="128" cy="128" r="96" />
        <path d="M128 48 L148 128 L128 208 L108 128 Z" fill="currentColor" stroke="none" />
      </g>
    );
  }
  return (
    <path class="nav-glyph" d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z" />
  );
}
