import { createMemo } from "solid-js";
import { renderMarkdown } from "../lib/markdown";

/** Renders sanitized markdown as HTML — see lib/markdown.ts for the
 * sanitize-before-innerHTML step. Used for Compass replies only; a human's
 * message stays plain text (see MessageBubble). */
export default function MarkdownContent(props: { text: string; class?: string }) {
  const html = createMemo(() => renderMarkdown(props.text));
  // eslint-disable-next-line solid/no-innerhtml
  return <div class={`markdown-body break-words ${props.class ?? ""}`} innerHTML={html()} />;
}
