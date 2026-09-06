import { createSignal, For, Show } from "solid-js";
import Button from "../ui/Button";
import logo from "../assets/logo.svg";
import Login from "./Login";
import IosInstallHint from "../components/IosInstallHint";
import { LOCALE_OPTIONS, setLocale, t } from "../lib/i18n";
import { preferences } from "../store/preferences";

const ONBOARDING_KEY = "atlas_onboarding_seen_v2";

export default function Onboarding() {
  const [started, setStarted] = createSignal(localStorage.getItem(ONBOARDING_KEY) === "1");
  const start = () => { localStorage.setItem(ONBOARDING_KEY, "1"); setStarted(true); };
  return (
    <Show when={started()} fallback={
      <div class="flex h-full flex-col items-center justify-center px-6 text-center">
        <div class="w-full max-w-sm">
          <div class="mb-6 flex justify-center gap-2">
            <For each={LOCALE_OPTIONS}>
              {(opt) => (
                <button
                  type="button"
                  class="rounded-pill border px-3 py-1 text-xs font-medium transition"
                  classList={{
                    "border-accent bg-accent/10 text-ink": preferences.locale === opt.value,
                    "border-border text-ink-muted": preferences.locale !== opt.value,
                  }}
                  onClick={() => setLocale(opt.value)}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>
          <img src={logo} alt="Atlas" class="mx-auto mb-8 h-20 w-20" draggable={false} />
          <h1 class="font-heading text-3xl font-bold text-ink">{t("onboarding.welcomeTitle")}</h1>
          <p class="mt-4 text-base leading-relaxed text-ink-muted">{t("onboarding.welcomeBody")}</p>
          <Button size="md" class="mt-10 w-full" onClick={start}>{t("onboarding.getStarted")}</Button>
          <div class="mt-6">
            <IosInstallHint />
          </div>
        </div>
      </div>
    }>
      <Login />
    </Show>
  );
}
