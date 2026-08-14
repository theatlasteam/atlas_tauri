import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

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
  plugins: [solid()],
  css: {
    postcss: "./postcss.config.js",
  },
  define: {
    "import.meta.env.VITE_GITHUB_REPO": JSON.stringify(resolveGithubRepo()),
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: true,
  },
  build: {
    target: "ESNext",
    minify: "esbuild",
    rollupOptions: {
      // Real per-language routes (/ru, /en) plus "/" (aliases /ru) and
      // /privacy, each its own static HTML file with its own <title>,
      // meta description, canonical and hreflang tags — see server/src/main.rs,
      // which serves a directory's index.html when the request path matches it.
      input: {
        main: resolve(__dirname, "index.html"),
        ru: resolve(__dirname, "ru/index.html"),
        en: resolve(__dirname, "en/index.html"),
        privacy: resolve(__dirname, "privacy/index.html"),
      },
    },
  },
});
