import { Show, type JSX } from "solid-js";
import { slotComponent, type PluginComponent } from "../plugins/ui-slots";

/**
 * Renders the plugin-provided switch. It's a component (not an inline call)
 * so Solid keeps the same DOM node across `checked` changes — if we called
 * the plugin function directly in the fallback, each toggle would mount a
 * fresh element and the CSS transitions (left/background) would never play.
 */
function PluginSwitch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string; component: PluginComponent }): JSX.Element {
  return props.component({
    checked: props.checked,
    onChange: props.onChange,
    label: props.label ?? "",
  });
}

export default function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  // A plugin may replace the switch's visual entirely via the `switch` UI
  // slot (e.g. Switcheroo's checkbox/capsule/minimal styles). The plugin
  // component receives { checked, onChange, label } and owns its styling.
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
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        onClick={() => props.onChange(!props.checked)}
        class="relative flex h-[44px] w-[68px] shrink-0 items-center"
        data-checked={props.checked ? "" : undefined}
      >
        <span
          class="relative block h-[28px] w-[64px] rounded-full transition-colors duration-200 ease-out"
          classList={{ "bg-accent": props.checked, "bg-border": !props.checked }}
        >
          <span
            class="absolute left-[2px] top-[2px] h-[24px] w-[38px] rounded-full bg-ink shadow-sm transition-transform duration-200 ease-out"
            classList={{ "translate-x-[22px]": props.checked }}
          />
        </span>
      </button>
    </Show>
  );
}
