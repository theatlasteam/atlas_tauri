/** Public, unauthenticated URL. UUID is the capability. */
export function spaceShareUrl(id: string): string {
  if (typeof window === "undefined") return `https://atlasmsg.app/s/${id}`;
  const host = window.location.hostname;
  if (host === "atlasmsg.app" || host === "www.atlasmsg.app" || host === "s.atlasmsg.app" || host.endsWith(".atlasmsg.app")) {
    return `https://atlasmsg.app/s/${id}`;
  }
  return `${window.location.origin}/s/${id}`;
}
