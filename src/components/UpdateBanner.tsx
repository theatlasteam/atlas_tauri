import { onCleanup, onMount, Show, createSignal } from "solid-js";
import { Banner, Button } from "@atlas/ui";
import { t } from "../lib/i18n";
import {
  APP_BUILD,
  alreadyTried,
  applyAppUpdate,
  applyIfStale,
  fetchRemoteBuild,
  isWebApp,
  markTried,
} from "../lib/app-update";

export default function UpdateBanner() {
  if (!isWebApp()) return null;

  const [available, setAvailable] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const check = async () => {
    const remote = await fetchRemoteBuild();
    if (!remote || remote === APP_BUILD) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    if (!alreadyTried(remote)) {
      markTried(remote);
      setTimeout(() => {
        void applyAppUpdate();
      }, 1200);
    }
  };

  onMount(() => {
    void applyIfStale();
    void check();
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void check(), 30_000);
    if ("serviceWorker" in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      void navigator.serviceWorker.getRegistration().then((reg) => void reg?.update());
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController) void applyAppUpdate();
      });
    }
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    });
  });

  return (
    <Show when={available()}>
      <Banner
        action={
          <Button
            size="sm"
            disabled={busy()}
            onClick={() => {
              setBusy(true);
              void applyAppUpdate();
            }}
          >
            {t("update.reload")}
          </Button>
        }
      >
        {t("update.available")}
      </Banner>
    </Show>
  );
}
