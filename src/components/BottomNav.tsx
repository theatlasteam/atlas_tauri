import { For, Show } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { NAV_TABS } from "../lib/nav";
import AnimatedNavIcon, { playNavIcon } from "./AnimatedNavIcon";
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
      <nav
        class="vt-nav z-30 flex shrink-0 items-stretch justify-around border-t border-border bg-surface/90 px-2 pt-1 backdrop-blur-md"
        style={{ "padding-bottom": "max(var(--safe-bottom), 0.35rem)" }}
      >
        <For each={NAV_TABS}>
          {(tab) => {
            const active = () => tab.match(location.pathname);
            return (
              <button
                type="button"
                class="flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition"
                classList={{
                  "text-accent": active(),
                  "text-ink-subtle hover:text-ink": !active(),
                }}
                onClick={() => {
                  playNavIcon(tab.iconName);
                  navigate(tab.href);
                }}
              >
                <span class="grid h-7 w-7 place-items-center overflow-visible">
                  <AnimatedNavIcon name={tab.iconName} size={22} />
                </span>
                {t(tab.labelKey)}
              </button>
            );
          }}
        </For>
      </nav>
    </Show>
  );
}
