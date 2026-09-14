export function canvasShareUrl(id: string): string {
  return `https://atlasmsg.app/canvas/${id}`;
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
