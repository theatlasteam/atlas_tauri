import { createSignal, Show } from "solid-js";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "../icons";
import { t } from "../lib/i18n";

export type MindToolState = "running" | "done" | "error";

/** Friendly label for a tool name — falls back to the raw name. */
export function toolLabel(name: string): string {
  switch (name) {
    case "browser":
      return t("minds.toolBrowser");
    case "web_fetch":
      return t("minds.toolFetch");
    case "shell":
      return t("minds.toolShell");
    case "set_schedule":
      return t("minds.toolSchedule");
    case "message_owner":
      return t("minds.toolMessage");
    default:
      return name;
  }
}

/**
 * One tool invocation as a collapsible card, after AI SDK Elements' Tool:
 * wrench + name + status badge in the header, chevron to expand, input as a
 * code block and the result below it. Collapsed by default — the answer text
 * is the point, the tool trace is the receipt.
 */
export default function MindTool(props: {
  name: string;
  /** Raw arguments (JSON string or plain text). */
  args: string;
  output?: string;
  state: MindToolState;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? false);

  const badge = () => {
    switch (props.state) {
      case "running":
        return {
          cls: "bg-accent-soft text-accent",
          icon: <ClockIcon size={12} class="animate-pulse" />,
          label: t("minds.toolRunning"),
        };
      case "error":
        return {
          cls: "bg-danger/10 text-danger",
          icon: <XCircleIcon size={12} />,
          label: t("minds.toolError"),
        };
      default:
        return {
          cls: "bg-success/15 text-success",
          icon: <CheckCircleIcon size={12} />,
          label: t("minds.toolDone"),
        };
    }
  };

  return (
    <div
      class="w-full overflow-hidden rounded-xl border bg-bg"
      classList={{
        "border-danger/40": props.state === "error",
        "border-border": props.state !== "error",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open()}
        class="flex w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-surface/60"
      >
        <span class="flex min-w-0 flex-1 items-center gap-2">
          <WrenchIcon size={15} class="shrink-0 text-ink-subtle" />
          <span class="truncate text-[13px] font-semibold text-ink">{toolLabel(props.name)}</span>
          <span
            class={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge().cls}`}
          >
            {badge().icon}
            {badge().label}
          </span>
        </span>
        <ChevronDownIcon
          size={15}
          class={`shrink-0 text-ink-subtle transition-transform duration-200 ${open() ? "rotate-180" : ""}`}
        />
      </button>
      <Show when={open()}>
        <div class="flex flex-col gap-2 border-t border-border px-2.5 py-2">
          <Show when={props.args.trim()}>
            <div>
              <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                {t("minds.toolInput")}
              </p>
              <pre class="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2 font-mono text-[11px] leading-relaxed text-ink-muted">
                {props.args}
              </pre>
            </div>
          </Show>
          <Show when={props.output && props.output.trim()}>
            <div>
              <p class="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                {t("minds.toolResult")}
              </p>
              <pre class="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-2 font-mono text-[11px] leading-relaxed text-ink-muted">
                {props.output}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
