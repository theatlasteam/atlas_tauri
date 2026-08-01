import { createSignal, Show } from "solid-js";
import Dialog from "../ui/Dialog";
import { api } from "../data/api";
import { SpinnerIcon } from "../icons";
import { t } from "../lib/i18n";

/**
 * Prompt input for generating a new Atlas Space, or (with `parentSpaceId`
 * set) a remix of an existing one. Only generates and stores the Space —
 * the caller decides what to do with the resulting id (share it into a
 * chat, swap a viewer to show it, ...) via `onGenerated`.
 */
export default function SpacePromptModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "remix";
  parentSpaceId?: string;
  onGenerated: (spaceId: string) => void;
}) {
  const [prompt, setPrompt] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal(false);

  const close = () => {
    if (busy()) return;
    props.onOpenChange(false);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    const trimmed = prompt().trim();
    if (!trimmed || busy()) return;
    setBusy(true);
    setError(false);
    try {
      const space = await api.generateSpace(trimmed, props.mode === "remix" ? props.parentSpaceId : undefined);
      setPrompt("");
      props.onGenerated(space.id);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => !busy() && props.onOpenChange(open)}
      title={props.mode === "remix" ? t("space.remixTitle") : t("space.createTitle")}
    >
      <form onSubmit={submit} class="flex flex-col gap-4">
        <textarea
          autofocus
          rows={4}
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          placeholder={props.mode === "remix" ? t("space.remixPlaceholder") : t("space.promptPlaceholder")}
          disabled={busy()}
          class="resize-none rounded-xl border border-border bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-accent disabled:opacity-60"
        />
        <Show when={error()}>
          <p class="text-xs text-danger">{t("space.genericError")}</p>
        </Show>
        <div class="flex gap-2.5">
          <button
            type="button"
            onClick={close}
            disabled={busy()}
            class="flex-1 rounded-pill border border-border py-2.5 text-sm font-semibold text-ink disabled:opacity-40 active:scale-95"
          >
            {t("space.cancel")}
          </button>
          <button
            type="submit"
            disabled={!prompt().trim() || busy()}
            class="flex flex-1 items-center justify-center gap-2 rounded-pill bg-accent py-2.5 text-sm font-semibold text-accent-ink disabled:opacity-40 active:scale-95"
          >
            <Show when={busy()}>
              <SpinnerIcon size={15} class="animate-spin" />
            </Show>
            {busy() ? t("space.generating") : t("space.generate")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
