// Compass's user id is generated at server startup, not a fixed constant
// either side can hardcode — this resolves and caches it once per app run
// so building a chat transcript can tell "was this from Compass?" apart
// from any other author without an extra request per message.

import { api } from "../data/api";

let cached: Promise<string> | null = null;

export function compassUserId(): Promise<string> {
  cached ??= api.compassInfo().then((r) => r.userId);
  return cached;
}
