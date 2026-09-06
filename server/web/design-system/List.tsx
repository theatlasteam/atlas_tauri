import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { cx } from "./lib/cx";

export function ListItem(props: {
  title: string;
  description?: string;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  onClick?: () => void;
  class?: string;
}) {
  const content = (
    <>
      <Show when={props.leading}>
        <span class="shrink-0">{props.leading}</span>
      </Show>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-ink">{props.title}</p>
        <Show when={props.description}>
          <p class="truncate text-xs text-ink-subtle">{props.description}</p>
        </Show>
      </div>
      <Show when={props.trailing}>
        <span class="shrink-0">{props.trailing}</span>
      </Show>
    </>
  );

  const cls = cx("flex w-full items-center gap-3 px-4 py-3 text-left", props.class);
  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} class={cx(cls, "transition-colors hover:bg-bg")}>
        {content}
      </button>
    );
  }
  return <div class={cls}>{content}</div>;
}

export default function List(props: { children: JSX.Element; class?: string }) {
  return (
    <div class={cx("divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface", props.class)}>
      {props.children}
    </div>
  );
}

export function ListItems(props: {
  items: Array<{
    title: string;
    description?: string;
    leading?: JSX.Element;
    trailing?: JSX.Element;
    onClick?: () => void;
  }>;
}) {
  return (
    <List>
      <For each={props.items}>{(item) => <ListItem {...item} />}</For>
    </List>
  );
}
