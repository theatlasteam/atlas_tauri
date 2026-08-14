declare module "babel-plugin-jsx-dom-expressions" {
  import type { PluginObj } from "@babel/core";
  const plugin: PluginObj | ((api: unknown, options: Record<string, unknown>) => PluginObj) | (() => unknown);
  export default plugin;
}
