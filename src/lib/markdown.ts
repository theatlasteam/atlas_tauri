import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });
marked.use({
  renderer: {
    link({ href, title, text }) {
      const t = title ? ` title="${title}"` : "";
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/** Compass replies are model output, not from a trusted human — sanitize
 * before it ever reaches innerHTML, same as any other untrusted-HTML path. */
export function renderMarkdown(source: string): string {
  const html = DOMPurify.sanitize(marked.parse(source, { async: false }) as string, {
    ADD_TAGS: ["img"],
    ADD_ATTR: ["target", "src", "alt", "title"],
  });
  // A lone <p> is a block box and inflates short chat bubbles. Unwrap it so
  // "/start" shrink-wraps like a messenger chip.
  const lone = html.match(/^<p>([\s\S]*)<\/p>\s*$/i);
  if (lone && !/<\/?p[\s>]/i.test(lone[1])) return lone[1];
  return html;
}
