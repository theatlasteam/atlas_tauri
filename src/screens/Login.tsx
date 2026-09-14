import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { session } from "../store/session";
import { api } from "../data/api";
import { SpinnerIcon } from "../icons";
import ServerConfigDialog from "../components/ServerConfigDialog";
import { Alert, Button, Checkbox, Logo, TextField } from "@atlas/ui";
import { t } from "../lib/i18n";
import { isTauri } from "../lib/tauri";

const SECRET_TAP_COUNT = 7;
const SECRET_TAP_WINDOW_MS = 2500;

export default function Login() {
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const [handle, setHandle] = createSignal("");
  const [name, setName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [serverConfigOpen, setServerConfigOpen] = createSignal(false);
  const [legalAccepted, setLegalAccepted] = createSignal(false);
  const [handleStatus, setHandleStatus] = createSignal<"idle" | "checking" | "free" | "taken">("idle");
  const [checkedHandle, setCheckedHandle] = createSignal("");

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

  const legalHref = (path: string) => (isTauri ? `https://atlasmsg.app${path}` : path);

  const registerReady = () =>
    handleStatus() === "free" &&
    checkedHandle() === handle().trim() &&
    name().trim().length > 0 &&
    legalAccepted() &&
    Object.values(passwordRequirements()).every(Boolean);

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

  createEffect(() => {
    const h = handle().trim();
    if (mode() !== "register") return;
    if (h !== checkedHandle()) setHandleStatus("idle");
  });

  const checkAvailability = async () => {
    const h = handle().trim();
    if (!h || busy()) return;
    setError(null);
    setHandleStatus("checking");
    try {
      const result = await api.checkHandle(h);
      setCheckedHandle(h);
      setHandleStatus(result.exists ? "taken" : "free");
    } catch (err: unknown) {
      setHandleStatus("idle");
      setError(err instanceof Error ? err.message : t("login.genericError"));
    }
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy()) return;
    setError(null);
    setBusy(true);
    try {
      if (mode() === "login") {
        await session.login(handle().trim(), password());
      } else {
        if (!legalAccepted()) return;
        if (handleStatus() !== "free" || checkedHandle() !== handle().trim()) {
          await checkAvailability();
          return;
        }
        await session.register(handle().trim(), name().trim(), password());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("login.genericError"));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setHandleStatus("idle");
    setCheckedHandle("");
    setPassword("");
    setName("");
    setLegalAccepted(false);
  };

  return (
    <div class="flex h-full flex-col items-center justify-center px-6 pb-[max(var(--safe-bottom),1.5rem)] pt-[max(var(--safe-top),1.5rem)]">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3">
          <button type="button" onClick={onLogoTap} class="atlas-focus rounded-full" aria-label="Atlas">
            <Logo width={72} static />
          </button>
          <h1 class="font-heading text-3xl font-bold">Atlas</h1>
          <p class="text-[15px] text-ink-muted">
            {mode() === "login" ? t("login.welcomeBack") : t("login.createAccount")}
          </p>
        </div>

        <div class="mb-4 grid grid-cols-2 rounded-full border border-border bg-surface p-1">
          <button
            type="button"
            class="atlas-focus min-h-11 rounded-full text-sm font-medium"
            classList={{ "bg-accent text-accent-ink": mode() === "login", "text-ink-muted": mode() !== "login" }}
            onClick={() => switchMode("login")}
          >
            {t("login.signIn")}
          </button>
          <button
            type="button"
            class="atlas-focus min-h-11 rounded-full text-sm font-medium"
            classList={{ "bg-accent text-accent-ink": mode() === "register", "text-ink-muted": mode() !== "register" }}
            onClick={() => switchMode("register")}
          >
            {t("login.createAccountBtn")}
          </button>
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

          <Show when={mode() === "register"}>
            <Show when={handleStatus() === "checking"}>
              <p class="text-sm text-ink-muted" aria-live="polite">{t("login.handleChecking")}</p>
            </Show>
            <Show when={handleStatus() === "free"}>
              <p class="text-sm text-success" aria-live="polite">{t("login.handleFree", { handle: handle().trim() })}</p>
            </Show>
            <Show when={handleStatus() === "taken"}>
              <p class="text-sm text-danger" aria-live="polite">{t("login.handleTaken")}</p>
            </Show>
            <Show when={handleStatus() === "free" && checkedHandle() === handle().trim()}>
              <button type="button" class="text-left text-sm text-ink-muted underline" onClick={() => { setHandleStatus("idle"); setCheckedHandle(""); }}>
                {t("login.changeHandle")}
              </button>
            </Show>
          </Show>

          <Show when={mode() === "register" && handleStatus() === "free" && checkedHandle() === handle().trim()}>
            <TextField
              label={t("login.displayName")}
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder={t("login.namePlaceholder")}
              autocomplete="name"
            />
          </Show>

          <Show when={mode() === "login" || (mode() === "register" && handleStatus() === "free")}>
            <TextField
              label={t("login.password")}
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={mode() === "register" ? t("login.passwordPlaceholderRegister") : t("login.passwordPlaceholder")}
              autocomplete={mode() === "login" ? "current-password" : "new-password"}
            />
            <Show when={mode() === "register"}>
              <ul class="flex flex-col gap-1 text-[13px] text-ink-subtle" aria-live="polite">
                <li class={passwordRequirements().length ? "text-success" : ""}>{passwordRequirements().length ? "✓" : "○"} {t("login.passwordMinLength")}</li>
                <li class={passwordRequirements().upper ? "text-success" : ""}>{passwordRequirements().upper ? "✓" : "○"} {t("login.passwordUpper")}</li>
                <li class={passwordRequirements().lower ? "text-success" : ""}>{passwordRequirements().lower ? "✓" : "○"} {t("login.passwordLower")}</li>
                <li class={passwordRequirements().digit ? "text-success" : ""}>{passwordRequirements().digit ? "✓" : "○"} {t("login.passwordNumber")}</li>
                <li class={passwordRequirements().symbol ? "text-success" : ""}>{passwordRequirements().symbol ? "✓" : "○"} {t("login.passwordSymbol")}</li>
              </ul>
            </Show>
          </Show>

          <Show when={mode() === "register"}>
            <Checkbox
              checked={legalAccepted()}
              onChange={setLegalAccepted}
              required
              label={
                <span class="text-[13px] leading-snug text-ink-muted">
                  {t("login.legalPrefix")}{" "}
                  <a href={legalHref("/privacy")} target="_blank" rel="noopener noreferrer" class="text-accent underline">
                    {t("login.privacy")}
                  </a>{" "}
                  {t("login.legalAnd")}{" "}
                  <a href={legalHref("/terms")} target="_blank" rel="noopener noreferrer" class="text-accent underline">
                    {t("login.terms")}
                  </a>{" "}
                  {t("login.legalAnd")}{" "}
                  <a href={legalHref("/oferta")} target="_blank" rel="noopener noreferrer" class="text-accent underline">
                    {t("login.oferta")}
                  </a>
                </span>
              }
            />
          </Show>

          <Show when={error()}>
            <Alert tone="danger">{error()}</Alert>
          </Show>

          <Show
            when={mode() === "register" && handleStatus() !== "free"}
            fallback={
              <Button
                type="submit"
                disabled={busy() || !handle().trim() || (mode() === "login" && !password()) || (mode() === "register" && !registerReady())}
                class="mt-1 min-h-12 w-full"
              >
                <Show when={busy()}>
                  <SpinnerIcon size={18} class="animate-spin" />
                </Show>
                {mode() === "login" ? t("login.signIn") : t("login.createAccountBtn")}
              </Button>
            }
          >
            <Button
              type="button"
              disabled={busy() || handleStatus() === "checking" || !handle().trim()}
              class="mt-1 min-h-12 w-full"
              onClick={() => void checkAvailability()}
            >
              <Show when={handleStatus() === "checking"}>
                <SpinnerIcon size={18} class="animate-spin" />
              </Show>
              {handleStatus() === "checking" ? t("login.handleChecking") : t("login.checkHandle")}
            </Button>
          </Show>
        </form>
      </div>

      <ServerConfigDialog open={serverConfigOpen()} onOpenChange={setServerConfigOpen} />
    </div>
  );
}
