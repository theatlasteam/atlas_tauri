import { parseFx, wrapFx } from "./textEffects";

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const IMAGE_RE = /\.(gif|webp|png|jpe?g|avif|svg)(\?|#|$)/i;

export function isImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return IMAGE_RE.test(u.pathname) || u.hostname.endsWith("klipy.com") || u.hostname.endsWith("giphy.com") || u.hostname.endsWith("tenor.com");
  } catch {
    return false;
  }
}

export function extractUrls(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[),.;!?]+$/, "")))];
}

export function textWithoutUrls(text: string, urls: string[]): string {
  let rest = text;
  for (const url of urls) rest = rest.split(url).join(" ");
  return rest.replace(/\s+/g, " ").trim();
}

export function captionForEmbeds(text: string): string {
  const { kind, body } = parseFx(text);
  const urls = extractUrls(body);
  const rest = textWithoutUrls(body, urls);
  if (!urls.length) return text;
  if (!rest) return "";
  return kind ? wrapFx(rest, kind) : rest;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
