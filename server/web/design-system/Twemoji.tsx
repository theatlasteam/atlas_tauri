import { twemojiUrl } from "./twemoji";

export default function Twemoji(props: { emoji: string; size?: number; class?: string; unified?: string }) {
  const size = () => props.size ?? 24;
  return (
    <img
      src={twemojiUrl(props.unified ?? props.emoji)}
      alt={props.emoji}
      draggable={false}
      class={props.class}
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "object-fit": "contain",
      }}
    />
  );
}
