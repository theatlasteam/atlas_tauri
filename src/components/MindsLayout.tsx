import { Show, onMount } from "solid-js";
import { useParams } from "@solidjs/router";
import Minds from "../screens/Minds";
import MindRoom from "../screens/MindRoom";
import MindDetail from "../screens/MindDetail";
import { mindsStore } from "../store/minds";
import { useIsDesktopLayout } from "../lib/platform";
import { SpinnerIcon } from "../icons";
import { t } from "../lib/i18n";

/**
 * Two-pane on desktop (list | open room or mind agent dashboard), single pane on mobile.
 */
export default function MindsLayout() {
  const params = useParams<{ id?: string }>();
  const isDesktop = useIsDesktopLayout();

  onMount(() => {
    // A deep link straight at /minds/{id} mounts no list screen, so nobody
    // else loads the directory this gate needs (see below).
    if (!mindsStore.state.minds) void mindsStore.loadMinds();
  });

  const isMindAgent = () =>
    params.id ? (mindsStore.state.minds ?? []).some((m) => m.id === params.id) : false;

  // Until the directory loads, a mind id and a room id are indistinguishable —
  // guessing MindRoom first fires room_messages with a mind id, 404s, and
  // poisons the shared error banner. Wait, then decide.
  const renderActiveView = () => (
    <Show
      when={mindsStore.state.minds !== null}
      fallback={
        <div class="flex h-full items-center justify-center gap-2 p-8 text-sm text-ink-subtle">
          <SpinnerIcon size={16} class="animate-spin" />
          {t("minds.loading")}
        </div>
      }
    >
      <Show when={isMindAgent()} fallback={<MindRoom />}>
        <MindDetail />
      </Show>
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
