// Object-URL cache for profile photos, keyed by user id. Shared across every
// Avatar instance so scrolling a chat list doesn't refetch the same photo,
// and invalidated explicitly when the current user changes their own photo.

import { api } from "./api";

const cache = new Map<string, Promise<string>>();

export function avatarUrl(userId: string): Promise<string> {
  let cached = cache.get(userId);
  if (!cached) {
    cached = api.fetchAvatarUrl(userId);
    cached.catch(() => cache.delete(userId)); // transient failure: allow retry
    cache.set(userId, cached);
  }
  return cached;
}

/** Call after uploading/removing a photo so the next render refetches it. */
export function invalidateAvatar(userId: string) {
  cache.get(userId)?.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  cache.delete(userId);
}

/** Drop every cached avatar (dev tool: force a full refetch). */
export function clearAvatarCache() {
  for (const userId of [...cache.keys()]) invalidateAvatar(userId);
}
