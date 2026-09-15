import { Show } from "solid-js";
import { useParams } from "@solidjs/router";
import Minds from "../screens/Minds";
import MindRoom from "../screens/MindRoom";
import MindDetail from "../screens/MindDetail";
import { mindsStore } from "../store/minds";
import { useIsDesktopLayout } from "../lib/platform";

/**
 * Two-pane on desktop (list | open room or mind agent dashboard), single pane on mobile.
 */
export default function MindsLayout() {
  const params = useParams<{ id?: string }>();
  const isDesktop = useIsDesktopLayout();

  const isMindAgent = () =>
    params.id ? (mindsStore.state.minds ?? []).some((m) => m.id === params.id) : false;

  const renderActiveView = () => (
    <Show when={isMindAgent()} fallback={<MindRoom />}>
      <MindDetail />
    </Show>
  );

  return (
    <Show
      when={isDesktop()}
      fallback={
        <Show when={params.id} fallback={<Minds />}>
          {renderActiveView()}
        </Show>
      }
    >
      <div class="flex h-full min-w-0">
        <div class="w-[min(340px,36vw)] min-w-[280px] shrink-0 border-r border-border">
          <Minds />
        </div>
        <div class="min-w-0 flex-1">
          <Show when={params.id} fallback={<MindListPlaceholder />}>
            {renderActiveView()}
          </Show>
        </div>
      </div>
    </Show>
  );
}

function MindListPlaceholder() {
  return (
    <div class="flex h-full items-center justify-center p-8 text-center text-sm text-ink-subtle">
      Pick a room, or make a new one.
    </div>
  );
}
