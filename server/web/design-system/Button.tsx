import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { cx } from "./lib/cx";

export type ButtonVariant = "primary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm gap-1.5",
  md: "min-h-11 px-4 text-[15px] gap-2",
  lg: "min-h-[52px] px-5 text-base gap-2",
};

const BASE =
  "atlas-focus inline-flex shrink-0 items-center justify-center rounded-full font-medium disabled:opacity-50 disabled:pointer-events-none";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: JSX.Element;
  rightIcon?: JSX.Element;
  ariaLabel?: string;
  children: JSX.Element;
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: (e: MouseEvent) => void;
} & Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class" | "children" | "onClick" | "type">;

function variantStyle(v: ButtonVariant): { class: string; style?: JSX.CSSProperties } {
  switch (v) {
    case "soft":
      return {
        class: "bg-accent-soft text-accent hover:opacity-90",
        style: { background: "var(--color-accent-soft)", color: "var(--color-accent)" },
      };
    case "ghost":
      return {
        class: "border border-border bg-surface text-ink hover:bg-bg",
        style: { background: "var(--color-surface)", color: "var(--color-ink)" },
      };
    case "danger":
      return {
        class: "text-white hover:opacity-90",
        style: { background: "var(--color-danger)", color: "#fff" },
      };
    default:
      return {
        class: "text-accent-ink hover:opacity-90",
        style: { background: "var(--color-accent)", color: "var(--color-accent-ink)" },
      };
  }
}

export default function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "class",
    "disabled",
    "loading",
    "leftIcon",
    "rightIcon",
    "ariaLabel",
    "children",
    "href",
    "type",
    "onClick",
  ]);
  const look = () => variantStyle(local.variant ?? "primary");
  const className = () =>
    cx(BASE, look().class, SIZES[local.size ?? "md"], "active:scale-[0.98]", local.class);
  const inner = (
    <>
      <Show when={local.loading}>
        <span
          class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      </Show>
      {local.leftIcon}
      {local.children}
      {local.rightIcon}
    </>
  );

  if (local.href) {
    return (
      <a
        href={local.href}
        aria-label={local.ariaLabel}
        aria-busy={local.loading || undefined}
        class={className()}
        style={look().style}
        onClick={local.onClick as unknown as JSX.EventHandler<HTMLAnchorElement, MouseEvent>}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type={local.type ?? "button"}
      onClick={local.onClick}
      disabled={local.disabled || local.loading}
      aria-label={local.ariaLabel}
      aria-busy={local.loading || undefined}
      class={className()}
      style={look().style}
      {...rest}
    >
      {inner}
    </button>
  );
}
