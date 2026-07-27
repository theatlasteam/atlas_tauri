import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { NAV_TABS } from "../lib/nav";
import { preferences } from "../store/preferences";
import { t } from "../lib/i18n";
import { SearchIcon } from "../icons";

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const compact = () => preferences.compactNavbar;
  const activeIndex = () => NAV_TABS.findIndex((tab) => tab.match(location.pathname));

  let containerRef: HTMLDivElement | undefined;
  let anchorRect: { left: number; right: number } | null = null;
  const tabRefs: (HTMLAnchorElement | undefined)[] = [];
  const [pillRect, setPillRect] = createSignal({ left: 0, width: 0 });
  const [dragging, setDragging] = createSignal(false);

  const updatePillRect = () => {
    const el = tabRefs[activeIndex()];
    if (el) setPillRect({ left: el.offsetLeft, width: el.offsetWidth });
  };

  createEffect(() => {
    activeIndex();
    compact();
    updatePillRect();
  });

  onMount(() => {
    updatePillRect();
    window.addEventListener("resize", updatePillRect);
    onCleanup(() => window.removeEventListener("resize", updatePillRect));
  });

  const tabAtPoint = (clientX: number) => {
    let nearest = -1;
    let nearestDist = Infinity;
    tabRefs.forEach((el, i) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(clientX - (rect.left + rect.width / 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    return nearest;
  };

  const stretchTo = (clientX: number) => {
    if (!containerRef || !anchorRect) return;
    const bounds = containerRef.getBoundingClientRect();
    const localX = Math.max(0, Math.min(clientX - bounds.left, bounds.width));
    const left = Math.min(anchorRect.left, localX);
    const right = Math.max(anchorRect.right, localX);
    setPillRect({ left, width: right - left });
  };

  const onPointerDown = (e: PointerEvent) => {
    if (compact()) return;
    const el = tabRefs[activeIndex()];
    anchorRect = el ? { left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth } : null;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stretchTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging()) return;
    stretchTo(e.clientX);
  };
  const endDrag = (e: PointerEvent) => {
    if (!dragging()) return;
    setDragging(false);
    anchorRect = null;
    const i = tabAtPoint(e.clientX);
    const tab = i >= 0 ? NAV_TABS[i] : undefined;
    if (tab && !tab.match(location.pathname)) navigate(tab.href);
    else updatePillRect();
  };

  return (
    <nav class="vt-nav pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-center gap-2 px-4 pb-[max(var(--safe-bottom),1rem)]">
      <div
        class="pointer-events-auto flex min-w-0 items-stretch rounded-pill border border-border bg-surface-raised/95 shadow-floating backdrop-blur"
        classList={{ "gap-1 p-1.5": compact(), "w-full max-w-md flex-1 gap-1 p-1": !compact() }}
      >
        <div
          ref={containerRef}
          class="relative flex flex-1 items-stretch"
          classList={{ "gap-1": compact(), "touch-none": !compact() }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <Show when={!compact() && activeIndex() >= 0}>
            <div
              class="absolute inset-y-0 left-0 rounded-full bg-accent"
              classList={{
                "transition-[transform,width] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]": !dragging(),
                "transition-none": dragging(),
              }}
              style={{ transform: `translateX(${pillRect().left}px)`, width: `${pillRect().width}px` }}
            />
          </Show>
          {NAV_TABS.map((tab, i) => {
            const active = () => tab.match(location.pathname);
            return (
              <Show
                when={compact()}
                fallback={
                  <A
                    ref={(el) => (tabRefs[i] = el)}
                    href={tab.href}
                    aria-label={t(tab.labelKey)}
                    class="relative z-10 flex flex-1 flex-col items-center justify-center gap-[2px] text-[12px] font-medium transition-colors duration-200 ease-out active:scale-95"
                    classList={{
                      "text-accent-ink": active(),
                      "text-ink-muted": !active(),
                    }}
                  >
                    <tab.icon size={22} class="shrink-0" />
                    <span class="whitespace-nowrap">{t(tab.labelKey)}</span>
                  </A>
                }
              >
                <A
                  href={tab.href}
                  class="flex items-center gap-2 overflow-hidden rounded-pill px-3.5 text-sm font-medium transition-[background-color,color,transform] duration-200 ease-out active:scale-95"
                  classList={{
                    "bg-accent text-accent-ink": active(),
                    "text-ink-muted hover:text-ink": !active(),
                  }}
                >
                  <tab.icon size={20} class="shrink-0" />
                  <span
                    class="grid transition-[grid-template-columns] duration-200 ease-out"
                    classList={{ "grid-cols-[1fr]": active(), "grid-cols-[0fr]": !active() }}
                  >
                    <span class="overflow-hidden whitespace-nowrap">{t(tab.labelKey)}</span>
                  </span>
                </A>
              </Show>
            );
          })}
        </div>
      </div>

      <A
        href="/new-chat"
        aria-label={t("nav.searchNewChat")}
        class="pointer-events-auto flex shrink-0 self-center rounded-full border border-border bg-surface-raised/95 p-[14px] text-ink-muted shadow-floating backdrop-blur transition-[background-color,color,transform] duration-150 ease-out hover:text-ink active:scale-95"
      >
        <SearchIcon size={20} />
      </A>
    </nav>
  );
}
