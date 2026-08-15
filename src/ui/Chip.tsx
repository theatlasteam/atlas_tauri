import type { JSX } from "solid-js";

/** A rounded pill chip — used for badges, version tags, permission labels. */
export default function Chip(props: {
  children: JSX.Element;
  color?: "accent" | "muted" | "success";
  class?: string;
}) {
  const styles: Record<string, string> = {
    accent: "bg-accent-soft text-accent",
    muted: "bg-bg text-ink-subtle",
    success: "bg-emerald-500 text-white",
  };
  return (
    <span
      class={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles[props.color ?? "muted"]}${props.class ? ` ${props.class}` : ""}`}
    >
      {props.children}
    </span>
  );
}
