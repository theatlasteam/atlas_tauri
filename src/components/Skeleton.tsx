import { For } from "solid-js";

/** A single pulsing placeholder block. Compose with layout classes via `class`. */
export function Skeleton(props: { class?: string }) {
  return <div class={`animate-pulse rounded-lg bg-border/70 ${props.class ?? ""}`} />;
}

/** Placeholder rows shaped like ChatList entries. */
export function ChatListSkeleton(props: { count?: number }) {
  return (
    <div class="flex flex-col gap-1 px-3">
      <For each={Array.from({ length: props.count ?? 6 })}>
        {() => (
          <div class="flex items-center gap-3 px-3 py-3">
            <Skeleton class="h-12 w-12 shrink-0 rounded-full" />
            <div class="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton class="h-3.5 w-1/3" />
              <Skeleton class="h-3 w-2/3" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

/** Placeholder bubbles shaped like ChatView messages. */
export function MessageListSkeleton() {
  const widths = ["w-40", "w-56", "w-32", "w-48", "w-28"];
  return (
    <div class="flex flex-col gap-2 px-4 pt-2">
      <For each={widths}>
        {(w, i) => (
          <div class="flex" classList={{ "justify-end": i() % 2 === 0, "justify-start": i() % 2 !== 0 }}>
            <Skeleton class={`h-10 ${w} rounded-2xl`} />
          </div>
        )}
      </For>
    </div>
  );
}
