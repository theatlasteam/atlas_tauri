import type { JSX } from "solid-js";
import { cx } from "./lib/cx";

export type NavbarVariant = "pill" | "bar";

/** Top navigation. `pill` is the marketing floating capsule; `bar` is a full-width app chrome. */
export default function Navbar(props: {
  children: JSX.Element;
  class?: string;
  variant?: NavbarVariant;
  scrolled?: boolean;
}) {
  const variant = () => props.variant ?? "bar";

  if (variant() === "pill") {
    return (
      <header
        class={cx(
          "fixed inset-x-0 top-0 z-40 flex justify-center px-4",
          props.class,
        )}
        style={{ "padding-top": "max(var(--safe-top), 1rem)" }}
      >
        <nav
          class="flex items-center gap-1 rounded-full border px-2 py-1.5 text-sm transition-all duration-300"
          classList={{
            "border-white/10 bg-[#14110d]/70 shadow-lg shadow-black/20 backdrop-blur-md": props.scrolled,
            "border-white/8 bg-white/[0.03] backdrop-blur-sm": !props.scrolled,
          }}
        >
          {props.children}
        </nav>
      </header>
    );
  }

  return (
    <header
      class={cx(
        "sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-border bg-appbar/90 px-4 py-2 backdrop-blur-md",
        props.class,
      )}
      style={{ "padding-top": "max(var(--safe-top), 0.5rem)" }}
    >
      {props.children}
    </header>
  );
}

export function NavbarBrand(props: { href?: string; children: JSX.Element; class?: string }) {
  const className = () =>
    cx("flex items-center gap-2 rounded-full py-1 pl-2 pr-3 font-heading font-semibold", props.class);
  return props.href ? (
    <a href={props.href} class={className()}>
      {props.children}
    </a>
  ) : (
    <div class={className()}>{props.children}</div>
  );
}

export function NavbarLinks(props: { children: JSX.Element; class?: string }) {
  return <div class={cx("hidden items-center sm:flex", props.class)}>{props.children}</div>;
}

export function NavbarLink(props: { href: string; children: JSX.Element; class?: string }) {
  return (
    <a
      href={props.href}
      class={cx(
        "rounded-full px-3 py-1 text-ink-muted transition hover:text-ink",
        props.class,
      )}
    >
      {props.children}
    </a>
  );
}

export function NavbarActions(props: { children: JSX.Element; class?: string }) {
  return <div class={cx("ml-auto flex items-center gap-1", props.class)}>{props.children}</div>;
}
