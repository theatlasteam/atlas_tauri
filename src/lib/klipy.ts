const KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_KLIPY_API_KEY) ||
  "sjCpUyX2Pm6G34jhSbNHkdalPclZpCHYghRsvAOWTVq3AwVsVUSWpZiTYQCFBFJ1";

const BASE = `https://api.klipy.com/api/v1/${KEY}/gifs`;

export type KlipyGif = {
  id: string;
  title: string;
  preview: string;
  url: string;
  width: number;
  height: number;
};

type KlipyFile = { url?: string; width?: number; height?: number };
type KlipyItem = {
  id?: string | number;
  title?: string;
  file?: {
    sm?: { webp?: KlipyFile; gif?: KlipyFile; jpg?: KlipyFile };
    md?: { webp?: KlipyFile; gif?: KlipyFile; jpg?: KlipyFile };
    hd?: { gif?: KlipyFile; webp?: KlipyFile };
  };
};

function pickUrl(f?: { webp?: KlipyFile; gif?: KlipyFile; jpg?: KlipyFile }): KlipyFile | undefined {
  return f?.webp ?? f?.gif ?? f?.jpg;
}

function mapItem(item: KlipyItem): KlipyGif | null {
  const send = pickUrl(item.file?.md) ?? pickUrl(item.file?.hd) ?? pickUrl(item.file?.sm);
  const preview = pickUrl(item.file?.sm) ?? send;
  if (!send?.url || !preview?.url) return null;
  return {
    id: String(item.id ?? send.url),
    title: item.title ?? "GIF",
    preview: preview.url,
    url: send.url,
    width: send.width ?? preview.width ?? 220,
    height: send.height ?? preview.height ?? 220,
  };
}

async function request(path: string, params: Record<string, string>): Promise<KlipyGif[]> {
  const q = new URLSearchParams({ page: "1", per_page: "24", ...params });
  const res = await fetch(`${BASE}/${path}?${q}`);
  if (!res.ok) throw new Error(`klipy ${res.status}`);
  const json = (await res.json()) as { data?: { data?: KlipyItem[] } };
  return (json.data?.data ?? []).map(mapItem).filter((g): g is KlipyGif => !!g);
}

export const searchGifs = (q: string) => request("search", { q });
export const trendingGifs = () => request("trending", {});

export async function gifFile(gif: KlipyGif): Promise<File> {
  const res = await fetch(gif.url);
  if (!res.ok) throw new Error("gif fetch failed");
  const blob = await res.blob();
  const ext = blob.type.includes("webp") ? "webp" : "gif";
  return new File([blob], `${gif.title.replace(/[^\w.-]+/g, "-") || "gif"}.${ext}`, {
    type: blob.type || "image/gif",
  });
}
