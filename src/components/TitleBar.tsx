import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMobilePlatform, isTauri } from "../lib/platform";
import logo from "../assets/logo.svg";
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from "../icons";

/**
 * Custom window chrome for desktop (Windows/Linux/macOS) — `decorations:
 * false` in tauri.conf.json turns off the native titlebar everywhere,
 * including mobile (where it's a no-op), so this is what actually draws one
 * back for desktop. Mobile has no window chrome concept at all, hence the
 * `isMobilePlatform()` guard rather than relying on the config alone.
 */
export default function TitleBar() {
  if (!isTauri() || isMobilePlatform()) return null;

  const win = getCurrentWindow();
  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      void win.isMaximized().then(setMaximized);
    });
    onCleanup(() => void unlisten.then((f) => f()));
  });

  const btn =
    "flex h-full w-11 items-center justify-center text-ink-muted transition-colors duration-100 hover:bg-surface";

  return (
    <div
      data-tauri-drag-region
      class="flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-appbar pl-3"
    >
      <div data-tauri-drag-region class="flex flex-1 items-center gap-2 self-stretch">
        <img src={logo} alt="" width="16" height="12" class="pointer-events-none" />
        <span class="pointer-events-none text-xs font-medium text-ink-muted">Atlas</span>
      </div>
      <div class="flex h-full shrink-0 items-center">
        <button type="button" onClick={() => void win.minimize()} class={btn} aria-label="Minimize">
          <MinimizeIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => void win.toggleMaximize()}
          class={btn}
          aria-label={maximized() ? "Restore" : "Maximize"}
        >
          <Show when={maximized()} fallback={<MaximizeIcon size={12} />}>
            <RestoreIcon size={14} />
          </Show>
        </button>
        <button
          type="button"
          onClick={() => void win.close()}
          class={`${btn} hover:bg-danger hover:text-white`}
          aria-label="Close"
        >
          <CloseIcon size={15} />
        </button>
      </div>
    </div>
  );
}
