import { cx } from "./lib/cx";

export default function Skeleton(props: { class?: string }) {
  return <div class={cx("animate-pulse rounded-lg bg-border/70", props.class)} />;
}
