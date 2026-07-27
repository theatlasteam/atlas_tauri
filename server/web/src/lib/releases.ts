import { GITHUB_REPO } from "./repo";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string;
  assets: ReleaseAsset[];
}

export type Platform = "windows" | "linux-deb" | "linux-appimage" | "android";

const PLATFORM_MATCHERS: Record<Platform, { label: string; test: (name: string) => boolean }> = {
  windows: { label: "Windows (.msi)", test: (n) => n.endsWith(".msi") },
  "linux-deb": { label: "Linux (.deb)", test: (n) => n.endsWith(".deb") },
  "linux-appimage": { label: "Linux (.AppImage)", test: (n) => n.endsWith(".AppImage") },
  android: { label: "Android (.apk)", test: (n) => n.endsWith(".apk") },
};

export function fetchLatestRelease(): Promise<Release> {
  return fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  }).then((res) => {
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    return res.json();
  });
}

export function assetsByPlatform(release: Release) {
  return (Object.keys(PLATFORM_MATCHERS) as Platform[])
    .map((platform) => {
      const { label, test } = PLATFORM_MATCHERS[platform];
      const asset = release.assets.find((a) => test(a.name));
      return asset ? { platform, label, asset } : null;
    })
    .filter((x): x is { platform: Platform; label: string; asset: ReleaseAsset } => x !== null);
}

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  return "linux-deb";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
