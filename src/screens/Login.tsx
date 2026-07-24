import { createSignal, Show } from "solid-js";
import { session } from "../store/session";
import { SpinnerIcon } from "../icons";
import logo from "../assets/logo.svg";
import ServerConfigDialog from "../components/ServerConfigDialog";

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
      if (mode() === "login") {
        await session.login(handle().trim(), password());
      } else {
        await session.register(handle().trim(), name().trim(), password());
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink placeholder-ink-subtle outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-2 focus:ring-accent/15";

  return (
    <div class="flex h-full flex-col items-center justify-center px-6 pb-[max(var(--safe-bottom),1.5rem)] pt-[max(var(--safe-top),1.5rem)]">
      <div class="w-full max-w-sm">
        <div class="mb-8 flex flex-col items-center gap-3">
          <button type="button" onClick={onLogoTap} class="rounded-full active:scale-95" aria-label="Atlas">
            <img src={logo} alt="" class="h-16 w-16" draggable={false} />
          </button>
          <h1 class="font-heading text-3xl font-bold">Atlas</h1>
          <p class="text-sm text-ink-muted">
            {mode() === "login" ? "Welcome back." : "Create your account."}
          </p>
        </div>

        <form onSubmit={submit} class="flex flex-col gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Handle</span>
            <input
              value={handle()}
              onInput={(e) => setHandle(e.currentTarget.value)}
              placeholder="yourname"
              autocomplete="username"
              autocapitalize="none"
              spellcheck={false}
              class={inputClass}
            />
          </label>

          <Show when={mode() === "register"}>
            <label class="flex flex-col gap-1.5">
              <span class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Display name</span>
              <input
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Your Name"
                autocomplete="name"
                class={inputClass}
              />
            </label>
          </Show>

          <label class="flex flex-col gap-1.5">
            <span class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Password</span>
            <input
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={mode() === "register" ? "At least 8 characters" : "Password"}
              autocomplete={mode() === "login" ? "current-password" : "new-password"}
              class={inputClass}
            />
          </label>

          <Show when={error()}>
            <p role="alert" class="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {error()}
            </p>
          </Show>

          <button
            type="submit"
            disabled={busy() || !handle().trim() || !password() || (mode() === "register" && !name().trim())}
            class="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-pill bg-accent py-3 font-semibold text-accent-ink transition-[transform,opacity] duration-150 hover:brightness-105 active:scale-95 disabled:opacity-40"
          >
            <Show when={busy()}>
              <SpinnerIcon size={18} class="animate-spin" />
            </Show>
            {mode() === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode() === "login" ? "register" : "login");
            setError(null);
          }}
          class="mt-5 w-full text-center text-sm text-ink-muted underline-offset-4 hover:underline"
        >
          {mode() === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>

      <ServerConfigDialog open={serverConfigOpen()} onOpenChange={setServerConfigOpen} />
    </div>
  );
}
