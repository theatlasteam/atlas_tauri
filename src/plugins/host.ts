// Host modules exposed to plugins via the loader's `require`. Plugins import
// the app's own Solid runtime (so their components share reactivity) and app
// UI components (buttons, dialogs, switches, avatars) so plugin UIs look
// native. The `atlas` specifier resolves to the plugin's own SDK context.
//
// Specifier -> resolved exports. These become `require("solid-js")`,
// `require("atlas/ui")`, etc. inside plugin modules.

import * as solid from "solid-js";
import * as solidWeb from "solid-js/web";
import * as solidStore from "solid-js/store";
import { Transition, TransitionGroup } from "solid-transition-group";
import Avatar from "../components/Avatar";
import Dialog from "../ui/Dialog";
import Switch from "../ui/Switch";
import Popover from "../ui/Popover";
import type { PopoverProps } from "../ui/Popover";
import { Menu } from "../ui/Menu";
import Picker from "../ui/Picker";
import type { PickerOption } from "../ui/Picker";
import EmptyState from "../components/EmptyState";
import BackHeader from "../components/BackHeader";
import { SpinnerIcon, CloseIcon, SearchIcon, PlusIcon, DownloadIcon, PlayIcon } from "../icons";
import type { PluginContext } from "./runtime";

export interface HostModuleMap {
  [specifier: string]: unknown;
}

/** App UI components made available to plugins under `require("atlas/ui")`. */
export const uiComponents = {
  Avatar,
  Dialog,
  Switch,
  Popover,
  Menu,
  Picker,
  EmptyState,
  BackHeader,
  Icons: { SpinnerIcon, CloseIcon, SearchIcon, PlusIcon, DownloadIcon, PlayIcon },
  type: {} as {
    PopoverProps: PopoverProps;
    PickerOption: PickerOption;
  },
};

/** Build the module map for one plugin; `atlas` resolves to its SDK context. */
export function createHostModules(ctx: PluginContext): HostModuleMap {
  return {
    "solid-js": solid,
    "solid-js/web": solidWeb,
    "solid-js/store": solidStore,
    "solid-transition-group": { Transition, TransitionGroup },
    atlas: ctx,
    "atlas/ui": uiComponents,
  };
}
