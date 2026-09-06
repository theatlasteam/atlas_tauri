import { isTauri } from "./tauri";

export const APP_BUILD = String(import.meta.env.VITE_APP_BUILD ?? "");

const VERSION_URL = "/app/version.json";
const APPLIED_KEY = "atlas.applied-build";

export function isWebApp(): boolean {
  return !isTauri && typeof window !== "undefined" && window.location.pathname.startsWith("/app");
}

export async function applyAppUpdate(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_", Date.now().toString(36));
  window.location.replace(url.toString());
}

export async function fetchRemoteBuild(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { build?: string };
    return typeof json.build === "string" && json.build ? json.build : null;
  } catch {
    return null;
  }
}

export function alreadyTried(remote: string): boolean {
  try {
    return sessionStorage.getItem(APPLIED_KEY) === remote;
  } catch {
    return false;
  }
}

export function markTried(remote: string) {
  try {
    sessionStorage.setItem(APPLIED_KEY, remote);
  } catch {
    /* ignore */
  }
}

export async function applyIfStale(): Promise<boolean> {
  if (!isWebApp() || !APP_BUILD) return false;
  const remote = await fetchRemoteBuild();
  if (!remote || remote === APP_BUILD) return false;
  if (alreadyTried(remote)) return true;
  markTried(remote);
  await applyAppUpdate();
  return true;
}
