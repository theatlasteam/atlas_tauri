// Plugin module loader.
//
// Plugins are folders of .ts/.tsx/.js/.jsx files evaluated in the webview.
// Each file is compiled with @babel/standalone: preset-typescript strips the
// types, babel-plugin-jsx-dom-expressions turns Solid JSX into solid-js/web
// runtime calls, and transform-modules-commonjs makes it a CommonJS module
// so a hand-rolled `require` can wire imports together.
//
// `require` resolves:
//   - relative specifiers ("./x", "../ui/Button") against the plugin's file
//     map, trying the literal path then .tsx/.ts/.jsx/.js and index.*;
//   - bare specifiers against the host module map (solid-js, solid-js/web,
//     solid-js/store, atlas, atlas/ui, and app stores/components) so plugins
//     reuse the app's own Solid runtime and UI.
//
// Babel compilation is asynchronous (dynamic import of @babel/standalone),
// but CommonJS `require` is synchronous. So the graph is prepared ahead of
// time: starting from the entry, every statically reachable module is compiled
// and cached, then evaluation runs synchronously against the warm cache.
//
// @babel/standalone is large, so it's only fetched when a plugin actually
// contains a .ts/.tsx file; plain-JS plugins never load it.

import type { TransformOptions } from "@babel/core";

let BabelPromise: Promise<typeof import("@babel/standalone")> | null = null;

/** Lazily load + configure Babel standalone. */
async function babel(): Promise<typeof import("@babel/standalone")> {
  if (!BabelPromise) {
    BabelPromise = (async () => {
      const BabelModule = await import("@babel/standalone");
      const Babel = (BabelModule as unknown as { default?: typeof BabelModule }).default ?? BabelModule;
      const jsxModule = await import("babel-plugin-jsx-dom-expressions");
      const jsxPlugin = (jsxModule as { default?: unknown }).default ?? jsxModule;
      Babel.registerPlugin("jsx-dom-expressions", jsxPlugin as never);
      return Babel;
    })();
  }
  return BabelPromise;
}

export interface HostModuleMap {
  [specifier: string]: unknown;
}

/** specifier -> resolved module exports. */
export type ModuleExports = Record<string, unknown> | (() => unknown);

interface CompiledModule {
  /** Absolute-ish path within the plugin workspace, e.g. "/src/main.tsx". */
  id: string;
  source: string;
  exports: ModuleExports;
}

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const TS_EXTENSIONS = new Set([".tsx", ".ts"]);

/** Static require/import specifiers in a module's source (string literals
 *  only — enough for the module graphs plugins write in practice). */
function staticSpecifiers(source: string): string[] {
  const out = new Set<string>();
  const re = /(?:require\(\s*["']([^"']+)["']\s*\)|from\s*["']([^"']+)["'])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[1] || m[2]) out.add((m[1] ?? m[2]) as string);
  }
  return [...out];
}

/** Compile one source file to CommonJS, keeping TS types stripped and Solid
 *  JSX compiled to the app's own solid-js/web runtime. Plain JS passes
 *  through untouched (no Babel needed). */
async function compile(source: string, filename: string): Promise<string> {
  const ext = "." + (filename.split(".").pop() ?? "");
  if (!TS_EXTENSIONS.has(ext)) return source;

  const Babel = await babel();
  const options: TransformOptions = {
    filename,
    presets: [["typescript", { isTSX: true, allExtensions: true }]],
    plugins: [
      "transform-modules-commonjs",
      ["jsx-dom-expressions", { moduleName: "solid-js/web", generate: "dom" }],
    ],
    sourceMaps: false,
    compact: false,
    comments: false,
    babelrc: false,
    configFile: false,
  };
  const result = Babel.transform(source, options);
  return result.code ?? "";
}

/** Normalize "./a/b" / "../x" against a base dir into a workspace path. */
function resolveRelative(specifier: string, fromDir: string, files: Record<string, string>): string | null {
  const parts: string[] = [];
  for (const seg of specifier.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  const joined = fromDir ? `${fromDir}/${parts.join("/")}` : `/${parts.join("/")}`;
  if (files[joined.replace(/^\//, "")] !== undefined) return joined;
  for (const ext of EXTENSIONS) {
    if (files[(joined + ext).replace(/^\//, "")] !== undefined) return joined + ext;
  }
  for (const ext of EXTENSIONS) {
    const idx = `${joined}/index${ext}`;
    if (files[idx.replace(/^\//, "")] !== undefined) return idx;
  }
  return null;
}

export function createLoader(
  files: Record<string, string>,
  pluginId: string,
  host: HostModuleMap,
) {
  const cache = new Map<string, CompiledModule>();

  function resolvePath(specifier: string, fromDir: string): string | null {
    return resolveRelative(specifier, fromDir, files);
  }

  /**
   * Compile the entry and every statically-reachable module, so evaluation
   * can run synchronously. Returns the entry module.
   */
  async function prepare(entry: string): Promise<CompiledModule> {
    const queue: string[] = [entry];
    while (queue.length) {
      const path = queue.shift()!;
      if (cache.has(path)) continue;
      const source = files[path.replace(/^\//, "")];
      if (source === undefined) throw new Error(`module not found: ${path}`);
      const module: CompiledModule = { id: path, source, exports: {} };
      cache.set(path, module);
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      module.source = await compile(source, path);
      for (const spec of staticSpecifiers(module.source)) {
        if (!spec.startsWith(".")) continue; // host modules need no prep
        const resolved = resolvePath(spec, dir);
        if (resolved && !cache.has(resolved)) queue.push(resolved);
      }
    }
    return cache.get(entry)!;
  }

  /** Synchronously evaluate a prepared module (once) and return its exports. */
  function evaluateModule(path: string, seen = new Set<string>()): CompiledModule {
    const mod = cache.get(path);
    if (!mod) throw new Error(`module not prepared: ${path}`);
    if (seen.has(path)) return mod;
    seen.add(path);
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const require = makeRequire(dir, path, seen);
    const fn = new Function("require", "module", "exports", "globalThis", mod.source);
    fn(require, mod, mod.exports, globalThis);
    return mod;
  }

  /** Synchronous require over the prepared cache. */
  function makeRequire(dir: string, path: string, seen: Set<string>) {
    return (specifier: string): unknown => {
      if (specifier.startsWith(".")) {
        const resolved = resolvePath(specifier, dir);
        if (!resolved) throw new Error(`cannot resolve "${specifier}" from ${path}`);
        const mod = cache.get(resolved);
        if (!mod) {
          throw new Error(
            `"${specifier}" from ${path} was not pre-compiled (dynamic requires are not supported)`,
          );
        }
        if (!seen.has(resolved)) evaluateModule(resolved, seen);
        return mod.exports;
      }
      const hostExport = host[specifier];
      if (hostExport === undefined) throw new Error(`cannot resolve package "${specifier}" in plugin "${pluginId}"`);
      return hostExport;
    };
  }

  /** Evaluate the entry module synchronously (its graph is already prepared). */
  function evaluate(entry: string): CompiledModule {
    return evaluateModule(entry);
  }

  return { prepare, evaluate, resolvePath };
}
