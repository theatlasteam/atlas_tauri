import { Show } from "solid-js";
import { Banner } from "@atlas/ui";
import { connectionState, connectSocket } from "../data/socket";
import { session } from "../store/session";
import { t } from "../lib/i18n";
import { OfflineIcon, SpinnerIcon } from "../icons";

export default function ConnectionBanner() {
  const visible = () => session.status() === "signedIn" && connectionState() !== "online";
  const state = () => connectionState();
  const waiting = () => state() === "connecting" || state() === "reconnecting";
  return (
    <Show when={visible()}>
      <Banner>
        <span class="flex items-center justify-center gap-2">
          <Show
            when={waiting()}
            fallback={
              <>
                <OfflineIcon size={14} />
                <span>{t("connection.offline")}</span>
                <button
                  type="button"
                  class="atlas-focus min-h-11 rounded-pill px-3 text-sm font-medium underline"
                  onClick={() => connectSocket()}
                >
                  {t("connection.retry")}
                </button>
              </>
            }
          >
            <SpinnerIcon size={14} class="animate-spin" />
            {state() === "reconnecting" ? t("connection.reconnecting") : t("connection.connecting")}
          </Show>
        </span>
      </Banner>
    </Show>
  );
}
