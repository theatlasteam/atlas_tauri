import type { JSX } from "solid-js";

export type ButtonVariant = "primary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  soft: "bg-accent-soft text-accent hover:opacity-80",
  ghost: "border border-border bg-surface text-ink hover:bg-bg",
  danger: "bg-red-600 text-white hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

/** The app's shared button — primary/soft/ghost/danger, sm/md. Use this
 *  instead of hand-rolling the same pill styles all over the app (and plugins
 *  can reach it via atlas/ui). */
export default function Button(props: {
  onClick?: (e: MouseEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  disabled?: boolean;
  ariaLabel?: string;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      class={`inline-flex shrink-0 items-center justify-center rounded-full font-medium transition active:scale-95 disabled:opacity-50 ${
        VARIANTS[props.variant ?? "primary"]
      } ${SIZES[props.size ?? "md"]}${props.class ? ` ${props.class}` : ""}`}
    >
      {props.children}
    </button>
  );
}
