import { Match, Switch } from "solid-js";
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
import Dev from "./screens/settings/Dev";
import Verification from "./screens/settings/Verification";
import NewChat from "./screens/NewChat";
import Shell from "./components/Shell";
import TitleBar from "./components/TitleBar";
import Login from "./screens/Login";
import { session } from "./store/session";
import { SpinnerIcon } from "./icons";
import "./App.css";

function App() {
  return (
    <div class="flex h-screen flex-col">
      {/* Above auth state on purpose — a window needs its chrome (or nothing,
          on mobile/web) regardless of whether anyone's signed in yet. */}
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
              <Login />
            </div>
          </Match>
          <Match when={session.status() === "signedIn"}>
            <Router root={Shell}>
              <Route path="/" component={ChatLayout} />
              <Route path="/chat/:id" component={ChatLayout} />
              <Route path="/settings" component={SettingsHome} />
              <Route path="/settings/appearance" component={Appearance} />
              <Route path="/settings/notifications" component={Notifications} />
              <Route path="/settings/folders" component={Folders} />
              <Route path="/settings/privacy" component={Privacy} />
              <Route path="/settings/blocked" component={BlockedUsers} />
              <Route path="/settings/dev" component={Dev} />
              <Route path="/settings/verification" component={Verification} />
              <Route path="/profile" component={Profile} />
              <Route path="/user/:id" component={UserProfile} />
              <Route path="/new-chat" component={NewChat} />
              <Route path="*" component={ChatLayout} />
            </Router>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

export default App;
