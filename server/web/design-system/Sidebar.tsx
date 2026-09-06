import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { cx } from "./lib/cx";

export type SidebarItem = {
  id: string;
  href?: string;
  label: string;
  icon?: JSX.Element;
  active?: boolean;
  onClick?: () => void;
};

export type SidebarGroup = {
  label?: string;
  items: SidebarItem[];
};

/** Icon rail (`rail`) or labeled column (`expanded`). Sticks to the viewport when used in AppShell. */
export default function Sidebar(props: {
  items?: SidebarItem[];
  groups?: SidebarGroup[];
  variant?: "rail" | "expanded";
  header?: JSX.Element;
  footer?: JSX.Element;
  class?: string;
}) {
  const rail = () => (props.variant ?? "rail") === "rail";
  const groups = () =>
    props.groups ?? (props.items ? [{ items: props.items }] : []);

  return (
    <nav
      class={cx(
        "sticky top-0 flex h-full min-h-0 shrink-0 flex-col border-r border-border bg-surface",
        rail() ? "w-16 items-center py-3" : "w-60 py-3",
        props.class,
      )}
    >
      <Show when={props.header}>
        <div class={cx("mb-2 shrink-0", rail() ? "px-2" : "px-3")}>{props.header}</div>
      </Show>
      <div class={cx("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", rail() ? "items-center px-2" : "px-2.5")}>
        <For each={groups()}>
          {(group) => (
            <div class={cx("flex flex-col gap-0.5", rail() && "items-center")}>
              <Show when={group.label && !rail()}>
                <p class="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {group.label}
                </p>
              </Show>
              <For each={group.items}>
                {(item) => {
                  const className = () =>
                    cx(
                      "flex items-center rounded-xl transition-colors duration-150 ease-out",
                      rail() ? "h-11 w-11 justify-center" : "gap-3 px-2.5 py-2 text-sm font-medium",
                      item.active
                        ? "bg-accent text-accent-ink"
                        : "text-ink-muted hover:bg-accent-soft hover:text-ink",
                    );
                  const body = (
                    <>
                      <span class="shrink-0">{item.icon}</span>
                      <Show when={!rail()}>
                        <span class="truncate">{item.label}</span>
                      </Show>
                    </>
                  );
                  return item.href ? (
                    <a href={item.href} title={item.label} class={className()} onClick={item.onClick}>
                      {body}
                    </a>
                  ) : (
                    <button type="button" title={item.label} class={className()} onClick={item.onClick}>
                      {body}
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </div>
      <Show when={props.footer}>
        <div class={cx("mt-2 shrink-0 border-t border-border pt-2", rail() ? "px-2" : "px-3")}>
          {props.footer}
        </div>
      </Show>
    </nav>
  );
}

/** Full-viewport chrome: sticky sidebar + optional top bar, scrolling main pane. */
export function AppShell(props: {
  sidebar?: JSX.Element;
  top?: JSX.Element;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <div class={cx("flex h-dvh min-h-0 overflow-hidden bg-bg text-ink", props.class)}>
      {props.sidebar}
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <Show when={props.top}>{props.top}</Show>
        <main class="min-h-0 flex-1 overflow-y-auto">{props.children}</main>
      </div>
    </div>
  );
}
