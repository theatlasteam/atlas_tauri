// Safari iOS rejects crypto.getRandomValues() on a Uint8Array that views
// WASM linear memory, and TextDecoder({fatal:true}) throws on valid UTF-8.
// wasm-bindgen regenerates atlas_e2ee.js; run this after every bindgen.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(import.meta.dir, "../../../src/lib/e2ee-wasm/atlas_e2ee.js");
let src = readFileSync(file, "utf8");

src = src.replace(
  /arg0\.getRandomValues\(arg1\);/g,
  `{ const _b = arg1; try { arg0.getRandomValues(_b); } catch (_) { const _t = new Uint8Array(_b.byteLength); arg0.getRandomValues(_t); _b.set(_t); } }`,
);

src = src.replace(
  /new TextDecoder\('utf-8', \{ ignoreBOM: true, fatal: true \}\)/g,
  "new TextDecoder('utf-8', { ignoreBOM: true, fatal: false })",
);

writeFileSync(file, src);
console.log("patched atlas_e2ee.js for Safari");
