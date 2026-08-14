import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import PrivacyPolicy from "./components/PrivacyPolicy";
import PluginEditor from "./screens/PluginEditor";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

// No router dependency for a small site: the server already falls back
// unmatched paths to this same index.html (see server/src/main.rs), so a
// plain pathname check is enough to pick which page renders.
function Root() {
  const path = window.location.pathname;
  if (path === "/privacy") return <PrivacyPolicy />;
  if (path === "/plugins" || path.startsWith("/plugins/")) return <PluginEditor />;
  return <App />;
}

render(() => <Root />, document.getElementById("root") as HTMLElement);
