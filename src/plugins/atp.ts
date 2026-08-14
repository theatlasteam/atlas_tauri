// .atp — Atlas Plugin package.
//
// A plugin exported to disk is a JSON document with a stable header so the
// format can evolve without breaking old files:
//
//   { "atp": 1, "plugin": { "pluginId", "name", "version", "description",
//                            "author", "files", "enabled" } }
//
// Import parses it, validates the workspace (manifest + entry), and installs
// it through the normal runtime pipeline.

import { save, open } from "@tauri-apps/plugin-dialog";
import type { PluginRecord } from "./runtime";
import { installPlugin } from "./runtime";
import { pushToast } from "./toasts";

const ATP_VERSION = 1;

interface AtpFile {
  atp: number;
  plugin: PluginRecord;
}

/** Serialize an installed plugin into the .atp JSON string. */
export function serializeAtp(record: PluginRecord): string {
  const doc: AtpFile = {
    atp: ATP_VERSION,
    plugin: {
      pluginId: record.pluginId,
      name: record.name,
      version: record.version,
      description: record.description,
      author: record.author,
      files: record.files,
      enabled: record.enabled,
    },
  };
  return JSON.stringify(doc, null, 2);
}

export function parseAtp(text: string): PluginRecord {
  const doc = JSON.parse(text) as AtpFile;
  if (!doc || doc.atp !== ATP_VERSION || !doc.plugin) {
    throw new Error("Not an Atlas plugin file (.atp)");
  }
  const p = doc.plugin;
  if (!p.pluginId || !p.name || !p.files || !p.files["manifest.json"]) {
    throw new Error("Invalid plugin package: missing manifest");
  }
  return {
    pluginId: p.pluginId,
    name: p.name,
    version: p.version,
    description: p.description,
    author: p.author,
    files: p.files,
    enabled: true,
  };
}

/** Export a plugin to disk via the native save dialog. */
export async function exportAtp(record: PluginRecord): Promise<boolean> {
  try {
    const path = await save({
      defaultPath: `${record.pluginId || "plugin"}.atp`,
      filters: [{ name: "Atlas plugin", extensions: ["atp"] }],
    });
    if (!path) return false;
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, serializeAtp(record));
    pushToast(`Exported ${record.name}.atp`, "success");
    return true;
  } catch (e) {
    console.error("[atlas] export plugin failed:", e);
    pushToast("Couldn't export the plugin.", "error");
    return false;
  }
}

/** Import a plugin from disk via the native open dialog, then install it. */
export async function importAtp(): Promise<boolean> {
  try {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Atlas plugin", extensions: ["atp"] }],
    });
    if (!path) return false;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const text = await readTextFile(String(path));
    const record = parseAtp(text);
    await installPlugin(record);
    pushToast(`Imported ${record.name}.`, "success");
    return true;
  } catch (e) {
    console.error("[atlas] import plugin failed:", e);
    pushToast(e instanceof Error ? e.message : "Couldn't import the plugin.", "error");
    return false;
  }
}
