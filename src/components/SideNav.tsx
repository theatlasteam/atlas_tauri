import { A, useLocation } from "@solidjs/router";
import { NAV_TABS } from "../lib/nav";
import { t } from "../lib/i18n";

/** Desktop counterpart to BottomNav: a persistent icon rail docked to the far left. */
export default function SideNav() {
  const location = useLocation();

  return (
    <nav class="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4">
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
    </nav>
  );
}
