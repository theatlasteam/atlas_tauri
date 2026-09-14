import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import CompassList from "../screens/CompassList";
import CompassChat from "../screens/CompassChat";
import { useIsDesktopLayout } from "../lib/platform";

export default function CompassLayout() {
  const params = useParams<{ id?: string }>();
  const isDesktop = useIsDesktopLayout();
  return (
    <Show
      when={isDesktop()}
      fallback={
        <Show when={params.id} fallback={<CompassList />}>
          <CompassChat />
        </Show>
      }
    >
      <div class="flex h-full min-w-0">
        <div class="w-[min(320px,36vw)] min-w-[260px] shrink-0 border-r border-border">
          <CompassList />
        </div>
        <div class="min-w-0 flex-1">
          <Show when={params.id} fallback={<CompassChat />}>
            <CompassChat />
          </Show>
        </div>
      </div>
    </Show>
  );
}
