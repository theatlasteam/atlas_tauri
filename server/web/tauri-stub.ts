/** Vite alias for `@tauri-apps/api/core` in the marketing/PWA build. */

export const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";

export async function invoke(): Promise<never> {
  throw new Error("Tauri invoke is not available in the web build");
}

export function transformCallback(): number {
  return 0;
}

export class Channel {
  id = 0;
  onmessage = () => undefined;
  toJSON() {
    return "";
  }
}

export class PluginListener {
  async unregister() {}
}

export async function addPluginListener(): Promise<PluginListener> {
  return new PluginListener();
}

export function convertFileSrc(path: string): string {
  return path;
}

export class Resource {
  rid = 0;
  async close() {}
}

export function isTauri(): boolean {
  return false;
}
