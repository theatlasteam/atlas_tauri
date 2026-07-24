import type { JSX } from "solid-js";
import { TransitionGroup } from "solid-transition-group";

/** Wraps a keyed <For> so items fade/slide in, out, and reflow smoothly when the list changes. */
export default function AnimatedList(props: { children: JSX.Element }) {
  return <TransitionGroup name="list">{props.children}</TransitionGroup>;
}
