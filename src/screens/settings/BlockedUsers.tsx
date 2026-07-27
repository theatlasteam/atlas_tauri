import { For, Show, createSignal, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { blocksStore } from "../../store/blocks";
import BackHeader from "../../components/BackHeader";
import Avatar from "../../components/Avatar";
import EmptyState from "../../components/EmptyState";
import { ProhibitIcon, SpinnerIcon } from "../../icons";
import { t } from "../../lib/i18n";

export default function BlockedUsers() {
  const [busyId, setBusyId] = createSignal<string | null>(null);

  onMount(() => {
    void blocksStore.refresh();
  });

  const unblock = async (userId: string) => {
    setBusyId(userId);
    try {
      await blocksStore.unblock(userId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <BackHeader title={t("blockedUsers.title")} back="/settings/privacy" />

      <Show
        when={blocksStore.state.blocks.length > 0}
        fallback={
          <Show when={blocksStore.state.loaded}>
            <EmptyState icon={ProhibitIcon} title={t("blockedUsers.noneTitle")} subtitle={t("blockedUsers.noneSubtitle")} />
          </Show>
        }
      >
        <div class="px-5">
          <div class="divide-y divide-border rounded-2xl border border-border bg-surface">
            <For each={blocksStore.state.blocks}>
              {(b) => (
                <div class="flex items-center gap-3 px-4 py-3">
                  <A href={`/user/${b.user.id}`} class="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar
                      color={b.user.avatarColor}
                      initial={b.user.avatarInitial}
                      size={40}
                      userId={b.user.id}
                      hasPhoto={b.user.hasAvatar}
                    />
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-ink">{b.user.name}</p>
                      <p class="truncate text-xs text-ink-subtle">@{b.user.handle}</p>
                    </div>
                  </A>
                  <button
                    type="button"
                    onClick={() => void unblock(b.user.id)}
                    disabled={busyId() === b.user.id}
                    class="shrink-0 rounded-pill border border-border px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:bg-bg disabled:opacity-50"
                  >
                    <Show when={busyId() !== b.user.id} fallback={<SpinnerIcon size={13} class="animate-spin" />}>
                      {t("blockedUsers.unblock")}
                    </Show>
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
