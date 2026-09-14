import { For, Show } from "solid-js";
import GifPicker from "./GifPicker";
import CustomEmojiPicker from "./CustomEmojiPicker";
import { FX_KINDS, graphemes, type FxKind } from "../lib/textEffects";
import { t } from "../lib/i18n";
import { CloseIcon } from "../icons";

export type ExpressionTab = "gif" | "emoji" | "fx";

export default function ExpressionTray(props: {
  tab: ExpressionTab;
  onTab: (tab: ExpressionTab) => void;
  onClose: () => void;
  onGif: (url: string) => void;
  onEmoji: (id: string) => void;
  onFx: (kind: FxKind) => void;
  sample: string;
}) {
  const sample = () => (props.sample.trim() || "Atlas").slice(0, 12);
  const tabs: { id: ExpressionTab; label: string }[] = [
    { id: "gif", label: t("gif.title") },
    { id: "emoji", label: t("emoji.custom.title") },
    { id: "fx", label: t("fx.title") },
  ];

  return (
    <div class="flex min-h-0 flex-col">
      <div class="flex items-center gap-1 pb-2">
        <For each={tabs}>
          {(tab) => (
            <button
              type="button"
              class="atlas-focus min-h-9 rounded-full px-3 text-[13px] font-medium"
              classList={{
                "bg-accent text-accent-ink": props.tab === tab.id,
                "text-ink-muted hover:bg-bg hover:text-ink": props.tab !== tab.id,
              }}
              onClick={() => props.onTab(tab.id)}
            >
              {tab.label}
            </button>
          )}
        </For>
        <button
          type="button"
          class="atlas-focus ml-auto grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-bg hover:text-ink"
          onClick={props.onClose}
          aria-label={t("chatView.closeMiniApp")}
        >
          <CloseIcon size={16} />
        </button>
      </div>
      <Show when={props.tab === "gif"}>
        <GifPicker onPick={props.onGif} />
      </Show>
      <Show when={props.tab === "emoji"}>
        <CustomEmojiPicker onPick={props.onEmoji} />
      </Show>
      <Show when={props.tab === "fx"}>
        <div class="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-3">
          <For each={FX_KINDS}>
            {(kind) => (
              <button
                type="button"
                class="atlas-focus flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl bg-bg px-2 py-2 text-ink hover:bg-accent-soft"
                onClick={() => props.onFx(kind)}
              >
                <span class={`atlas-fx atlas-fx-${kind} text-[15px] font-medium`}>
                  <For each={graphemes(sample())}>
                    {(ch, i) => (
                      <span style={{ "--i": String(i()) }}>{ch === " " ? "\u00a0" : ch}</span>
                    )}
                  </For>
                </span>
                <span class="text-[11px] text-ink-subtle">{t(`fx.${kind}`)}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
