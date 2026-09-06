import { Show } from "solid-js";
import { Switch as UiSwitch } from "@atlas/ui";
import { renderSlotComponent, slotComponent, type PluginComponent } from "../plugins/ui-slots";

function PluginSwitch(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  component: PluginComponent;
}) {
  return renderSlotComponent(props.component, {
    get checked() {
      return props.checked;
    },
    get onChange() {
      return props.onChange;
    },
    get label() {
      return props.label ?? "";
    },
  });
}

export default function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const plugin = () => slotComponent("switch");

  return (
    <Show
      when={!plugin()}
      fallback={
        <PluginSwitch
          component={plugin()!}
          checked={props.checked}
          onChange={props.onChange}
          label={props.label}
        />
      }
    >
      <UiSwitch checked={props.checked} onChange={props.onChange} label={props.label} />
    </Show>
  );
}
