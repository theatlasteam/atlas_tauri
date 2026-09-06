import type { JSX } from "solid-js";
import { createEffect, createMemo } from "solid-js";
import { cx } from "./lib/cx";
import Menu, { type MenuItemDef } from "./Menu";

export type PromptModel = { id: string; label: string; hint?: string };

function ChipButton(props: { ariaLabel: string; children: JSX.Element; class?: string }) {
  return (
    <span
      class={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-ink-muted transition hover:bg-bg hover:text-ink",
        props.class,
      )}
      aria-label={props.ariaLabel}
    >
      {props.children}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5 9.2 6.2 14 7.5 9.2 8.8 8 13.5 6.8 8.8 2 7.5l4.8-1.3L8 1.5Z"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export default function PromptInput(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  sendLabel?: string;
  disabled?: boolean;
  class?: string;
  /** Extra controls after + / model (legacy slot). */
  footer?: JSX.Element;
  /** Menu behind the + button. If omitted, `onAdd` fires on click. */
  addItems?: MenuItemDef[];
  onAdd?: () => void;
  /** Override the + glyph. */
  addIcon?: JSX.Element;
  addLabel?: string;
  models?: PromptModel[];
  model?: string;
  onModelChange?: (id: string) => void;
  modelIcon?: JSX.Element;
}) {
  let area: HTMLTextAreaElement | undefined;

  function resize() {
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 200)}px`;
  }

  createEffect(() => {
    props.value;
    queueMicrotask(resize);
  });

  const currentModel = createMemo(
    () => props.models?.find((m) => m.id === props.model) ?? props.models?.[0],
  );

  function submit() {
    const text = props.value.trim();
    if (!text || props.disabled) return;
    props.onSubmit?.(text);
  }

  const addControl = () => {
    if (!props.addItems && !props.onAdd) return null;
    const icon = props.addIcon ?? <PlusIcon />;
    const label = props.addLabel ?? "Add";
    if (props.addItems?.length) {
      return (
        <Menu
          align="left"
          trigger={
            <ChipButton ariaLabel={label} class="h-8 w-8 justify-center px-0">
              {icon}
            </ChipButton>
          }
          items={props.addItems}
        />
      );
    }
    return (
      <button type="button" onClick={props.onAdd}>
        <ChipButton ariaLabel={label} class="h-8 w-8 justify-center px-0">
          {icon}
        </ChipButton>
      </button>
    );
  };

  const modelControl = () => {
    if (!props.models?.length) return null;
    return (
      <Menu
        align="left"
        trigger={
          <ChipButton ariaLabel="Model">
            {props.modelIcon ?? <SparkIcon />}
            <span class="max-w-[9rem] truncate">{currentModel()?.label ?? "Model"}</span>
          </ChipButton>
        }
        items={props.models.map((m) => ({
          id: m.id,
          label: m.hint ? `${m.label} · ${m.hint}` : m.label,
          onSelect: () => props.onModelChange?.(m.id),
        }))}
      />
    );
  };

  return (
    <div
      class={cx(
        "rounded-3xl border border-border bg-surface-raised shadow-sm focus-within:border-accent",
        props.class,
      )}
    >
      <textarea
        ref={(el) => (area = el)}
        rows={1}
        aria-label={props.placeholder ?? "Ask anything"}
        value={props.value}
        disabled={props.disabled}
        placeholder={props.placeholder ?? "Ask anything…"}
        class="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-ink outline-none placeholder:text-ink-subtle disabled:opacity-60"
        onInput={(e) => props.onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div class="flex items-center gap-0.5 px-2 pb-2 pt-1">
        {addControl()}
        {modelControl()}
        <div class="min-w-0 flex-1">{props.footer}</div>
        <button
          type="button"
          aria-label={props.sendLabel ?? "Send"}
          disabled={props.disabled || !props.value.trim()}
          onClick={submit}
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition hover:opacity-90 disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 8h10M9 4l4 4-4 4"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
