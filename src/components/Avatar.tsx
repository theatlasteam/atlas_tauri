import { createResource, Show } from "solid-js";
import { avatarUrl } from "../data/avatarCache";

export default function Avatar(props: {
  color: string;
  initial: string;
  size?: number;
  online?: boolean;
  /** When set with hasPhoto, lazily loads and displays the user's photo. */
  userId?: string;
  hasPhoto?: boolean;
}) {
  const size = () => props.size ?? 48;
  const [photo] = createResource(
    () => (props.hasPhoto && props.userId ? props.userId : undefined),
    avatarUrl,
  );

  return (
    <div class="relative shrink-0" style={{ width: `${size()}px`, height: `${size()}px` }}>
      <Show
        when={photo()}
        fallback={
          <div
            class="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
            style={{ "background-color": props.color, "font-size": `${size() * 0.4}px` }}
          >
            {props.initial}
          </div>
        }
      >
        <img src={photo()} alt="" class="h-full w-full rounded-full object-cover" />
      </Show>
      {props.online && (
        <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400" />
      )}
    </div>
  );
}
