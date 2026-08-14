import { createSignal, Show } from "solid-js";
import { t } from "../lib/i18n";
import logo from "../assets/logo.svg";

/** Sign-in / create-account card for the plugin editor. Publishing a plugin
 *  ties it to the Atlas account you sign in with here. */
export default function PluginAuth(props: {
  onLogin: (handle: string, password: string) => Promise<void>;
  onRegister: (handle: string, name: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = createSignal<"login" | "register">("login");
  const [handle, setHandle] = createSignal("");
  const [name, setName] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode() === "login") await props.onLogin(handle().trim(), password());
      else await props.onRegister(handle().trim(), name().trim(), password());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pluginsAuth.generic"));
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-ink placeholder:text-ink-subtle/70 outline-none transition focus:border-accent/50 focus:ring-2 focus:ring-accent/20";

  return (
    <div class="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <div class="mb-8 text-center">
        <img src={logo} alt="Atlas" class="mx-auto mb-4" width="44" height="32" />
        <h1 class="font-heading text-2xl font-semibold text-ink">{t("pluginsAuth.title")}</h1>
        <p class="mt-2 text-sm leading-relaxed text-ink-muted">{t("pluginsAuth.sub")}</p>
      </div>

      <div class="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_20px_60px_-30px_rgba(0,0,0,0.45)]">
        <div class="flex border-b border-border">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            class="flex-1 py-3 text-sm font-semibold transition"
            classList={{
              "text-accent": mode() === "login",
              "text-ink-subtle hover:text-ink": mode() !== "login",
            }}
          >
            {t("pluginsAuth.signIn")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            class="flex-1 py-3 text-sm font-semibold transition"
            classList={{
              "text-accent": mode() === "register",
              "text-ink-subtle hover:text-ink": mode() !== "register",
            }}
          >
            {t("pluginsAuth.create")}
          </button>
        </div>

        <form onSubmit={submit} class="flex flex-col gap-4 p-6">
          <div>
            <label for="pa-handle" class="mb-1.5 block text-xs font-medium text-ink-subtle">
              {t("pluginsAuth.handle")}
            </label>
            <input
              id="pa-handle"
              value={handle()}
              onInput={(e) => setHandle(e.currentTarget.value)}
              placeholder="developer"
              autocomplete="username"
              spellcheck={false}
              class={input}
              required
            />
          </div>

          <Show when={mode() === "register"}>
            <div>
              <label for="pa-name" class="mb-1.5 block text-xs font-medium text-ink-subtle">
                {t("pluginsAuth.name")}
              </label>
              <input
                id="pa-name"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="Ada Lovelace"
                autocomplete="name"
                class={input}
                required
              />
            </div>
          </Show>

          <div>
            <label for="pa-password" class="mb-1.5 block text-xs font-medium text-ink-subtle">
              {t("pluginsAuth.password")}
            </label>
            <input
              id="pa-password"
              type="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete={mode() === "login" ? "current-password" : "new-password"}
              placeholder={mode() === "login" ? "••••••••" : "At least 8 characters"}
              class={input}
              required
            />
          </div>

          <Show when={error()}>
            <p class="rounded-xl border border-red-300/50 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-600">
              {error()}
            </p>
          </Show>

          <button
            type="submit"
            disabled={busy()}
            class="mt-1 rounded-pill bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_10px_30px_-10px_rgba(201,119,46,0.7)] transition hover:brightness-105 active:scale-[0.97] disabled:opacity-60"
          >
            {busy()
              ? t("pluginsAuth.signingIn")
              : mode() === "login"
                ? t("pluginsAuth.signInButton")
                : t("pluginsAuth.createButton")}
          </button>

          <p class="text-center text-xs text-ink-subtle">
            {mode() === "login" ? t("pluginsAuth.noAccount") : t("pluginsAuth.haveAccount")}
          </p>
        </form>
      </div>
    </div>
  );
}