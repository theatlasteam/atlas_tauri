export function canvasShareUrl(id: string): string {
  if (typeof window === "undefined") return `https://atlasmsg.app/canvas/${id}`;
  const host = window.location.hostname;
  if (host === "atlasmsg.app" || host === "www.atlasmsg.app" || host.endsWith(".atlasmsg.app")) {
    return `https://atlasmsg.app/canvas/${id}`;
  }
  return `${window.location.origin}/canvas/${id}`;
}

export function canvasIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/canvas\/([0-9a-fA-F-]{36})\/?$/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
