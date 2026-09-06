import { Show } from "solid-js";
import { cx } from "./lib/cx";

export default function Avatar(props: {
  src?: string;
  color?: string;
  initial?: string;
  name: string;
  size?: number;
  class?: string;
}) {
  const size = () => props.size ?? 36;
  const initials = () =>
    props.name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");

  return (
    <div
      class={cx(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-accent-soft font-medium text-accent",
        props.class,
      )}
      style={{ width: `${size()}px`, height: `${size()}px`, "font-size": `${Math.round(size() * 0.38)}px`, "background-color": props.color, color: props.color ? "white" : undefined }}
      aria-hidden={!props.src}
    >
      <Show when={props.src} fallback={<span>{props.initial ?? initials()}</span>}>
        <img src={props.src} alt="" class="h-full w-full object-cover" />
      </Show>
    </div>
  );
}
