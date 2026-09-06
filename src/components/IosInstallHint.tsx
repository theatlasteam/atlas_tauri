import { createSignal, Show } from "solid-js";
import { isIOS } from "../lib/platform";
import { isTauri } from "../lib/tauri";
import { t } from "../lib/i18n";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

const DISMISS = "atlas.ios.a2hs.dismissed";

export default function IosInstallHint() {
  if (isTauri || !isIOS() || isStandalone()) return null;
  const [open, setOpen] = createSignal(sessionStorage.getItem(DISMISS) !== "1");
  return (
    <Show when={open()}>
      <div class="mx-4 mb-4 rounded-2xl border border-border bg-surface p-4 text-left text-sm text-ink">
        <p class="font-heading font-semibold">{t("pwa.installTitle")}</p>
        <p class="mt-2 leading-relaxed text-ink-muted">{t("pwa.installBody")}</p>
        <button
          type="button"
          class="mt-3 text-xs font-medium text-ink-subtle underline"
          onClick={() => {
            sessionStorage.setItem(DISMISS, "1");
            setOpen(false);
          }}
        >
          {t("pwa.installDismiss")}
        </button>
      </div>
    </Show>
  );
}
