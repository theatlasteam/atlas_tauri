import type { JSX } from "solid-js";
import { Show } from "solid-js";

/** Generic empty/error placeholder — icon + title + optional subtitle + optional action. */
export default function EmptyState(props: {
  icon: (p: { size?: number; class?: string }) => JSX.Element;
  title: string;
  subtitle?: string;
  action?: JSX.Element;
}) {
  return (
    <div class="fade-in-up flex flex-col items-center justify-center gap-3 px-8 py-12 text-center">
      <div class="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
        <props.icon size={26} />
      </div>
      <div>
        <p class="font-medium text-ink">{props.title}</p>
        <Show when={props.subtitle}>
          <p class="mt-1 text-sm text-ink-subtle">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={props.action}>{props.action}</Show>
    </div>
  );
}
