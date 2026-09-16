// Stable, non-identifying device fingerprint for auth anti-abuse.
// No canvas/WebGL probing: just coarse platform traits + a random persisted
// id so reinstalls look new (which only raises the signup risk score — the
// server decides, never the client). The server stores only its SHA-256 hash.

const FP_KEY = "atlas_device_fp_id";

function persistedId(): string {
  try {
    let id = localStorage.getItem(FP_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(FP_KEY, id);
    }
    return id;
  } catch {
    return "ephemeral";
  }
}

async function sha256Hex(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return `fallback-${(h >>> 0).toString(16)}`;
  }
}

export async function deviceFingerprint(): Promise<string> {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const scr = typeof screen !== "undefined" ? screen : ({} as Screen);
  const parts = [
    (nav as Navigator).userAgent ?? "",
    (nav as Navigator & { platform?: string }).platform ?? "",
    (nav as Navigator).language ?? "",
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    `${(scr as Screen).width ?? 0}x${(scr as Screen).height ?? 0}x${(scr as Screen).colorDepth ?? 0}`,
    String((nav as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency ?? 0),
    persistedId(),
  ];
  return sha256Hex(parts.join("|"));
}
