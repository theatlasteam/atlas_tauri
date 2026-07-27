import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import PrivacyPolicy from "./components/PrivacyPolicy";

// No router dependency for a two-page site: the server already falls back
// unmatched paths to this same index.html (see server/src/main.rs), so a
// plain pathname check is enough to pick which page renders.
function Root() {
  return window.location.pathname === "/privacy" ? <PrivacyPolicy /> : <App />;
}

render(() => <Root />, document.getElementById("root") as HTMLElement);
