// In production the server serves this site itself, so "" (same origin) is
// correct. In dev the site runs on Vite's port while the API runs on
// atlas-server's, so point at that explicitly unless overridden.
export const API_BASE = import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://127.0.0.1:8080" : "");

export async function joinWaitlist(email: string): Promise<{ alreadyJoined: boolean }> {
  const res = await fetch(`${API_BASE}/api/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Something went wrong. Please try again.");
  }
  return res.json();
}

export async function getWaitlistCount(): Promise<number> {
  const res = await fetch(`${API_BASE}/api/waitlist/count`);
  if (!res.ok) throw new Error("Couldn't load waitlist count");
  const body = await res.json();
  return body.count;
}
