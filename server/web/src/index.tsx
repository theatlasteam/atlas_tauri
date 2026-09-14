import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import PrivacyPolicy from "./components/PrivacyPolicy";
import TermsOfService from "./components/TermsOfService";
import PublicOffer from "./components/PublicOffer";
import PluginEditor from "./screens/PluginEditor";
import BotEditor from "./screens/BotEditor";
import DesignSystem from "./screens/DesignSystem";
import Docs from "./screens/Docs";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

// Register the offline shell after the page has loaded. The service worker
// caches the built app shell and keeps the PWA from becoming a blank screen
// when the network disappears.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline support is best-effort and must never break app startup.
    });
  });
}

// No router dependency for a small site: the server already falls back
// unmatched paths to this same index.html (see server/src/main.rs), so a
// plain pathname check is enough to pick which page renders.
function Root() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/app") {
    window.location.replace("/app/index.html");
    return null;
  }
  if (path === "/privacy") return <PrivacyPolicy />;
  if (path === "/terms") return <TermsOfService />;
  if (path === "/oferta") return <PublicOffer />;
  if (path === "/plugins" || path.startsWith("/plugins/")) return <PluginEditor />;
  if (path === "/bots" || path.startsWith("/bots/")) return <BotEditor />;
  if (path === "/docs" || path.startsWith("/docs/")) return <Docs />;
  if (path === "/design" || path.startsWith("/design/")) return <DesignSystem />;
  return <App />;
}

render(() => <Root />, document.getElementById("root") as HTMLElement);
