/** Preset radial pairs — cool hues, same recipe as the Atlas “A” mark
 * (light color at the top, saturated color at the bottom). */
export const AVATAR_GRADIENTS: { from: string; to: string }[] = [
  { from: "#66A1FF", to: "#00FF99" },
  { from: "#7C6CFF", to: "#4DE8FF" },
  { from: "#3D8BFF", to: "#5DFFC8" },
  { from: "#5B6CFF", to: "#C084FC" },
  { from: "#00B7FF", to: "#00E8B0" },
  { from: "#4F46E5", to: "#22D3EE" },
  { from: "#6366F1", to: "#34D399" },
  { from: "#0EA5E9", to: "#A3E635" },
  { from: "#818CF8", to: "#38BDF8" },
  { from: "#2DD4BF", to: "#60A5FA" },
];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function resolveAvatarGradient(seed?: string, salt = ""): { from: string; to: string } {
  const key = (seed ?? "").trim().toUpperCase();
  const exact = AVATAR_GRADIENTS.find((g) => g.from.toUpperCase() === key);
  if (exact) return exact;
  const i = hashSeed(`${key}|${salt}`) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[i] ?? AVATAR_GRADIENTS[0]!;
}

/** Top-centered ellipse, matching the SVG `radialGradient` + rotate(90). */
export function avatarGradientCss(seed?: string, salt = ""): string {
  const { from, to } = resolveAvatarGradient(seed, salt);
  return `radial-gradient(ellipse 140% 100% at 50% 0%, ${from} 0%, ${to} 100%)`;
}

/** Default fallback faces when the user has not picked an emoji or photo. */
export const DEFAULT_AVATAR_SMILEYS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
  "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
  "😋", "😜", "🤪", "🤗", "🤭", "🤫", "🤔", "😎",
  "🥳", "😏", "😌", "😴", "🤠", "🤡", "👻", "🤖",
] as const;

export function defaultAvatarSmiley(seed?: string): string {
  const i = hashSeed(seed ?? "atlas") % DEFAULT_AVATAR_SMILEYS.length;
  return DEFAULT_AVATAR_SMILEYS[i] ?? "😀";
}

export function isEmojiGlyph(s: string): boolean {
  try {
    return /\p{Extended_Pictographic}/u.test(s) || s.includes("\uFE0F") || s.includes("\u200D");
  } catch {
    return s.length > 1 && s.toLocaleUpperCase() === s.toLocaleLowerCase();
  }
}
