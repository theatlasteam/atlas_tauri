import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cx } from "./lib/cx";

export type ButtonVariant = "primary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  soft: "bg-accent-soft text-accent hover:opacity-80",
  ghost: "border border-border bg-surface text-ink hover:bg-bg",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-base gap-2",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center rounded-full font-medium transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  disabled?: boolean;
  ariaLabel?: string;
  children: JSX.Element;
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: (e: MouseEvent) => void;
} & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class" | "children" | "onClick" | "type">;

export default function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "class",
    "disabled",
    "ariaLabel",
    "children",
    "href",
    "type",
    "onClick",
  ]);
  const className = () =>
    cx(BASE, VARIANTS[local.variant ?? "primary"], SIZES[local.size ?? "md"], local.class);

  if (local.href) {
    return (
      <a
        href={local.href}
        aria-label={local.ariaLabel}
        class={className()}
        onClick={local.onClick as unknown as JSX.EventHandler<HTMLAnchorElement, MouseEvent>}
      >
        {local.children}
      </a>
    );
  }

  return (
    <button
      type={local.type ?? "button"}
      onClick={local.onClick}
      disabled={local.disabled}
      aria-label={local.ariaLabel}
      class={className()}
      {...rest}
    >
      {local.children}
    </button>
  );
}
