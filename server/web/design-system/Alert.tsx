import type { JSX } from "solid-js";
import { cx } from "./lib/cx";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, string> = {
  info: "bg-accent-soft text-accent border-accent/20",
  success: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-900 dark:text-amber-200 border-amber-500/20",
  danger: "bg-red-500/10 text-red-800 dark:text-red-200 border-red-500/20",
};

export default function Alert(props: {
  tone?: AlertTone;
  title?: string;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <div
      role="status"
      class={cx("rounded-2xl border px-4 py-3 text-sm", TONES[props.tone ?? "info"], props.class)}
    >
      {props.title && <p class="mb-0.5 font-semibold">{props.title}</p>}
      <div class="opacity-90">{props.children}</div>
    </div>
  );
}
