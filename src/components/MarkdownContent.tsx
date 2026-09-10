import { createMemo } from "solid-js";
import { renderMarkdown } from "../lib/markdown";

/** Renders sanitized markdown as HTML — see lib/markdown.ts. */
export default function MarkdownContent(props: { text: string; class?: string }) {
  const html = createMemo(() => renderMarkdown(props.text));
  const block = () => /<(p|ul|ol|pre|h[1-3]|blockquote|table)\b/i.test(html());
  // eslint-disable-next-line solid/no-innerhtml
  return (
    <div
      class={`markdown-body break-words ${props.class ?? ""}`}
      classList={{ inline: !block(), "w-fit": !block() }}
      innerHTML={html()}
    />
  );
}
