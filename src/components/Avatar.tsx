import { Avatar as UiAvatar } from "@atlas/ui";
import { createResource } from "solid-js";
import { avatarUrl } from "../data/avatarCache";
import atlasLogo from "../../src-tauri/icons/ios/AppIcon-512@2x.png";

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
}) {
  const size = () => props.size ?? 48;
  const [photo] = createResource(
    () => (props.hasPhoto && props.userId ? props.userId : undefined),
    avatarUrl,
  );
  const src = () => (props.atlasLogo ? atlasLogo : photo());

  return (
    <div class="relative shrink-0" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <UiAvatar src={src()} name={props.initial} initial={props.initial} color={props.color} size={size()} class="avatar-pop" />
      {props.online && (
        <span class="pulse-dot absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400" />
      )}
    </div>
  );
}
