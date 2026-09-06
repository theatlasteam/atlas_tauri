import { cx } from "./lib/cx";

export default function Divider(props: { class?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      class={cx(
        props.vertical ? "mx-1 h-4 w-px self-center bg-border" : "my-3 h-px w-full bg-border",
        props.class,
      )}
    />
  );
}
