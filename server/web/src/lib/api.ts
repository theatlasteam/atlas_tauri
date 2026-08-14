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

// ---------- plugin store ----------
//
// Plugins are user-authored JS modules published through this editor and
// installed by the desktop/mobile app. Reads are public; writes are gated
// behind PLUGIN_ADMIN_TOKEN on the server when one is configured.

export interface PluginDto {
  id: string;
  pluginId: string;
  name: string;
  version: string;
  description: string;
  author: string;
  files: Record<string, string>;
  downloads: number;
  createdAt: string;
  updatedAt: string;
  /** The Atlas account that published the plugin (null for legacy rows). */
  developer: { id: string; handle: string; name: string; hasAvatar: boolean } | null;
}

export interface PluginPayload {
  files: Record<string, string>;
}

// ---------- developer auth ----------
//
// Publishing through the editor requires an Atlas account; the token is kept
// in localStorage (web-only — the desktop app has its own session store).

const TOKEN_KEY = "atlas-web-plugin-token";

export interface DeveloperAccount {
  id: string;
  handle: string;
  name: string;
  /** Whether the account has a profile photo — fetch it from
   *  `${API_BASE}/api/users/{id}/avatar` (the same endpoint the desktop app
   *  uses) with the Bearer token attached. */
  hasAvatar: boolean;
}

export function getPluginToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPluginToken(token: string | null): void {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function authRequest(path: string, body: unknown): Promise<{ token: string; user: DeveloperAccount }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = await res.json().catch(() => null);
    throw new Error(
      parsed?.error === "unauthorized" ? "Wrong handle or password." : (parsed?.error ?? "Something went wrong."),
    );
  }
  const data = await res.json();
  return { token: data.token, user: data.user };
}

export function loginDeveloper(handle: string, password: string): Promise<{ token: string; user: DeveloperAccount }> {
  return authRequest("/api/auth/login", { handle, password, deviceName: "Atlas web plugin editor" });
}

export function registerDeveloper(
  handle: string,
  name: string,
  password: string,
): Promise<{ token: string; user: DeveloperAccount }> {
  return authRequest("/api/auth/register", { handle, name, password, deviceName: "Atlas web plugin editor" });
}

export async function fetchMe(token: string): Promise<DeveloperAccount> {
  const res = await fetch(`${API_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Couldn't restore your session.");
  return res.json();
}

export async function logoutDeveloper(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* best-effort — dropping the token locally is the real logout */
  }
}

export async function listPlugins(): Promise<PluginDto[]> {
  const res = await fetch(`${API_BASE}/api/plugins`);
  if (!res.ok) throw new Error("Couldn't load plugins");
  return res.json();
}

export async function listMyPlugins(): Promise<PluginDto[]> {
  const token = getPluginToken();
  const res = await fetch(`${API_BASE}/api/plugins/mine`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Couldn't load your plugins.");
  return res.json();
}

export async function getPlugin(id: string): Promise<PluginDto> {
  const res = await fetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Couldn't load plugin");
  return res.json();
}

async function writePlugin(id: string | null, payload: PluginPayload): Promise<PluginDto> {
  const token = getPluginToken();
  const res = await fetch(`${API_BASE}/api/plugins${id ? `/${encodeURIComponent(id)}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401) throw new Error("Please sign in to publish plugins.");
    if (res.status === 403) throw new Error("Only the developer who published this plugin can edit it.");
    throw new Error(body?.error ?? "Couldn't save plugin.");
  }
  return res.json();
}

export const createPlugin = (payload: PluginPayload) => writePlugin(null, payload);
export const updatePlugin = (id: string, payload: PluginPayload) => writePlugin(id, payload);

export async function deletePlugin(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/plugins/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Couldn't delete plugin");
}
