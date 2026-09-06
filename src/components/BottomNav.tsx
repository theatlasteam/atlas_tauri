import { useLocation, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { BottomNav as UiBottomNav } from "@atlas/ui";
import { NAV_TABS } from "../lib/nav";
import { t } from "../lib/i18n";
import { slotComponent, renderSlotComponent } from "../plugins/ui-slots";

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const pluginSlot = () => slotComponent("nav.bottom");

  return (
    <Show
      when={!pluginSlot()}
      fallback={
        <div class="vt-nav pointer-events-auto">
          {renderSlotComponent(pluginSlot()!, {
            get navigate() {
              return (to: string) => navigate(to);
            },
            get pathname() {
              return location.pathname;
            },
          })}
        </div>
      }
    >
      <UiBottomNav
        class="vt-nav fixed inset-x-0 bottom-0 z-30"
        items={NAV_TABS.map((tab) => ({
          id: tab.href,
          label: t(tab.labelKey),
          icon: <tab.icon size={22} />,
          active: tab.match(location.pathname),
          onClick: () => navigate(tab.href),
        }))}
      />
    </Show>
  );
}
