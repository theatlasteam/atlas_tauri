/* @refresh reload */
(globalThis as { process?: unknown }).process ??= { env: {}, browser: true };

import { render } from "solid-js/web";
import { loadE2eeWasm } from "../../../../src/lib/e2ee-wasm";
import App from "../../../../src/App";
import "../../../../src/store/preferences";
import { init as initPlugins } from "../../../../src/plugins/runtime";
import "../../../../src/App.css";

void initPlugins();
void loadE2eeWasm();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/app/sw.js", { scope: "/app/", updateViaCache: "none" })
      .then((reg) => {
        void reg.update();
        setInterval(() => void reg.update(), 60_000);
      })
      .catch(() => {});
  });
}

render(() => <App />, document.getElementById("root") as HTMLElement);
