import { Avatar as UiAvatar, avatarGradientCss } from "@atlas/ui";
import { ArrowBendUpLeft, BookmarkSimple, Warning } from "phosphor-solid-js";
import { createResource, Show } from "solid-js";
import { avatarEpoch, avatarUrl } from "../data/avatarCache";
import atlasLogo from "../../src-tauri/icons/ios/AppIcon-512@2x.png";

function SystemGlyph(props: { keyName: string; size: number }) {
  const icon = () => {
    const size = props.size;
    const weight = "fill" as const;
    if (props.keyName === "replies") return <ArrowBendUpLeft size={size} weight={weight} />;
    if (props.keyName === "incidents") return <Warning size={size} weight={weight} />;
    return <BookmarkSimple size={size} weight={weight} />;
  };
  return icon();
}

export default function Avatar(props: {
  color: string;
  initial: string;
  size?: number;
  online?: boolean;
  /** When set with hasPhoto, lazily loads and displays the user's photo. */
  userId?: string;
  hasPhoto?: boolean;
  /** Official Atlas channel — bundled 1024px app icon. */
  atlasLogo?: boolean;
  /** System chat glyph drawn on the color, instead of a photo or initial. */
  systemKey?: string;
}) {
  const size = () => props.size ?? 48;
  const [photo] = createResource(
    () => {
      const gen = avatarEpoch();
      if (!props.hasPhoto || !props.userId) return undefined;
      return { id: props.userId, gen };
    },
    ({ id }) => avatarUrl(id),
  );
  const src = () => {
    if (props.atlasLogo) return atlasLogo;
    if (!props.hasPhoto) return undefined;
    return photo();
  };

  return (
    <div class="relative shrink-0" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <Show when={props.systemKey} fallback={<UiAvatar src={src()} name={props.initial} initial={props.initial} color={props.color} size={size()} class="avatar-pop" />}>
        <span
          class="avatar-pop grid place-items-center rounded-full text-white"
          style={{ width: `${size()}px`, height: `${size()}px`, background: avatarGradientCss(props.systemKey) }}
        >
          <SystemGlyph keyName={props.systemKey!} size={Math.round(size() * 0.46)} />
        </span>
      </Show>
      {props.online && (
        <span class="pulse-dot absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400" />
      )}
    </div>
  );
}
