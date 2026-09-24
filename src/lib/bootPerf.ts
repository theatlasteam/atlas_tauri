// Staged boot timing for diagnosing slow window startup (notably secondary
// native windows on mobile). Each mark logs elapsed ms since this JS
// context started evaluating. Filter logcat with:  adb logcat -d | grep "atlas-boot"
// Cheap enough to keep permanently — a handful of console lines per window.
const t0 =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export function bootMark(stage: string): void {
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  // eslint-disable-next-line no-console
  console.log(`[atlas-boot] +${Math.round(now - t0)}ms ${stage}`);
}
