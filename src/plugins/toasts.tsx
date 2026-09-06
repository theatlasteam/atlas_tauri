import { createSignal, onMount } from "solid-js";
import { Toast } from "@atlas/ui";

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

export function ToastHost() {
  onMount(() => {
    const clear = () => setToasts([]);
    window.addEventListener("atlas:toasts-clear", clear);
    return () => window.removeEventListener("atlas:toasts-clear", clear);
  });

  const top = () => toasts()[toasts().length - 1];

  return <Toast open={!!top()}>{top()?.message}</Toast>;
}
