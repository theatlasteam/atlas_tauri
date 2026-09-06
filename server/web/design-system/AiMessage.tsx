import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cx } from "./lib/cx";
import type { GridLoaderPattern } from "./GridLoader";
import ThinkingStatus from "./ThinkingStatus";

/** Assistant turn: thinking row, then the reply body. Not a chat bubble. */
export default function AiMessage(props: {
  children?: JSX.Element;
  name?: string;
  thinking?: boolean;
  thinkingLabel?: string;
  loaderPattern?: GridLoaderPattern;
  class?: string;
}) {
  return (
    <div class={cx("flex max-w-[min(100%,40rem)] flex-col gap-1.5", props.class)}>
      <p class="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">{props.name ?? "Atlas"}</p>
      <Show when={props.thinking}>
        <ThinkingStatus label={props.thinkingLabel} pattern={props.loaderPattern} />
      </Show>
      <Show when={!props.thinking && props.children}>
        <div class="text-sm leading-relaxed text-ink">{props.children}</div>
      </Show>
    </div>
  );
}
