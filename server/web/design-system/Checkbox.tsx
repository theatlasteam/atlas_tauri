import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cx } from "./lib/cx";

/** Animated stroke-draw checkbox used on the website (waitlist, plugin settings). */
export default function Checkbox(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  class?: string;
  label?: JSX.Element;
  required?: boolean;
  name?: string;
  disabled?: boolean;
}) {
  const box = (
    <span
      class={cx(
        "relative inline-flex h-[18px] w-[18px] shrink-0 transition-transform duration-150 active:scale-90",
        props.disabled && "opacity-50",
        props.class,
      )}
    >
      <input
        type="checkbox"
        name={props.name}
        required={props.required}
        disabled={props.disabled}
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md border border-border bg-surface outline-none transition-[background-color,border-color] duration-150 checked:border-accent checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      <svg
        viewBox="0 0 16 16"
        class="pointer-events-none absolute inset-0 h-full w-full p-[3px] text-accent-ink peer-checked:[&_path]:[stroke-dashoffset:0]"
        fill="none"
      >
        <path
          d="M3 8.2L6.5 11.7L13 4.3"
          pathLength="1"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
    </span>
  );

  return (
    <Show when={props.label} fallback={box}>
      <label class="group inline-flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        {box}
        <span>{props.label}</span>
      </label>
    </Show>
  );
}
