import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import { defineConfig, type Connect, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";

/** Serve the messenger HTML for /app in Vite dev/preview.
 *  `public/app/` holds the PWA manifest/SW/icon and has no index.html, so
 *  Vite's SPA fallback otherwise hands those URLs the marketing landing page. */
function atlasVersionPlugin(): Plugin {
  const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    name: "atlas-version",
    config() {
      return {
        define: {
          "import.meta.env.VITE_APP_BUILD": JSON.stringify(buildId),
        },
      };
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app/version.json",
        source: JSON.stringify({ build: buildId }),
      });
    },
  };
}

function atlasAppHtml(): Plugin {
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: Connect.NextFunction) => {
    const path = (req.url ?? "").split("?")[0];
    const isAppDoc =
      path === "/app" ||
      path === "/app/" ||
      (path.startsWith("/app/") && !path.split("/").pop()?.includes("."));
    if (isAppDoc) req.url = "/app/index.html";
    next();
  };
  return {
    name: "atlas-app-html",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// Resolve "owner/repo" from the git remote at build time, so the site always
// points at whatever GitHub repo it was actually built from.
function resolveGithubRepo(): string {
  try {
    const url = execSync("git config --get remote.origin.url", { cwd: __dirname })
      .toString()
      .trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);
    if (match) return match[1];
  } catch {
    // fall through to default below (e.g. no git available in the build env)
  }
  return "theatlasteam/atlas_tauri";
}

export default defineConfig({
  plugins: [atlasVersionPlugin(), atlasAppHtml(), solid(), wgslVitePlugin()],
  resolve: {
    // Shared UI is outside the app root; never bundle a second reactive runtime.
    dedupe: ["solid-js", "@solidjs/router"],
    alias: {
      assert: fileURLToPath(new URL("../../src/lib/assert-polyfill.cjs", import.meta.url)),
      "node:assert": fileURLToPath(new URL("../../src/lib/assert-polyfill.cjs", import.meta.url)),
      "@messenger": fileURLToPath(new URL("../../src", import.meta.url)),
      "@atlas/ui": fileURLToPath(new URL("./design-system/index.ts", import.meta.url)),
      "@tauri-apps/api/core": fileURLToPath(new URL("./tauri-stub.ts", import.meta.url)),
    },
  },
  css: {
    postcss: "./postcss.config.js",
  },
  define: {
    "import.meta.env.VITE_GITHUB_REPO": JSON.stringify(resolveGithubRepo()),
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: true,
    fs: { allow: [resolve(__dirname, "../..")] },
  },
  build: {
    target: "ESNext",
    minify: "esbuild",
    rollupOptions: {
      // Real per-language routes (/ru, /en) plus "/" (aliases /ru) and
      // /privacy, each its own static HTML file with its own <title>,
      // meta description, canonical and hreflang tags — see server/src/main.rs,
      // which serves a directory's index.html when the request path matches it.
      // /app is the messenger PWA (same UI as the Tauri client).
      input: {
        main: resolve(__dirname, "index.html"),
        ru: resolve(__dirname, "ru/index.html"),
        en: resolve(__dirname, "en/index.html"),
        privacy: resolve(__dirname, "privacy/index.html"),
        terms: resolve(__dirname, "terms/index.html"),
        oferta: resolve(__dirname, "oferta/index.html"),
        canvas: resolve(__dirname, "canvas/index.html"),
        app: resolve(__dirname, "app/index.html"),
      },
    },
  },
  optimizeDeps: {
    include: ["@babel/standalone", "babel-plugin-jsx-dom-expressions"],
    exclude: ["../../src/lib/e2ee-wasm/atlas_e2ee.js"],
  },
  assetsInclude: ["**/*.wasm"],
});
