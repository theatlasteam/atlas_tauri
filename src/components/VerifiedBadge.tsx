import { createSignal } from "solid-js";
import { VerifiedIcon } from "../icons";
import Popover from "../ui/Popover";
import { t } from "../lib/i18n";

/** Non-interactive mark. Nested inside chat links, so it must not be a button. */
export default function VerifiedBadge(props: { size?: number; name?: string }) {
  const [open, setOpen] = createSignal(false);
  let anchor: HTMLSpanElement | undefined;
  return (
    <>
      <span
        ref={anchor}
        class="inline-flex shrink-0 text-verified"
        title={t("verifiedBadge.title")}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <VerifiedIcon size={props.size ?? 15} class="shrink-0" />
        <span class="sr-only">
          {props.name ? t("verifiedBadge.bodyNamed", { name: props.name }) : t("verifiedBadge.body")}
        </span>
      </span>
      <Popover open={open()} onOpenChange={setOpen} anchorRef={() => anchor} placement="bottom-start">
        <div class="w-60 rounded-xl border border-border bg-surface-raised p-3 shadow-floating">
          <p class="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <VerifiedIcon size={15} class="shrink-0 text-verified" />
            {t("verifiedBadge.title")}
          </p>
          <p class="mt-1 text-[13px] leading-relaxed text-ink-subtle">
            {props.name ? t("verifiedBadge.bodyNamed", { name: props.name }) : t("verifiedBadge.body")}
          </p>
        </div>
      </Popover>
    </>
  );
}
