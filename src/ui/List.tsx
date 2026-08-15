import type { JSX } from "solid-js";
import { For, Show } from "solid-js";

/** A row in a List: leading tile, title/description, optional trailing
 *  content (a Button, a Switch, a Chip, …). */
export function ListItem(props: {
  title: string;
  description?: string;
  leading?: JSX.Element;
  trailing?: JSX.Element;
  onClick?: () => void;
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

  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-bg active:bg-bg">
        {content}
      </button>
    );
  }
  return <div class="flex items-center gap-3 px-4 py-3">{content}</div>;
}

/** A grouped list container: a rounded card with dividers between rows. */
export default function List(props: { children: JSX.Element }) {
  return <div class="divide-y divide-border rounded-2xl border border-border bg-surface">{props.children}</div>;
}

export function ListItems(props: { items: { title: string; description?: string; leading?: JSX.Element; trailing?: JSX.Element; onClick?: () => void }[] }) {
  return (
    <List>
      <For each={props.items}>{(item) => <ListItem {...item} />}</For>
    </List>
  );
}
