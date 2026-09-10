import type { JSX } from "solid-js";
import { For, Show, splitProps } from "solid-js";
import { cx } from "./lib/cx";
import Avatar from "./Avatar";
import Twemoji from "./Twemoji";

export type MessageBubbleSide = "sent" | "received";
export type MessageStatus = "sending" | "sent" | "read";

/** Inline keyboard under a bubble (Telegram-style grid). */
export type MessageButton = {
  label: string;
  url?: string;
  data?: string;
  icon?: string;
  row?: number;
  onClick?: (e: MouseEvent) => void;
};

function keyboardRows(buttons: MessageButton[]): MessageButton[][] {
  if (buttons.length === 0) return [];
  const hasRow = buttons.some((b) => b.row != null && b.row > 0);
  if (!hasRow) {
    const cols = buttons.length <= 3 ? buttons.length : 2;
    const rows: MessageButton[][] = [];
    for (let i = 0; i < buttons.length; i += cols) rows.push(buttons.slice(i, i + cols));
    return rows;
  }
  const map = new Map<number, MessageButton[]>();
  for (const b of buttons) {
    const r = b.row ?? 0;
    const list = map.get(r) ?? [];
    list.push(b);
    map.set(r, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

/** Channel comments row. Off unless passed — DMs stay a tight text chip. */
export type MessageComments = {
  count?: number;
  onClick?: (e: MouseEvent) => void;
  leading?: JSX.Element;
  emptyLabel?: string;
  countLabel?: string;
};

function ChatMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0 opacity-70" aria-hidden="true">
      <path
        d="M4.5 18.5V7.8A2.8 2.8 0 0 1 7.3 5h9.4A2.8 2.8 0 0 1 19.5 7.8v6.1a2.8 2.8 0 0 1-2.8 2.8H9.2L4.5 18.5Z"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function commentsOf(c: MessageComments | boolean | undefined): MessageComments | undefined {
  if (!c) return undefined;
  if (c === true) return { count: 0 };
  return c;
}

export function MessageSurface(
  props: {
    side?: MessageBubbleSide;
    comments?: MessageComments | boolean;
    keyboard?: MessageButton[];
  } & JSX.HTMLAttributes<HTMLDivElement>,
) {
  const [local, rest] = splitProps(props, ["side", "class", "children", "comments", "keyboard"]);
  const comments = () => commentsOf(local.comments);
  const rows = () => keyboardRows(local.keyboard ?? []);
  const sent = () => local.side === "sent";
  return (
    <div
      {...rest}
      class={cx(
        "inline-block max-w-full overflow-hidden text-left text-[15px] leading-snug",
        sent()
          ? "rounded-[16px] rounded-br-[5px] bg-bubble-sent text-bubble-sent-ink"
          : "rounded-[16px] rounded-bl-[5px] bg-bubble-received text-bubble-received-ink",
        local.class,
      )}
    >
      <div class="whitespace-pre-wrap break-words px-3 py-1.5">{local.children}</div>
      <Show when={rows().length > 0}>
        <div class="flex flex-col gap-1 border-t border-current/10 p-1.5">
          <For each={rows()}>
            {(row) => (
              <div
                class="grid gap-1"
                style={{ "grid-template-columns": `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                <For each={row}>
                  {(b) => {
                    const inner = (
                      <span class="flex items-center justify-center gap-1 px-2 py-1.5 text-[13px] font-medium leading-none">
                        <Show when={b.icon}>
                          <Twemoji emoji={b.icon!} size={16} />
                        </Show>
                        <span class="truncate">{b.label}</span>
                      </span>
                    );
                    const cls =
                      "block rounded-[10px] bg-black/10 text-center no-underline transition hover:bg-black/16 active:scale-[0.98]";
                    if (b.url) {
                      return (
                        <a
                          href={b.url}
                          target={b.url.startsWith("/") ? undefined : "_blank"}
                          rel="noopener noreferrer"
                          class={cls}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {inner}
                        </a>
                      );
                    }
                    return (
                      <button
                        type="button"
                        class={`${cls} w-full`}
                        onClick={(e) => {
                          e.stopPropagation();
                          b.onClick?.(e);
                        }}
                      >
                        {inner}
                      </button>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={comments()}>
        {(c) => {
          const count = () => c().count ?? 0;
          const label = () =>
            count() === 0
              ? (c().emptyLabel ?? "Leave a comment")
              : (c().countLabel ?? (count() === 1 ? "1 comment" : `${count()} comments`));
          return (
            <button
              type="button"
              class="flex w-full items-center gap-1.5 border-t border-current/15 px-3 py-1.5 text-left text-[12px] font-medium leading-none opacity-80"
              onClick={(e) => {
                e.stopPropagation();
                c().onClick?.(e);
              }}
            >
              <ChatMark />
              {c().leading}
              <span class="min-w-0 flex-1 truncate">{label()}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="shrink-0 opacity-40" aria-hidden="true">
                <path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          );
        }}
      </Show>
    </div>
  );
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
  comments?: MessageComments | boolean;
  keyboard?: MessageButton[];
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
        <MessageSurface side={sent() ? "sent" : "received"} comments={props.comments} keyboard={props.keyboard}>
          {props.children}
        </MessageSurface>
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
