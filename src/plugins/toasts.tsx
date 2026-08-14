// In-app toast host. Plugins (ctx.toast / ctx.notify) and app code can push
// toasts here; a single host mounts in Shell so it works on every screen.

import { createSignal, For, onMount } from "solid-js";

export type ToastKind = "info" | "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let nextId = 1;
const [toasts, setToasts] = createSignal<ToastItem[]>([]);

export function pushToast(message: string, kind: ToastKind = "info"): void {
  const id = nextId++;
  setToasts((list) => [...list, { id, message, kind }]);
  setTimeout(() => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, 4000);
}

const KIND_STYLE: Record<ToastKind, string> = {
  info: "border-border bg-surface-raised text-ink",
  success: "border-accent/40 bg-surface-raised text-ink",
  error: "border-danger/40 bg-surface-raised text-ink",
};

export function ToastHost() {
  onMount(() => {
    const clear = () => setToasts([]);
    window.addEventListener("atlas:toasts-clear", clear);
    return () => window.removeEventListener("atlas:toasts-clear", clear);
  });

  return (
    <div class="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4">
      <For each={toasts()}>
        {(toast) => (
          <div
            class={`pointer-events-auto w-full max-w-sm rounded-pill border px-4 py-2.5 text-sm shadow-floating ${KIND_STYLE[toast.kind]}`}
          >
            {toast.message}
          </div>
        )}
      </For>
    </div>
  );
}
