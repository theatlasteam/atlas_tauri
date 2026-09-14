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
  forceSend?: boolean;
  class?: string;
  addItems?: MenuItemDef[];
  onAdd?: () => void;
  addIcon?: JSX.Element;
  addLabel?: string;
  actionRef?: (el: HTMLButtonElement) => void;
  onActionPointerDown?: (e: PointerEvent) => void;
  onActionPointerUp?: (e: PointerEvent) => void;
  banner?: JSX.Element;
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
      class="atlas-focus grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink disabled:opacity-40"
      aria-label={props.addLabel ?? "Add"}
    >
      {props.addIcon ?? <PlusIcon />}
    </button>
  );

  return (
    <div
      class={cx(
        "flex flex-col overflow-hidden rounded-full border border-border bg-surface",
        props.class,
      )}
    >
      <Show when={props.banner}>
        <div class="border-b border-border px-3 py-2">{props.banner}</div>
      </Show>
      <div class="flex items-end gap-1 p-1.5">
        <Show when={props.addItems?.length} fallback={addBtn}>
          <Menu align="left" trigger={addBtn} items={props.addItems!} />
        </Show>
        <textarea
          rows={1}
          value={props.value}
          disabled={props.disabled || props.recording}
          placeholder={props.placeholder ?? "Message"}
          class="atlas-focus max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-subtle"
          onInput={(e) => {
            const el = e.currentTarget;
            props.onChange(el.value);
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
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
          class="atlas-focus relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full disabled:opacity-40"
          style={{
            background: props.recording && !canSend() ? "var(--color-danger)" : "var(--color-accent)",
            color: props.recording && !canSend() ? "#fff" : "var(--color-accent-ink)",
          }}
          aria-label={canSend() ? "Send" : props.recording ? "Stop recording" : "Voice message"}
        >
          <span class="grid place-items-center">
            <Show when={canSend()} fallback={props.recording ? <StopIcon /> : <MicIcon />}>
              <PaperPlaneTilt size={18} weight="bold" />
            </Show>
          </span>
        </button>
      </div>
    </div>
  );
}
