import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { cx } from "./lib/cx";
import Avatar from "./Avatar";

export type MessageBubbleSide = "sent" | "received";
export type MessageStatus = "sending" | "sent" | "read";

export function MessageSurface(props: { side?: MessageBubbleSide } & JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["side", "class", "children"]);
  return <div {...rest} class={cx(
    "whitespace-pre-wrap break-words px-3.5 py-2 text-left text-sm leading-relaxed",
    local.side === "sent" ? "rounded-[18px] rounded-br-[4px] bg-bubble-sent text-bubble-sent-ink" : "rounded-[18px] rounded-bl-[4px] bg-bubble-received text-bubble-received-ink",
    local.class,
  )}>{local.children}</div>;
}

/** User-to-user chat bubble. */
export default function MessageBubble(props: {
  side?: MessageBubbleSide;
  children: JSX.Element;
  name?: string;
  avatar?: string;
  time?: string;
  status?: MessageStatus;
  class?: string;
}) {
  const sent = () => (props.side ?? "received") === "sent";

  return (
    <div
      class={cx(
        "flex w-fit max-w-[min(85%,22rem)] items-end gap-2",
        sent() ? "ml-auto flex-row-reverse" : "mr-auto",
        props.class,
      )}
    >
      <Show when={!sent() && (props.name || props.avatar)}>
        <Avatar name={props.name ?? "?"} src={props.avatar} size={28} />
      </Show>
      <div class={cx("min-w-0", sent() && "text-right")}>
        <Show when={!sent() && props.name}>
          <p class="mb-0.5 px-1 text-left text-[11px] font-medium text-ink-subtle">{props.name}</p>
        </Show>
        <MessageSurface side={sent() ? "sent" : "received"}>{props.children}</MessageSurface>
        <Show when={props.time || (sent() && props.status)}>
          <p class={cx("mt-0.5 flex items-center gap-1 px-1 text-[10px] text-ink-subtle", sent() && "justify-end")}>
            {props.time}
            <Show when={sent() && props.status}>
              <span class="tabular-nums">
                {props.status === "sending" ? "…" : props.status === "read" ? "✓✓" : "✓"}
              </span>
            </Show>
          </p>
        </Show>
      </div>
    </div>
  );
}
