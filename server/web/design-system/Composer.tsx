import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { PaperPlaneTilt } from "phosphor-solid-js";
import { cx } from "./lib/cx";
import Menu, { type MenuItemDef } from "./Menu";

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="6.5" y="2.5" width="5" height="8.5" rx="2.5" stroke="currentColor" stroke-width="1.7" />
      <path d="M4.5 8.5a4.5 4.5 0 0 0 9 0M9 13v2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export default function Composer(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onVoice?: () => void;
  placeholder?: string;
  disabled?: boolean;
  recording?: boolean;
  /** Treat as sendable even if the text field is empty (e.g. an attachment). */
  forceSend?: boolean;
  class?: string;
  /** Menu on the + control. If omitted, `onAdd` fires. */
  addItems?: MenuItemDef[];
  onAdd?: () => void;
  addIcon?: JSX.Element;
  addLabel?: string;
  actionRef?: (el: HTMLButtonElement) => void;
  onActionPointerDown?: (e: PointerEvent) => void;
  onActionPointerUp?: (e: PointerEvent) => void;
}) {
  const canSend = () => props.value.trim().length > 0 || !!props.forceSend;

  function submit() {
    const text = props.value.trim();
    if ((!text && !props.forceSend) || props.disabled) return;
    props.onSubmit?.(text);
  }

  const addBtn = (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => {
        if (!props.addItems?.length) props.onAdd?.();
      }}
      class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95 disabled:opacity-40"
      aria-label={props.addLabel ?? "Add"}
    >
      {props.addIcon ?? <PlusIcon />}
    </button>
  );

  return (
    <div class={cx("flex items-center gap-1.5", props.class)}>
      <Show when={props.addItems?.length} fallback={addBtn}>
        <Menu align="left" trigger={addBtn} items={props.addItems!} />
      </Show>
      <input
        type="text"
        value={props.value}
        disabled={props.disabled || props.recording}
        placeholder={props.placeholder ?? "Message"}
        class="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent"
        onInput={(e) => props.onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        ref={(el) => props.actionRef?.(el)}
        disabled={props.disabled}
        onClick={() => (canSend() ? submit() : props.onVoice?.())}
        onPointerDown={(e) => props.onActionPointerDown?.(e)}
        onPointerUp={(e) => props.onActionPointerUp?.(e)}
        onPointerLeave={(e) => props.onActionPointerUp?.(e)}
        onPointerCancel={(e) => props.onActionPointerUp?.(e)}
        onContextMenu={(e) => e.preventDefault()}
        class={cx(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:brightness-105 active:scale-95 disabled:opacity-40",
          props.recording && !canSend() ? "animate-pulse bg-red-600 text-white" : "bg-accent text-accent-ink",
        )}
        aria-label={canSend() ? "Send" : props.recording ? "Stop recording" : "Voice message"}
      >
        <Show when={canSend()} fallback={props.recording ? <StopIcon /> : <MicIcon />}>
          <PaperPlaneTilt size={18} weight="bold" />
        </Show>
      </button>
    </div>
  );
}
