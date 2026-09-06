import { For } from "solid-js";
import { cx } from "./lib/cx";

export type Crumb = { href?: string; label: string };

export default function Breadcrumbs(props: { items: Crumb[]; class?: string }) {
  return (
    <nav class={cx("flex flex-wrap items-center gap-1.5 text-sm text-ink-muted", props.class)} aria-label="Breadcrumb">
      <For each={props.items}>
        {(item, i) => (
          <>
            {i() > 0 && <span class="text-ink-subtle">/</span>}
            {item.href ? (
              <a href={item.href} class="hover:text-ink">
                {item.label}
              </a>
            ) : (
              <span class="font-medium text-ink">{item.label}</span>
            )}
          </>
        )}
      </For>
    </nav>
  );
}
