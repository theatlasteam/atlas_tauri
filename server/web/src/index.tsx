import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import PrivacyPolicy from "./components/PrivacyPolicy";
import Oferta from "./components/Oferta";
import PluginEditor from "./screens/PluginEditor";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

// No router dependency for a small site: the server already falls back
// unmatched paths to this same index.html (see server/src/main.rs), so a
// plain pathname check is enough to pick which page renders.
function Root() {
  const path = window.location.pathname;
  // /policy is a common guess for the privacy policy — used to fall through
  // to the landing page, so alias it to /privacy.
  if (path === "/privacy" || path === "/policy") return <PrivacyPolicy />;
  if (path === "/oferta" || path === "/offer") return <Oferta />;
  if (path === "/plugins" || path.startsWith("/plugins/")) return <PluginEditor />;
  return <App />;
}

render(() => <Root />, document.getElementById("root") as HTMLElement);
