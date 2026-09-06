import type { JSX } from "solid-js";
import { For, Show, createEffect } from "solid-js";
import { cx } from "./lib/cx";
import AiMessage from "./AiMessage";
import type { GridLoaderPattern } from "./GridLoader";
import MessageBubble from "./MessageBubble";
import PromptInput, { type PromptModel } from "./PromptInput";
import type { MenuItemDef } from "./Menu";

export type ConversationRole = "user" | "assistant" | "other";

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  name?: string;
  avatar?: string;
  time?: string;
};

export default function Conversation(props: {
  messages: ConversationMessage[];
  thinking?: boolean;
  thinkingLabel?: string;
  loaderPattern?: GridLoaderPattern;
  assistantName?: string;
  class?: string;
  /** Composer. Omit to render a thread-only pane. */
  prompt?: {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    models?: PromptModel[];
    model?: string;
    onModelChange?: (id: string) => void;
    addItems?: MenuItemDef[];
    onAdd?: () => void;
    addIcon?: JSX.Element;
    footer?: JSX.Element;
  };
}) {
  let scroller: HTMLDivElement | undefined;

  createEffect(() => {
    props.messages.length;
    props.thinking;
    queueMicrotask(() => {
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
  });

  return (
    <div class={cx("flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-bg", props.class)}>
      <div ref={(el) => (scroller = el)} class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <For each={props.messages} fallback={<p class="py-8 text-center text-sm text-ink-subtle">No messages yet</p>}>
          {(msg) =>
            msg.role === "assistant" ? (
              <AiMessage name={msg.name ?? props.assistantName}>{msg.content}</AiMessage>
            ) : (
              <MessageBubble
                side={msg.role === "user" ? "sent" : "received"}
                name={msg.role === "other" ? msg.name : undefined}
                avatar={msg.avatar}
                time={msg.time}
              >
                {msg.content}
              </MessageBubble>
            )
          }
        </For>
        <Show when={props.thinking}>
          <AiMessage
            thinking
            name={props.assistantName}
            thinkingLabel={props.thinkingLabel}
            loaderPattern={props.loaderPattern}
          />
        </Show>
      </div>
      <Show when={props.prompt}>
        <div class="shrink-0 border-t border-border bg-surface p-3">
          <PromptInput
            value={props.prompt!.value}
            onChange={props.prompt!.onChange}
            onSubmit={props.prompt!.onSubmit}
            placeholder={props.prompt!.placeholder}
            disabled={props.prompt!.disabled || props.thinking}
            models={props.prompt!.models}
            model={props.prompt!.model}
            onModelChange={props.prompt!.onModelChange}
            addItems={props.prompt!.addItems}
            onAdd={props.prompt!.onAdd}
            addIcon={props.prompt!.addIcon}
            footer={props.prompt!.footer}
          />
        </div>
      </Show>
    </div>
  );
}
