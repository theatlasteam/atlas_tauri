import { ChatIcon } from "../icons";
import { t } from "../lib/i18n";

/** Detail-pane placeholder shown on desktop when no chat is selected in the sidebar. */
export default function NoChatSelected() {
  return (
    <div class="fade-in-up flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div class="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <ChatIcon size={30} />
      </div>
      <div>
        <p class="font-heading text-lg font-semibold text-ink">{t("noChatSelected.title")}</p>
        <p class="mt-1 text-sm text-ink-subtle">{t("noChatSelected.subtitle")}</p>
      </div>
    </div>
  );
}
