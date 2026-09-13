import type { JSX } from "solid-js";
import { For } from "solid-js";
import { cx } from "./lib/cx";

export type BottomNavItem = {
  id: string;
  label: string;
  icon: JSX.Element;
  href?: string;
  active?: boolean;
  onClick?: () => void;
};

export default function BottomNav(props: { items: BottomNavItem[]; class?: string }) {
  return (
    <nav
      class={cx(
        "flex shrink-0 items-stretch justify-around border-t border-border bg-surface/90 px-2 pt-1 backdrop-blur-md",
        props.class,
      )}
      style={{ "padding-bottom": "max(var(--safe-bottom), 0.35rem)" }}
    >
      <For each={props.items}>
        {(item) => {
          const cls = () =>
            cx(
              "atlas-focus flex min-h-11 min-w-[4.5rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[13px] font-medium",
              item.active ? "text-accent" : "text-ink-subtle hover:text-ink",
            );
          const body = (
            <>
              <span class="grid h-7 w-7 place-items-center overflow-visible">{item.icon}</span>
              {item.label}
            </>
          );
          return item.href ? (
            <a href={item.href} class={cls()} onClick={item.onClick}>
              {body}
            </a>
          ) : (
            <button type="button" class={cls()} onClick={item.onClick}>
              {body}
            </button>
          );
        }}
      </For>
    </nav>
  );
}
