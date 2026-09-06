import { Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { Sidebar } from "@atlas/ui";
import { NAV_TABS } from "../lib/nav";
import { t } from "../lib/i18n";
import { slotComponent, renderSlotComponent } from "../plugins/ui-slots";

export default function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const pluginSlot = () => slotComponent("nav.side");

  return (
    <Show
      when={!pluginSlot()}
      fallback={
        <div class="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface">
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
      <Sidebar
        variant="rail"
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
