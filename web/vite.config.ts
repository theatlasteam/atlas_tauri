import { execSync } from "node:child_process";
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
  },
  build: {
    target: "ESNext",
    minify: "esbuild",
  },
});
