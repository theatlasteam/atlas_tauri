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
  const dim = () => (props.size === "sm" ? "h-7 w-7" : "h-9 w-9");
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      class={cx(
        "grid shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-bg hover:text-ink disabled:opacity-50",
        dim(),
        props.class,
      )}
    >
      {props.children}
    </button>
  );
}
