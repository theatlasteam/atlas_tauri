import type { JSX } from "solid-js";
import { cx } from "./lib/cx";

export default function IconButton(props: {
  onClick?: (e: MouseEvent) => void;
  class?: string;
  disabled?: boolean;
  ariaLabel: string;
  children: JSX.Element;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      class={cx(
        "atlas-focus grid shrink-0 place-items-center rounded-full text-ink-muted hover:bg-bg hover:text-ink disabled:opacity-50",
        "min-h-11 min-w-11",
        props.size === "sm" && "max-md:min-h-11 max-md:min-w-11 md:min-h-9 md:min-w-9",
        props.class,
      )}
    >
      {props.children}
    </button>
  );
}
