#!/usr/bin/env node
/**
 * Rebuild the .atp archives for every example plugin under examples/.
 * Reads each plugin's files (excluding any .atp archives — an archive must
 * not embed itself), then writes `<manifest-id>.atp` next to the manifest.
 *
 *   bun scripts/build-example-atps.ts
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const EXAMPLES = "examples";

const isAtp = (p) => p.endsWith(".atp");
const isFile = (p) => statSync(p).isFile();

for (const name of readdirSync(EXAMPLES)) {
  const root = join(EXAMPLES, name);
  if (!statSync(root).isDirectory()) continue;

  const manifestPath = join(root, "manifest.json");
  if (!isFile(manifestPath)) continue;

  const files = {};
  for (const rel of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    const full = join(root, rel);
    if (!isFile(full) || isAtp(rel)) continue;
    files[rel.replaceAll("\\", "/")] = readFileSync(full, "utf8");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const doc = {
    atp: 1,
    plugin: {
      pluginId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author ?? "",
      files,
      enabled: true,
    },
  };

  const out = join(root, `${manifest.id}.atp`);
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`built ${out} (${Object.keys(files).length} files)`);
}
