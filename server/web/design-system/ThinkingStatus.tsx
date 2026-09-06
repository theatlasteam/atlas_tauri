import { cx } from "./lib/cx";
import GridLoader, { type GridLoaderPattern } from "./GridLoader";

/** Inline “the model is thinking” row: 3×3 grid + status copy. */
export default function ThinkingStatus(props: {
  label?: string;
  pattern?: GridLoaderPattern;
  class?: string;
}) {
  return (
    <div class={cx("flex items-center gap-2.5 text-sm text-ink-muted", props.class)} role="status">
      <GridLoader pattern={props.pattern ?? "hollow"} size="sm" />
      <span>{props.label ?? "Churring..."}</span>
    </div>
  );
}
