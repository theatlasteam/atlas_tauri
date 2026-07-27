import { Show } from "solid-js";
import { connectionState } from "../data/socket";
import { session } from "../store/session";
import { t } from "../lib/i18n";
import { OfflineIcon, SpinnerIcon } from "../icons";

/** Slim status strip under headers: only visible while not fully online. */
export default function ConnectionBanner() {
  const visible = () => session.status() === "signedIn" && connectionState() !== "online";
  return (
    <Show when={visible()}>
      <div
        class="rise-in flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
        classList={{
          "bg-accent-soft text-ink-muted": connectionState() === "connecting",
          "bg-surface text-ink-subtle": connectionState() === "offline",
        }}
      >
        <Show
          when={connectionState() === "connecting"}
          fallback={
            <>
              <OfflineIcon size={14} />
              {t("connection.offline")}
            </>
          }
        >
          <SpinnerIcon size={14} class="animate-spin" />
          {t("connection.connecting")}
        </Show>
      </div>
    </Show>
  );
}
