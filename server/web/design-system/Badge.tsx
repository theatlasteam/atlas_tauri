import type { JSX } from "solid-js";
import { cx } from "./lib/cx";

export type BadgeColor = "accent" | "muted" | "success" | "danger";

const STYLES: Record<BadgeColor, string> = {
  accent: "bg-accent-soft text-accent",
  muted: "bg-bg text-ink-subtle",
  success: "bg-emerald-500 text-white",
  danger: "bg-red-600/10 text-red-700 dark:text-red-300",
};

/** Pill badge / chip for tags, versions, permission labels. */
export default function Badge(props: {
  children: JSX.Element;
  color?: BadgeColor;
  class?: string;
}) {
  return (
    <span
      class={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        STYLES[props.color ?? "muted"],
        props.class,
      )}
    >
      {props.children}
    </span>
  );
}
