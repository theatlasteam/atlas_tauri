import { For, type JSX } from "solid-js";
import { cx } from "./lib/cx";

export type TabItem = { id: string; label: string };

export default function Tabs(props: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  class?: string;
}) {
  return (
    <div
      role="tablist"
      class={cx("inline-flex gap-1 rounded-full border border-border bg-surface p-1", props.class)}
    >
      <For each={props.items}>
        {(item) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.value === item.id}
            onClick={() => props.onChange(item.id)}
            class={cx(
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              props.value === item.id ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function TabPanel(props: { children: JSX.Element; class?: string }) {
  return <div class={props.class}>{props.children}</div>;
}
