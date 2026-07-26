import { For } from "solid-js";
import type { JSX } from "solid-js";

// Phosphor's Solid icons are typed as `(props: any, ref: any) => any` upstream.
type PhosphorIcon = (props: { size?: number; weight?: string }, ref?: unknown) => JSX.Element;

interface AnimatedButtonProps {
  href: string;
  icon: PhosphorIcon;
  variant?: "primary" | "ghost";
  size?: "md" | "sm";
  class?: string;
  /** Plain text label — split per letter so hover can stagger each one. */
  label: () => string;
}

const STAGGER_MS = 8;

export default function AnimatedButton(props: AnimatedButtonProps) {
  const variant = () => props.variant ?? "primary";
  const size = () => props.size ?? "md";
  const letters = () => [...props.label()];

  return (
    <a
      href={props.href}
      class={`btn-anim${props.class ? ` ${props.class}` : ""}`}
      classList={{
        "btn-anim-primary": variant() === "primary",
        "btn-anim-ghost": variant() === "ghost",
        "btn-anim-sm": size() === "sm",
      }}
    >
      <span class="btn-anim-text-wrap">
        <For each={letters()}>
          {(ch, i) => (
            <span class="btn-letter" style={{ "transition-delay": `${i() * STAGGER_MS}ms` }}>
              <span class="btn-letter-face">{ch === " " ? " " : ch}</span>
              <span class="btn-letter-face btn-letter-dup" aria-hidden="true">
                {ch === " " ? " " : ch}
              </span>
            </span>
          )}
        </For>
      </span>
      <span class="btn-anim-icon">
        <props.icon size={16} weight="bold" />
      </span>
    </a>
  );
}
