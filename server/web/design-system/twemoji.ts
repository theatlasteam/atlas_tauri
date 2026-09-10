/** Twemoji (jdecked fork, CC-BY 4.0) — same glyphs on every OS. */
const TWEMOJI_SVG = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg";

/** Twemoji filenames: strip U+FE0F unless the sequence uses ZWJ (U+200D).
 * ❤️ is `2764.svg`, not `2764-fe0f.svg`; ❤️‍🔥 keeps `-fe0f-200d-`. */
export function toTwemojiId(nativeOrUnified: string): string {
  const raw = nativeOrUnified.trim();
  const hex = /^[\da-f]+(?:-[\da-f]+)*$/i.test(raw);
  const pts = hex
    ? raw.toLowerCase().split("-")
    : [...raw].map((ch) => ch.codePointAt(0)!.toString(16));
  const hasZwj = pts.includes("200d");
  const id = (hasZwj ? pts : pts.filter((p) => p !== "fe0f")).join("-");
  return id;
}

export function nativeToTwemojiId(native: string): string {
  return toTwemojiId(native);
}

export function twemojiUrl(nativeOrUnified: string): string {
  return `${TWEMOJI_SVG}/${toTwemojiId(nativeOrUnified)}.svg`;
}
