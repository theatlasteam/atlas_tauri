import { For, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { NAV_TABS } from "../lib/nav";
import AnimatedNavIcon, { playNavIcon } from "./AnimatedNavIcon";
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
      <nav class="sticky top-0 flex h-full min-h-0 w-16 shrink-0 flex-col items-center border-r border-border bg-surface py-3">
        <div class="flex min-h-0 flex-1 flex-col items-center gap-0.5 overflow-y-auto px-2">
          <For each={NAV_TABS}>
            {(tab) => {
              const active = () => tab.match(location.pathname);
              return (
                <button
                  type="button"
                  title={t(tab.labelKey)}
                  class="flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-150 ease-out"
                  classList={{
                    "bg-accent text-accent-ink": active(),
                    "text-ink-muted hover:bg-accent-soft hover:text-ink": !active(),
                  }}
                  onClick={() => {
                    playNavIcon(tab.iconName);
                    navigate(tab.href);
                  }}
                >
                  <AnimatedNavIcon name={tab.iconName} size={22} />
                </button>
              );
            }}
          </For>
        </div>
      </nav>
    </Show>
  );
}
