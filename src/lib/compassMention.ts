// Detects "@compass" in a message's plaintext before it's sent — this has to
// run client-side and only client-side: for a DM the server never sees the
// plaintext at all (E2EE), so it cannot parse this out of the body itself.
// The resulting boolean rides along as ordinary metadata on the send
// request; see compass.rs's module doc on the server for what happens with
// it depending on chat type.
const MENTION_RE = /(^|[^\w@])@compass\b/i;

export function mentionsCompass(text: string): boolean {
  return MENTION_RE.test(text);
}
