/** Parse Compass replies for ```space fences. */

export type ParsedSpace = { title: string; html: string };

export function parseSpaceFences(content: string): { prose: string; spaces: ParsedSpace[] } {
  const spaces: ParsedSpace[] = [];
  const prose = content.replace(/```space([^\n]*)\n([\s\S]*?)```/gi, (_full, meta: string, body: string) => {
    const titleMatch = /title\s*=\s*"([^"]+)"/i.exec(meta) || /title\s*=\s*'([^']+)'/i.exec(meta);
    const html = body.trim();
    let title = titleMatch?.[1]?.trim() || "";
    if (!title) {
      const tag = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
      title = tag?.[1]?.trim() || "Space";
    }
    if (html) spaces.push({ title, html });
    return "";
  });
  return { prose: prose.trim(), spaces };
}
