import type { JSX } from "solid-js";
import { Show, splitProps } from "solid-js";
import { cx } from "./lib/cx";

export default function TextField(
  props: {
    label?: string;
    hint?: string;
    class?: string;
    error?: string;
  } & JSX.InputHTMLAttributes<HTMLInputElement>,
) {
  const [local, rest] = splitProps(props, ["label", "hint", "class", "error", "id"]);
  const id = () => local.id ?? local.label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <label class={cx("flex flex-col gap-1.5 text-sm", local.class)}>
      <Show when={local.label}>
        <span class="font-medium text-ink">{local.label}</span>
      </Show>
      <input
        id={id()}
        class={cx(
          "rounded-xl border bg-surface px-3 py-2 text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent",
          local.error ? "border-danger" : "border-border",
        )}
        {...rest}
      />
      <Show when={local.error}>
        <span class="text-xs text-danger">{local.error}</span>
      </Show>
      <Show when={!local.error && local.hint}>
        <span class="text-xs text-ink-subtle">{local.hint}</span>
      </Show>
    </label>
  );
}
