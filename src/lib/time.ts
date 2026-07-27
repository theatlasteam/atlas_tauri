import { createSignal } from "solid-js";
import { t } from "./i18n";

/**
 * One shared clock for every relative timestamp in the app.
 *
 * Without it, "5m" was computed once when a row rendered and then sat there
 * lying for the rest of the session — a chat list left open overnight still
 * claimed its newest message had arrived "now". A single interval driving one
 * signal keeps every "2m ago" and every capsule countdown honest, at the cost
 * of one timer rather than one per row.
 *
 * The tick is 1s so countdowns move smoothly; relative labels above a minute
 * recompute to the same string, which Solid discards without touching the DOM.
 */
const [now, setNow] = createSignal(Date.now());
setInterval(() => setNow(Date.now()), 1000);
export { now };

export function formatRelativeTime(iso: string): string {
  const diffMs = now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("time.now");
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Chat-header subtitle for an offline peer.
 *
 * `null` means the peer hides their last seen (or has never been seen) and the
 * caller falls back to a vaguer line — the app must not invent a time for
 * someone who chose not to share one.
 */
export function formatLastSeen(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  const diffMs = now() - then.getTime();
  if (diffMs < 0) return t("time.lastSeenJustNow"); // clock skew between devices
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t("time.lastSeenJustNow");
  if (minutes < 60) return t("time.lastSeenMinutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.lastSeenHours", { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time.lastSeenYesterday", { time: formatClockTime(iso) });
  if (days < 7) return t("time.lastSeenDays", { n: days });
  return t("time.lastSeenDate", {
    date: then.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  });
}

/**
 * Countdown for a sealed time capsule: "2d 04h", "3h 12m", "44s".
 *
 * Only ever two units — a capsule three weeks out does not need its seconds
 * rendered, and one a minute out does not want them hidden.
 */
export function formatCountdown(targetIso: string): string {
  const remainingMs = new Date(targetIso).getTime() - now();
  if (remainingMs <= 0) return t("time.opening");
  const secs = Math.floor(remainingMs / 1000);
  const days = Math.floor(secs / 86_400);
  const hours = Math.floor((secs % 86_400) / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs % 60).padStart(2, "0")}s`;
  return `${secs}s`;
}

/** Absolute "opens" line for a capsule, e.g. "Sat 14 Jun, 09:00". */
export function formatUnlockAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** mm:ss for voice notes. */
export function formatMediaClock(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
