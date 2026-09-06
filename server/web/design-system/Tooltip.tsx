import type { JSX } from "solid-js";
import { cx } from "./lib/cx";

export default function Tooltip(props: { label: string; children: JSX.Element; class?: string }) {
  return (
    <span class={cx("group relative inline-flex", props.class)}>
      {props.children}
      <span class="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-medium text-bg opacity-0 shadow-floating transition group-hover:opacity-100 group-focus-within:opacity-100">
        {props.label}
      </span>
    </span>
  );
}
