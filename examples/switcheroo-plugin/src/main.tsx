import { createSignal } from "solid-js";
import { SwitcherooSwitch } from "./SwitcherooSwitch";
import { SwitcherooSettings } from "./Settings";

export type SwitchStyle =
  | "default"
  | "checkbox"
  | "capsule"
  | "minimal"
  | "radio"
  | "squircle"
  | "ios";

// Atlas plugin — lets you restyle every switch in the app.
export function activate(ctx) {
  ctx.log("Switcheroo active");

  const readStyle = (): SwitchStyle => {
    const v = ctx.storage.get("style");
    return v === "checkbox" || v === "capsule" || v === "minimal" || v === "radio" || v === "squircle" || v === "ios"
      ? v
      : "default";
  };

  ctx.ui.mount("switch", ({ checked, onChange, label }) => (
    <SwitcherooSwitch
      checked={checked}
      onChange={onChange}
      label={label}
      style={readStyle()}
    />
  ));

  ctx.ui.configScreen(({ plugin, onClose }) => (
    <SwitcherooSettings plugin={plugin} onClose={onClose} ctx={ctx} />
  ));
}
