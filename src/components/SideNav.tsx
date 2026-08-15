import { Show } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { NAV_TABS } from "../lib/nav";
import { t } from "../lib/i18n";
import { slotComponent, renderSlotComponent } from "../plugins/ui-slots";

/** Desktop counterpart to BottomNav: a persistent icon rail docked to the far
 *  left. A plugin may replace it entirely via the `nav.side` UI slot. */
export default function SideNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const pluginSlot = () => slotComponent("nav.side");

  return (
    <nav class="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4">
      <Show
        when={!pluginSlot()}
        fallback={
          <div class="flex h-full w-full flex-col items-center gap-1">
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
        <>
          {NAV_TABS.map((tab) => {
            const active = () => tab.match(location.pathname);
            return (
              <A
                href={tab.href}
                title={t(tab.labelKey)}
                class="flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-150 ease-out hover:bg-accent-soft"
                classList={{
                  "bg-accent text-accent-ink hover:bg-accent": active(),
                  "text-ink-muted": !active(),
                }}
              >
                <tab.icon size={22} class="shrink-0" />
              </A>
            );
          })}
        </>
      </Show>
    </nav>
  );
}
