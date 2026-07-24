import { Match, Switch } from "solid-js";
import { Router, Route } from "@solidjs/router";
import ChatLayout from "./components/ChatLayout";
import Profile from "./screens/Profile";
import SettingsHome from "./screens/settings/SettingsHome";
import Appearance from "./screens/settings/Appearance";
import Notifications from "./screens/settings/Notifications";
import Folders from "./screens/settings/Folders";
import Privacy from "./screens/settings/Privacy";
import NewChat from "./screens/NewChat";
import Shell from "./components/Shell";
import Login from "./screens/Login";
import { session } from "./store/session";
import { SpinnerIcon } from "./icons";
import "./App.css";

function App() {
  return (
    <Switch>
      <Match when={session.status() === "loading"}>
        <div class="flex h-screen items-center justify-center bg-bg text-ink-subtle">
          <SpinnerIcon size={28} class="animate-spin" />
        </div>
      </Match>
      <Match when={session.status() === "signedOut"}>
        <div class="h-screen bg-bg text-ink">
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
          <Route path="/profile" component={Profile} />
          <Route path="/new-chat" component={NewChat} />
          <Route path="*" component={ChatLayout} />
        </Router>
      </Match>
    </Switch>
  );
}

export default App;
