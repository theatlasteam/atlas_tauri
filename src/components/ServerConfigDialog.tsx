import { createSignal, Show } from "solid-js";
import Dialog from "../ui/Dialog";
import { serverConfig } from "../store/serverConfig";

/**
 * Hidden developer/ops escape hatch: point the app at a different backend
 * (local dev, staging, self-hosted) without a rebuild. Reached by tapping the
 * logo 7 times on the login screen — not permanent UI, since regular users
 * never need it.
 */
export default function ServerConfigDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [url, setUrl] = createSignal(serverConfig.apiBase());
  const [saved, setSaved] = createSignal(false);

  const openWithCurrent = (open: boolean) => {
    if (open) {
      setUrl(serverConfig.apiBase());
      setSaved(false);
    }
    props.onOpenChange(open);
  };

  const save = (e: Event) => {
    e.preventDefault();
    serverConfig.setServerUrl(url());
    setSaved(true);
  };

  const resetToDefault = () => {
    serverConfig.setServerUrl(null);
    setUrl(serverConfig.apiBase());
    setSaved(true);
  };

  return (
    <Dialog open={props.open} onOpenChange={openWithCurrent} title="Server">
      <form onSubmit={save} class="flex flex-col gap-3">
        <p class="text-sm text-ink-muted">
          Point this app at a different atlas-server instance. Applies immediately — no restart needed.
        </p>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Server URL</span>
          <input
            value={url()}
            onInput={(e) => {
              setUrl(e.currentTarget.value);
              setSaved(false);
            }}
            placeholder="http://127.0.0.1:8080"
            autocapitalize="none"
            spellcheck={false}
            class="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink placeholder-ink-subtle outline-none focus:border-accent"
          />
        </label>
        <p class="text-xs text-ink-subtle">
          Realtime connects to <span class="font-mono">{serverConfig.wsUrl()}</span>
        </p>

        <Show when={saved()}>
          <p class="rounded-xl bg-accent-soft px-3.5 py-2 text-sm text-ink">Saved.</p>
        </Show>

        <div class="mt-1 flex gap-2.5">
          <button
            type="button"
            onClick={resetToDefault}
            disabled={!serverConfig.isOverridden()}
            class="flex-1 rounded-pill border border-border py-2.5 text-sm font-semibold text-ink-muted active:scale-95 disabled:opacity-40"
          >
            Reset to default
          </button>
          <button
            type="submit"
            disabled={!url().trim()}
            class="flex-1 rounded-pill bg-accent py-2.5 text-sm font-semibold text-accent-ink active:scale-95 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
