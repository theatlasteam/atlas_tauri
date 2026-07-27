import { createSignal } from "solid-js";
import { VerifiedIcon } from "../icons";
import Popover from "../ui/Popover";
import { t } from "../lib/i18n";

/** Checkmark shown next to a verified user's name; tapping it explains what
 * the mark means. Granting/revoking is restricted to the "atlas" account
 * server-side (Settings > Verification, only shown to atlas). Always blue —
 * deliberately not the themeable accent, so it reads the same everywhere. */
export default function VerifiedBadge(props: { size?: number; name?: string }) {
  const [open, setOpen] = createSignal(false);
  let anchor: HTMLSpanElement | undefined;

  // A span rather than a button: the badge is usually nested inside a link or
  // button (chat rows, the chat appbar), where a nested <button> would be
  // invalid HTML. Both handlers stop the event so the row's own
  // navigate/select action doesn't fire when the badge is tapped.
  const toggle = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(!open());
  };

  return (
    <>
      <span
        ref={anchor}
        role="button"
        tabindex={0}
        aria-label={t("verifiedBadge.aria")}
        class="inline-flex shrink-0 cursor-pointer text-verified"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") toggle(e);
        }}
      >
        <VerifiedIcon size={props.size ?? 15} class="shrink-0" />
      </span>

      <Popover open={open()} onOpenChange={setOpen} anchorRef={() => anchor} placement="bottom-start">
        <div class="w-60 rounded-xl border border-border bg-surface-raised p-3 shadow-floating">
          <p class="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <VerifiedIcon size={15} class="shrink-0 text-verified" />
            {t("verifiedBadge.title")}
          </p>
          <p class="mt-1 text-xs leading-relaxed text-ink-subtle">
            {props.name ? t("verifiedBadge.bodyNamed", { name: props.name }) : t("verifiedBadge.body")}
          </p>
        </div>
      </Popover>
    </>
  );
}
