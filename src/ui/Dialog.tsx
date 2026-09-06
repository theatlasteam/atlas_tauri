import { Show, type JSX } from "solid-js";
import { Dialog as UiDialog } from "@atlas/ui";
import { renderSlotComponent, slotComponent } from "../plugins/ui-slots";

export default function Dialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: JSX.Element;
}) {
  const plugin = () => slotComponent("dialog");

  const pluginComp = () =>
    plugin()
      ? renderSlotComponent(plugin()!, {
          get title() {
            return props.title;
          },
          get open() {
            return props.open;
          },
          get onOpenChange() {
            return props.onOpenChange;
          },
          get children() {
            return props.children;
          },
        })
      : undefined;

  return (
    <Show when={plugin()} fallback={<UiDialog open={props.open} onOpenChange={props.onOpenChange} title={props.title}>{props.children}</UiDialog>}>
      {pluginComp()}
    </Show>
  );
}
