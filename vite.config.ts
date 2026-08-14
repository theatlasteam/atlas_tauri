import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solid()],

  resolve: {
    alias: {
      // babel-plugin-jsx-dom-expressions -> @babel/helper-module-imports does
      // `require("assert")`; Node's assert doesn't exist in the webview, so
      // point it at a tiny polyfill. Must be CommonJS with the function as
      // the module itself — an ESM default export gets wrapped in a namespace
      // object by Vite's interop, and helper-module-imports calls it directly.
      assert: fileURLToPath(new URL("./src/lib/assert-polyfill.cjs", import.meta.url)),
      "node:assert": fileURLToPath(new URL("./src/lib/assert-polyfill.cjs", import.meta.url)),
    },
  },

  css: {
    postcss: "./postcss.config.js",
    lightningcss: true,
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: host || "127.0.0.1",
    open: false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : { protocol: "ws", host: "127.0.0.1", port: 1421, timeout: 60000 },
    watch: {
      ignored: ["**/src-tauri/**"],
      usePolling: false,
    },
    preTransformRequests: ["src/index.tsx"],
  },

  build: {
    target: "ESNext",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },

  optimizeDeps: {
    entries: ["src/index.tsx"],
    include: ["@babel/standalone", "babel-plugin-jsx-dom-expressions"],
    exclude: ["tauri"],
    esbuildOptions: {
      target: "ESNext",
    },
  },
}));
