import { For, Show } from "solid-js";
import { graphemes, parseFx } from "../lib/textEffects";
import MarkdownContent from "./MarkdownContent";

export default function EffectText(props: { text: string; class?: string }) {
  const parsed = () => parseFx(props.text);
  const chars = () => graphemes(parsed().body).slice(0, 120);

  return (
    <Show when={parsed().kind} fallback={<MarkdownContent text={props.text} class={props.class} />}>
      {(kind) => (
        <span class={`atlas-fx atlas-fx-${kind()} ${props.class ?? ""}`} aria-label={parsed().body}>
          <For each={chars()}>
            {(ch, i) => (
              <span style={{ "--i": String(i()) }}>{ch === " " ? "\u00a0" : ch}</span>
            )}
          </For>
        </span>
      )}
    </Show>
  );
}
