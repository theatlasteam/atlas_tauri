import { Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import Button, { type ButtonSize, type ButtonVariant } from "./Button";
import { cx } from "./lib/cx";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const MS = 320;

export default function Bialog(props: {
  label: JSX.Element;
  title: string;
  description?: string;
  children?: JSX.Element;
  cancelLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirmDisabled?: boolean;
  onConfirm?: () => void | Promise<void>;
  class?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [grown, setGrown] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [pin, setPin] = createSignal({ right: 0, bottom: 0 });
  let trigger: HTMLSpanElement | undefined;
  let panel: HTMLDivElement | undefined;
  let inner: HTMLDivElement | undefined;
  let anim: Animation | undefined;

  const variant = () => props.variant ?? "danger";

  function readPin() {
    const r = trigger?.getBoundingClientRect();
    if (!r) return { right: 0, bottom: 0 };
    return {
      right: document.documentElement.clientWidth - r.right,
      bottom: document.documentElement.clientHeight - r.bottom,
    };
  }

  function triggerSize() {
    const r = trigger?.getBoundingClientRect();
    return { tw: r?.width ?? 1, th: r?.height ?? 1 };
  }

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function startOpen() {
    if (open() || busy()) return;
    setPin(readPin());
    setGrown(false);
    setOpen(true);
  }

  function attachPanel(el: HTMLDivElement | undefined) {
    panel = el;
    if (!el) return;
    el.style.transformOrigin = "100% 100%";
    requestAnimationFrame(() => {
      const { tw, th } = triggerSize();
      const sx = Math.max(0.04, tw / Math.max(1, el.offsetWidth));
      const sy = Math.max(0.04, th / Math.max(1, el.offsetHeight));
      if (reduced()) {
        el.style.transform = "none";
        if (inner) inner.style.opacity = "1";
        setGrown(true);
        return;
      }
      el.style.transform = `scale(${sx}, ${sy})`;
      anim?.cancel();
      anim = el.animate(
        [
          { transform: `scale(${sx}, ${sy})`, boxShadow: "0 0 0 transparent" },
          { transform: "scale(1)", boxShadow: "var(--shadow-floating)" },
        ],
        { duration: MS, easing: EASE, fill: "forwards" },
      );
      inner?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 180,
        delay: 80,
        easing: "ease",
        fill: "forwards",
      });
      setGrown(true);
    });
  }

  function startClose() {
    if (busy()) return;
    const el = panel;
    if (!el || reduced()) {
      setGrown(false);
      setOpen(false);
      return;
    }
    const { tw, th } = triggerSize();
    const sx = Math.max(0.04, tw / Math.max(1, el.offsetWidth));
    const sy = Math.max(0.04, th / Math.max(1, el.offsetHeight));
    anim?.cancel();
    inner?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, fill: "forwards" });
    const a = el.animate(
      [
        { transform: "scale(1)", boxShadow: "var(--shadow-floating)" },
        { transform: `scale(${sx}, ${sy})`, boxShadow: "0 0 0 transparent" },
      ],
      { duration: MS, easing: EASE, fill: "forwards" },
    );
    anim = a;
    setGrown(false);
    a.finished.then(() => setOpen(false)).catch(() => setOpen(false));
  }

  async function confirm() {
    if (props.confirmDisabled) return;
    setBusy(true);
    try {
      await props.onConfirm?.();
      setBusy(false);
      startClose();
    } catch {
      setBusy(false);
    }
  }

  createEffect(() => {
    if (!open()) return;
    const sync = () => setPin(readPin());
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      startClose();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    });
  });

  return (
    <span ref={(el) => (trigger = el)} class={cx("inline-flex", props.class)}>
      <Button
        variant={variant()}
        size={props.size}
        aria-expanded={open()}
        aria-haspopup="dialog"
        class={open() ? "invisible" : undefined}
        onClick={startOpen}
      >
        {props.label}
      </Button>
      <Portal>
        <div
          class="bialog-scrim fixed inset-0 z-[70] bg-black/40 backdrop-blur-[2px]"
          classList={{ "bialog-scrim-on": open() && grown() }}
          style={{ "pointer-events": open() ? "auto" : "none" }}
          onClick={startClose}
        />
        <Show when={open()}>
          <div
            ref={attachPanel}
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
            class="bialog-panel fixed z-[80] max-h-[calc(100dvh-24px)] overflow-y-auto rounded-3xl border border-border bg-surface-raised text-ink outline-none"
            style={{
              right: `${pin().right}px`,
              bottom: `${pin().bottom}px`,
              width: "min(22.5rem, calc(100vw - 24px))",
              "transform-origin": "100% 100%",
              transform: "scale(0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div ref={(el) => (inner = el)} class="flex flex-col p-5" style={{ opacity: "0" }}>
              <h2 class="text-lg font-semibold leading-tight">{props.title}</h2>
              <Show when={props.description}>
                <p class="mt-1.5 text-sm text-ink-muted">{props.description}</p>
              </Show>
              <Show when={props.children}>
                <div class="mt-3 text-sm">{props.children}</div>
              </Show>
              <div class="mt-5 flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" disabled={busy()} onClick={startClose}>
                  {props.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  variant={variant()}
                  size={props.size}
                  disabled={busy() || props.confirmDisabled}
                  onClick={() => void confirm()}
                >
                  {props.label}
                </Button>
              </div>
            </div>
          </div>
        </Show>
      </Portal>
    </span>
  );
}
