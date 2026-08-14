/* @refresh reload */
// @babel/standalone (used by the plugin loader to compile .tsx) references
// `process.env` at module init in the webview. Provide a stub so it loads.
(globalThis as { process?: unknown }).process ??= { env: {}, browser: true };

import { render } from "solid-js/web";
import App from "./App";
import "./store/preferences";
import { init as initPlugins } from "./plugins/runtime";
import "./App.css";

// Load installed plugins once the webview exists — independent of auth, so a
// signed-out session still gets plugin-provided UI.
void initPlugins();

render(() => <App />, document.getElementById("root") as HTMLElement);
