import { createResource, Show } from "solid-js";
import { API_BASE } from "../lib/api";

/** Deterministic hue for a name-derived avatar tile. */
export function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function tileGradient(name: string): string {
  return `linear-gradient(135deg, hsl(${hueOf(name)} 72% 46%), hsl(${(hueOf(name) + 45) % 360} 72% 38%))`;
}

/** A plugin's icon as a data URL, from the manifest's "icon" file in its
 *  workspace, or null when the plugin has no icon. A file that's already a
 *  data URL (e.g. an uploaded image) is passed through as-is. */
export function pluginIconSource(files: Record<string, string>): string | null {
  try {
    const manifest = JSON.parse(files?.["manifest.json"] ?? "{}") as { icon?: string };
    const path = typeof manifest.icon === "string" ? manifest.icon : null;
    if (!path) return null;
    const content = files?.[path];
    if (!content) return null;
    if (content.startsWith("data:")) return content;
    const ext = path.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/svg+xml";
    return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  } catch {
    return null;
  }
}

/**
 * An Atlas account's avatar: shows the profile photo (fetched from the
 * server's `/api/users/{id}/avatar` endpoint — the same one the desktop app
 * uses) when the account has one, otherwise falls back to an initial tile.
 */
export default function DevAvatar(props: {
  developer: { id: string; handle: string; name: string; hasAvatar: boolean };
  token: string | null;
  size: number;
}) {
  const [photo] = createResource(
    () => (props.developer.hasAvatar && props.token ? props.developer.id : undefined),
    async (id) => {
      try {
        const res = await fetch(`${API_BASE}/api/users/${id}/avatar`, {
          headers: { Authorization: `Bearer ${props.token}` },
        });
        if (!res.ok) return undefined;
        return URL.createObjectURL(await res.blob());
      } catch {
        return undefined;
      }
    },
  );

  return (
    <Show
      when={photo()}
      fallback={
        <span
          class="grid h-full w-full select-none place-items-center rounded-full font-semibold text-white"
          style={{ background: tileGradient(props.developer.handle), "font-size": `${props.size * 0.42}px` }}
        >
          {props.developer.name.charAt(0).toUpperCase()}
        </span>
      }
    >
      <img src={photo()} alt={`@${props.developer.handle}`} class="h-full w-full rounded-full object-cover" />
    </Show>
  );
}