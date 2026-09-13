import { Show, type JSX, onCleanup, createEffect } from "solid-js";
import { Portal } from "solid-js/web";
import { Transition } from "solid-transition-group";

const dialogs: symbol[] = [];
let originalOverflow = "";
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export default function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: JSX.Element;
  footer?: JSX.Element;
}) {
  let panel: HTMLDivElement | undefined;
  createEffect(() => {
    if (!props.open) return;
    const token = Symbol("dialog");
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogs.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogs.push(token);
    const top = () => dialogs[dialogs.length - 1] === token;
    const controls = () => Array.from(panel?.querySelectorAll<HTMLElement>(focusable) ?? []).filter((el) => el.getClientRects().length && !el.closest('[inert]'));
    const focusFirst = () => (controls()[0] ?? panel)?.focus();
    queueMicrotask(() => { if (top()) focusFirst(); });
    const onKey = (e: KeyboardEvent) => {
      if (!top()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        props.onOpenChange(false);
      } else if (e.key === "Tab") {
        const items = controls();
        const first = items[0], last = items[items.length - 1];
        if (!first) { e.preventDefault(); panel?.focus(); return; }
        if (!panel?.contains(document.activeElement) || document.activeElement === panel) {
          e.preventDefault(); (e.shiftKey ? last : first)?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (top() && panel && !panel.contains(e.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    onCleanup(() => {
      const wasTop = top();
      const i = dialogs.indexOf(token);
      if (i >= 0) dialogs.splice(i, 1);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      if (!dialogs.length) document.body.style.overflow = originalOverflow;
      if (wasTop && previousFocus?.isConnected) previousFocus.focus();
    });
  });
  return (
    <Portal>
      <Transition name="fade">
        <Show when={props.open}>
          <div class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={() => props.onOpenChange(false)} />
        </Show>
      </Transition>
      <Transition name="pop">
        <Show when={props.open}>
          <div class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="atlas-dialog-title" aria-describedby={props.description ? "atlas-dialog-desc" : undefined} tabIndex={-1} class="pointer-events-auto max-h-[calc(100dvh-2rem)] w-full max-w-md origin-bottom overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-surface-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-floating outline-none sm:origin-center sm:rounded-3xl">
              <h2 id="atlas-dialog-title" class="text-lg font-semibold text-ink">{props.title}</h2>
              <Show when={props.description}><p id="atlas-dialog-desc" class="mt-1 text-sm text-ink-muted">{props.description}</p></Show>
              <div class="mt-4">{props.children}</div>
              <Show when={props.footer}><div class="mt-5 flex flex-wrap justify-end gap-2">{props.footer}</div></Show>
            </div>
          </div>
        </Show>
      </Transition>
    </Portal>
  );
}
