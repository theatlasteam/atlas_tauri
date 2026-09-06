import { createMemo, createSignal, Show } from "solid-js";
import { session } from "../store/session";
import { api } from "../data/api";
import { SpinnerIcon } from "../icons";
import logo from "../assets/logo.svg";
import ServerConfigDialog from "../components/ServerConfigDialog";
import { Alert, Button, TextField } from "@atlas/ui";
import { t } from "../lib/i18n";

const SECRET_TAP_COUNT = 7;
const SECRET_TAP_WINDOW_MS = 2500;

/** Combined sign-in / create-account screen. */
export default function Login() {
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const [handle, setHandle] = createSignal("");
  const [name, setName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [serverConfigOpen, setServerConfigOpen] = createSignal(false);
  const [handleChecked, setHandleChecked] = createSignal(false);
  const [, setCheckingHandle] = createSignal(false);
  const passwordRequirements = createMemo(() => {
    const value = password();
    return {
      length: [...value].length >= 8,
      upper: /\p{Lu}/u.test(value),
      lower: /\p{Ll}/u.test(value),
      digit: /\p{N}/u.test(value),
      symbol: [...value].some((char) => /[^\p{L}\p{N}\s]/u.test(char)),
    };
  });

  // Tap the logo 7 times to reveal the server URL override — an escape hatch
  // for pointing at a dev/staging/self-hosted backend, not everyday UI.
  let tapCount = 0;
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  const onLogoTap = () => {
    tapCount += 1;
    if (tapTimer) clearTimeout(tapTimer);
    if (tapCount >= SECRET_TAP_COUNT) {
      tapCount = 0;
      setServerConfigOpen(true);
      return;
    }
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, SECRET_TAP_WINDOW_MS);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy()) return;
    setError(null);
    setBusy(true);
    try {
      if (!handleChecked()) {
        setCheckingHandle(true);
        const result = await api.checkHandle(handle().trim());
        setHandleChecked(true);
        setMode(result.exists ? "login" : "register");
        return;
      }
      if (mode() === "login") {
        await session.login(handle().trim(), password());
      } else {
        await session.register(handle().trim(), name().trim(), password());
      }
    } catch (err: any) {
      setError(err?.message ?? t("login.genericError"));
    } finally {
      setCheckingHandle(false);
      setBusy(false);
    }
  };

  return (
    <div class="flex h-full flex-col items-center justify-center px-6 pb-[max(var(--safe-bottom),1.5rem)] pt-[max(var(--safe-top),1.5rem)]">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3">
          <button type="button" onClick={onLogoTap} class="rounded-full active:scale-95" aria-label="Atlas">
            <img src={logo} alt="" class="h-16 w-16" draggable={false} />
          </button>
          <h1 class="font-heading text-3xl font-bold">Atlas</h1>
          <p class="text-sm text-ink-muted">
            {mode() === "login" ? t("login.welcomeBack") : t("login.createAccount")}
          </p>
        </div>

        <form onSubmit={submit} class="flex flex-col gap-3">
          <TextField
            label={t("login.handle")}
            value={handle()}
            onInput={(e) => setHandle(e.currentTarget.value)}
            placeholder={t("login.handlePlaceholder")}
            autocomplete="username"
            autocapitalize="none"
            spellcheck={false}
          />

          <Show when={handleChecked() && mode() === "register"}>
            <TextField
              label={t("login.displayName")}
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder={t("login.namePlaceholder")}
              autocomplete="name"
            />
          </Show>

          <Show when={handleChecked()}>
            <TextField
              label={t("login.password")}
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={mode() === "register" ? t("login.passwordPlaceholderRegister") : t("login.passwordPlaceholder")}
              autocomplete={mode() === "login" ? "current-password" : "new-password"}
            />
            <Show when={mode() === "register"}>
              <ul class="mt-1 flex flex-col gap-1 text-xs text-ink-subtle" aria-live="polite">
                <li class={passwordRequirements().length ? "text-success" : ""}>{passwordRequirements().length ? "✓" : "○"} {t("login.passwordMinLength")}</li>
                <li class={passwordRequirements().upper ? "text-success" : ""}>{passwordRequirements().upper ? "✓" : "○"} {t("login.passwordUpper")}</li>
                <li class={passwordRequirements().lower ? "text-success" : ""}>{passwordRequirements().lower ? "✓" : "○"} {t("login.passwordLower")}</li>
                <li class={passwordRequirements().digit ? "text-success" : ""}>{passwordRequirements().digit ? "✓" : "○"} {t("login.passwordNumber")}</li>
                <li class={passwordRequirements().symbol ? "text-success" : ""}>{passwordRequirements().symbol ? "✓" : "○"} {t("login.passwordSymbol")}</li>
              </ul>
            </Show>
          </Show>

          <Show when={error()}>
            <Alert tone="danger">{error()}</Alert>
          </Show>

          <Button
            type="submit"
            disabled={busy() || !handle().trim() || (handleChecked() && (!password() || (mode() === "register" && !name().trim())))}
            class="mt-1 min-h-12 w-full"
          >
            <Show when={busy()}>
              <SpinnerIcon size={18} class="animate-spin" />
            </Show>
            {!handleChecked() ? t("login.continue") : mode() === "login" ? t("login.signIn") : t("login.createAccountBtn")}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setHandleChecked(false);
            setPassword("");
            setName("");
            setError(null);
          }}
          class="mt-5 w-full text-center text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          {mode() === "login" ? t("login.switchToRegister") : t("login.switchToLogin")}
        </button>
      </div>

      <ServerConfigDialog open={serverConfigOpen()} onOpenChange={setServerConfigOpen} />
    </div>
  );
}
