// UI slot registry. Plugins (via ctx.ui.mount) can replace or extend named
// slots in the app chrome — e.g. the bottom nav (nav.bottom) or desktop rail
// (nav.side). The shell reads these and falls back to its built-in component
// when a slot is unset. Values are Solid component functions.

import { createSignal, type JSX } from "solid-js";

export type PluginComponent = (props: Record<string, unknown>) => JSX.Element;

export type UiSlot =
  | "nav.bottom"
  | "nav.side"
  | "header.actions"
  | "dialog";

const slots = new Map<UiSlot, { pluginId: string; component: PluginComponent }>();
const [version, bump] = createSignal(0);

/** Register a component for a slot (called by the plugin SDK). */
export function mountSlot(slot: UiSlot, pluginId: string, component: PluginComponent): void {
  slots.set(slot, { pluginId, component });
  bump((v) => v + 1);
}

/** Remove a plugin's contributions (on reload/uninstall). */
export function clearPluginSlots(pluginId: string): void {
  for (const [slot, entry] of slots) {
    if (entry.pluginId === pluginId) slots.delete(slot);
  }
  bump((v) => v + 1);
}

/** Reactive read of the component registered for a slot, if any. */
export function slotComponent(slot: UiSlot): PluginComponent | undefined {
  version();
  return slots.get(slot)?.component;
}

export function mountedSlots(): UiSlot[] {
  return [...slots.keys()];
}

// ---------- config screens ----------
//
// A plugin may register a configuration screen (a Solid component) that the
// app shows when the user taps the sliders button on the plugin's row in the
// Plugins screen. The component receives { plugin, onClose }.

export type ConfigScreenComponent = (props: {
  plugin: { id: string; name: string };
  onClose: () => void;
}) => JSX.Element;

const configScreens = new Map<string, ConfigScreenComponent>();

/** Register a config screen for a plugin (called by the SDK). */
export function registerConfigScreen(pluginId: string, component: ConfigScreenComponent): void {
  configScreens.set(pluginId, component);
  bump((v) => v + 1);
}

/** Remove a plugin's config screen (on reload/uninstall). */
export function clearPluginConfig(pluginId: string): void {
  if (configScreens.delete(pluginId)) bump((v) => v + 1);
}

/** Whether the plugin provides a config screen. */
export function hasConfigScreen(pluginId: string): boolean {
  version();
  return configScreens.has(pluginId);
}

/** The plugin's config screen component, if any. */
export function getConfigScreen(pluginId: string): ConfigScreenComponent | undefined {
  version();
  return configScreens.get(pluginId);
}
