import type { JSX } from "solid-js";
import { cx } from "./lib/cx";

export default function Kbd(props: { children: JSX.Element; class?: string }) {
  return (
    <kbd
      class={cx(
        "inline-flex min-w-[1.4em] items-center justify-center rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-muted shadow-[0_1px_0_var(--color-border)]",
        props.class,
      )}
    >
      {props.children}
    </kbd>
  );
}
