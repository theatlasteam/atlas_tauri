const CE = /\{\{ce:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\}\}/g;

export function emojiToken(id: string): string {
  return `{{ce:${id}}}`;
}

export type RichPart = { type: "text"; text: string } | { type: "ce"; id: string };

export function splitCustomEmoji(text: string): RichPart[] {
  const parts: RichPart[] = [];
  let last = 0;
  const re = new RegExp(CE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ type: "text", text: text.slice(last, m.index) });
    parts.push({ type: "ce", id: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts.length ? parts : [{ type: "text", text }];
}
