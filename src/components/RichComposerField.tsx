import { createEffect, on } from "solid-js";
import { api } from "../data/api";
import { emojiToken, splitCustomEmoji } from "../lib/customEmoji";

const srcCache = new Map<string, Promise<string>>();

function emojiSrc(id: string): Promise<string> {
  const hit = srcCache.get(id);
  if (hit) return hit;
  const pending = api.fetchEmojiUrl(id);
  pending.catch(() => srcCache.delete(id));
  srcCache.set(id, pending);
  return pending;
}

export default function RichComposerField(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  let el: HTMLDivElement | undefined;
  let painted = "";

  const serialize = (): string => {
    if (!el) return "";
    if (!el.querySelector("img") && !(el.textContent ?? "").trim()) return "";
    let out = "";
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent ?? "";
        return;
      }
      if (node.nodeName === "BR") {
        out += "\n";
        return;
      }
      if (node instanceof HTMLImageElement && node.dataset.ce) {
        out += emojiToken(node.dataset.ce);
        return;
      }
      if (node.nodeName === "DIV" || node.nodeName === "P") {
        if (out.length && !out.endsWith("\n")) out += "\n";
      }
      node.childNodes.forEach(walk);
    };
    walk(el);
    return out.replace(/\n$/, "");
  };

  const paint = (value: string) => {
    if (!el || value === painted) return;
    painted = value;
    const parts = splitCustomEmoji(value);
    el.replaceChildren();
    if (!value) return;
    for (const part of parts) {
      if (part.type === "text") {
        const chunks = part.text.split("\n");
        chunks.forEach((chunk, i) => {
          if (i > 0) el!.appendChild(document.createElement("br"));
          if (chunk) el!.appendChild(document.createTextNode(chunk));
        });
      } else {
        const img = document.createElement("img");
        img.dataset.ce = part.id;
        img.alt = "";
        img.width = 22;
        img.height = 22;
        img.draggable = false;
        img.contentEditable = "false";
        img.className = "inline-block align-[-4px] mx-0.5 h-[22px] w-[22px] object-contain";
        img.src = "";
        void emojiSrc(part.id).then((src) => {
          if (img.dataset.ce === part.id) img.src = src;
        });
        el.appendChild(img);
      }
    }
    const sel = window.getSelection();
    if (sel && el.contains(document.activeElement)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  createEffect(
    on(
      () => props.value,
      (value) => {
        if (value === serialize()) {
          painted = value;
          return;
        }
        paint(value);
      },
    ),
  );

  return (
    <div class="relative min-h-11 min-w-0 flex-1">
      <div
        class="pointer-events-none absolute inset-0 px-3 py-2.5 text-[15px] text-ink-subtle"
        classList={{ hidden: !!props.value || props.disabled }}
      >
        {props.placeholder ?? "Message"}
      </div>
      <div
        ref={(node) => {
          el = node;
          if (props.value) paint(props.value);
        }}
        role="textbox"
        aria-multiline="true"
        aria-label={props.placeholder ?? "Message"}
        aria-disabled={props.disabled || undefined}
        contentEditable={!props.disabled}
        data-placeholder={props.placeholder ?? "Message"}
        class="atlas-focus max-h-40 min-h-11 overflow-y-auto bg-transparent px-3 py-2.5 text-[15px] leading-snug text-ink outline-none empty:before:hidden"
        onInput={() => {
          const next = serialize();
          painted = next;
          props.onChange(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            props.onSubmit?.();
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData?.getData("text/plain") ?? "";
          document.execCommand("insertText", false, text);
        }}
      />
    </div>
  );
}
