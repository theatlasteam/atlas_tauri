import { Show } from "solid-js";
import { cx } from "./lib/cx";
import { avatarGradientCss, defaultAvatarSmiley, isEmojiGlyph } from "./avatarGradient";
import { twemojiUrl } from "./twemoji";

function firstGrapheme(s: string): string {
  const raw = s.trim();
  if (!raw) return "";
  try {
    const Seg = (Intl as unknown as { Segmenter: new (l: string | undefined, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    const it = new Seg(undefined, { granularity: "grapheme" }).segment(raw);
    for (const part of it) return part.segment;
  } catch {
    /* older engines */
  }
  return Array.from(raw)[0] ?? "";
}

export default function Avatar(props: {
  src?: string;
  color?: string;
  initial?: string;
  name: string;
  size?: number;
  class?: string;
}) {
  const size = () => props.size ?? 36;
  const glyph = () => {
    const raw = (props.initial ?? props.name ?? "").trim();
    const g = firstGrapheme(raw);
    if (g && isEmojiGlyph(g)) return g;
    return defaultAvatarSmiley(`${props.color ?? ""}|${raw}|${props.name ?? ""}`);
  };

  return (
    <div
      class={cx(
        "grid shrink-0 place-items-center overflow-hidden rounded-full text-white",
        props.class,
      )}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        background: props.src ? undefined : avatarGradientCss(props.color, glyph()),
        "line-height": "1",
      }}
      aria-hidden={!props.src}
    >
      <Show when={props.src} fallback={
        <img
          src={twemojiUrl(glyph())}
          alt=""
          draggable={false}
          class="select-none object-contain"
          style={{ width: `${Math.round(size() * 0.62)}px`, height: `${Math.round(size() * 0.62)}px` }}
        />
      }>
        <img src={props.src} alt="" class="h-full w-full object-cover" />
      </Show>
    </div>
  );
}
