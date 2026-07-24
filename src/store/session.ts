// Auth lifecycle: token persistence (OS keychain via the Tauri core), login/
// register/logout, current-user state, socket lifecycle, and E2EE identity
// publication. Everything else keys off `session.status`.

import { createRoot, createSignal } from "solid-js";
import { api, setToken } from "../data/api";
import { invalidateAvatar } from "../data/avatarCache";
import { connectSocket, disconnectSocket } from "../data/socket";
import type { UserDto } from "../data/generated";
import type { User } from "../data/types";
import { e2eeAvailable, e2eePublicKey, isTauri, secretDelete, secretGet, secretSet } from "../lib/tauri";

const TOKEN_KEY = "auth_token";

export type SessionStatus = "loading" | "signedOut" | "signedIn";

function toUser(dto: UserDto): User {
  return {
    id: dto.id,
    name: dto.name,
    handle: dto.handle,
    status: dto.status,
    bio: dto.bio,
    avatarColor: dto.avatarColor,
    avatarInitial: dto.avatarInitial,
    hasAvatar: dto.hasAvatar,
    lastSeenAt: dto.lastSeenAt,
  };
}

function deviceName(): string {
  if (!isTauri) return "web";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad/i.test(ua)) return "ios";
  if (/mac/i.test(ua)) return "macos";
  if (/windows/i.test(ua)) return "windows";
  return "linux";
}

/** Publish our E2EE identity key to the server directory (Tauri only).
 * A 409 means a key is already published; if it's not ours the account was
 * set up on another device — encrypted DMs will fail to decrypt here, which
 * the message store surfaces per-message rather than blocking sign-in. */
async function publishIdentity() {
  if (!e2eeAvailable) return;
  try {
    const key = await e2eePublicKey();
    await api.publishIdentity(key);
  } catch (e) {
    console.warn("[atlas] identity key publish skipped:", e);
  }
}

function createSessionStore() {
  const [status, setStatus] = createSignal<SessionStatus>("loading");
  const [user, setUser] = createSignal<User | null>(null);

  const applySignIn = async (token: string, dto: UserDto) => {
    setToken(token);
    await secretSet(TOKEN_KEY, token);
    setUser(toUser(dto));
    setStatus("signedIn");
    connectSocket();
    void publishIdentity();
  };

  /** Restore a persisted session on app start. */
  const bootstrap = async () => {
    try {
      const token = await secretGet(TOKEN_KEY);
      if (!token) {
        setStatus("signedOut");
        return;
      }
      setToken(token);
      const me = await api.me();
      setUser(toUser(me));
      setStatus("signedIn");
      connectSocket();
      void publishIdentity();
    } catch (e: any) {
      // 401 = token revoked/expired; anything else (server down) still lands
      // on the login screen, which shows the error on the next attempt.
      setToken(null);
      await secretDelete(TOKEN_KEY).catch(() => {});
      setStatus("signedOut");
    }
  };

  const login = async (handle: string, password: string) => {
    const res = await api.login(handle, password, deviceName());
    await applySignIn(res.token, res.user);
  };

  const register = async (handle: string, name: string, password: string) => {
    const res = await api.register(handle, name, password, deviceName());
    await applySignIn(res.token, res.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* revoking server-side is best-effort; local sign-out always proceeds */
    }
    disconnectSocket();
    setToken(null);
    await secretDelete(TOKEN_KEY).catch(() => {});
    setUser(null);
    setStatus("signedOut");
  };

  const updateProfile = async (patch: Partial<Pick<User, "name" | "bio" | "status" | "avatarColor" | "avatarInitial">>) => {
    const updated = await api.updateMe(patch);
    setUser(toUser(updated));
    return toUser(updated);
  };

  const setAvatar = async (attachmentId: string) => {
    const updated = await api.setAvatar(attachmentId);
    invalidateAvatar(updated.id); // force a refetch of the new photo
    setUser(toUser(updated));
    return toUser(updated);
  };

  const removeAvatar = async () => {
    const updated = await api.removeAvatar();
    invalidateAvatar(updated.id);
    setUser(toUser(updated));
    return toUser(updated);
  };

  void bootstrap();

  return { status, user, login, register, logout, updateProfile, setAvatar, removeAvatar };
}

export const session = createRoot(createSessionStore);
