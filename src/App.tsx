import { Match, Switch, lazy } from "solid-js";
import { Router, Route } from "@solidjs/router";
import ChatLayout from "./components/ChatLayout";
import Profile from "./screens/Profile";
import UserProfile from "./screens/UserProfile";
import SettingsHome from "./screens/settings/SettingsHome";
import Appearance from "./screens/settings/Appearance";
import Notifications from "./screens/settings/Notifications";
import Folders from "./screens/settings/Folders";
import Privacy from "./screens/settings/Privacy";
import BlockedUsers from "./screens/settings/BlockedUsers";
import Plugins from "./screens/settings/Plugins";
import Dev from "./screens/settings/Dev";
import Verification from "./screens/settings/Verification";
import About from "./screens/settings/About";
import Licenses from "./screens/settings/Licenses";
import NewChat from "./screens/NewChat";
import Calls from "./screens/Calls";
import CompassLayout from "./components/CompassLayout";
import SpaceView from "./screens/SpaceView";
import CanvasView from "./screens/CanvasView";
import Shell from "./components/Shell";
import TitleBar from "./components/TitleBar";
import SecurityGate from "./components/SecurityGate";
import UpdateBanner from "./components/UpdateBanner";
import Onboarding from "./screens/Onboarding";
import { session } from "./store/session";
import { SpinnerIcon } from "./icons";
import "./App.css";

const DesignSystem = lazy(() => import("./screens/settings/DesignSystem"));

const routerBase =
  typeof window !== "undefined" && window.location.pathname.startsWith("/app") ? "/app" : "";

function App() {
  return (
    <div class="flex h-screen flex-col">
      {/* Above auth state on purpose — a window needs its chrome (or nothing,
          on mobile/web) regardless of whether anyone's signed in yet. */}
      <SecurityGate />
      <UpdateBanner />
      <TitleBar />
      <div class="min-h-0 flex-1">
        <Switch>
          <Match when={session.status() === "loading"}>
            <div class="flex h-full items-center justify-center bg-bg text-ink-subtle">
              <SpinnerIcon size={28} class="animate-spin" />
            </div>
          </Match>
          <Match when={session.status() === "signedOut"}>
            <div class="h-full bg-bg text-ink">
              <Onboarding />
            </div>
          </Match>
          <Match when={session.status() === "signedIn"}>
            <Router root={Shell} base={routerBase}>
              <Route path="/" component={ChatLayout} />
              <Route path="/chat/:id" component={ChatLayout} />
              <Route path="/chat/:id/comments/:postId" component={ChatLayout} />
              <Route path="/settings" component={SettingsHome} />
              <Route path="/settings/appearance" component={Appearance} />
              <Route path="/settings/notifications" component={Notifications} />
              <Route path="/settings/folders" component={Folders} />
              <Route path="/settings/plugins" component={Plugins} />
              <Route path="/settings/privacy" component={Privacy} />
              <Route path="/settings/blocked" component={BlockedUsers} />
              <Route path="/settings/dev" component={Dev} />
              <Route path="/settings/design-system" component={DesignSystem} />
              <Route path="/settings/verification" component={Verification} />
              <Route path="/settings/about" component={About} />
              <Route path="/settings/about/licenses" component={Licenses} />
              <Route path="/profile" component={Profile} />
              <Route path="/user/:id" component={UserProfile} />
              <Route path="/new-chat" component={NewChat} />
              <Route path="/calls" component={Calls} />
              <Route path="/compass" component={CompassLayout} />
              <Route path="/compass/:id" component={CompassLayout} />
              <Route path="/spaces/:id" component={SpaceView} />
              <Route path="/canvas/:id" component={CanvasView} />
              <Route path="*" component={ChatLayout} />
            </Router>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

export default App;
