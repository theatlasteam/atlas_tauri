import { cx } from "./lib/cx";
import Logo from "./Logo";

/**
 * Square launcher-style Atlas icon: accent-tinted plate + the mark.
 * The plate follows `--color-accent` so Appearance can preview branding live.
 */
export default function AppIcon(props: {
  size?: number;
  class?: string;
  static?: boolean;
  label?: string;
}) {
  const size = () => props.size ?? 64;
  return (
    <div
      role="img"
      aria-label={props.label ?? "Atlas"}
      class={cx("relative shrink-0 overflow-hidden", props.class)}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": "22%",
        background:
          "radial-gradient(circle at 50% 38%, color-mix(in oklab, var(--color-accent) 45%, white) 0%, var(--color-accent) 52%, color-mix(in oklab, var(--color-accent) 72%, #14081f) 100%)",
      }}
    >
      <div class="grid h-full w-full place-items-center">
        <Logo width={Math.round(size() * 0.62)} noReveal decorative />
      </div>
    </div>
  );
}
