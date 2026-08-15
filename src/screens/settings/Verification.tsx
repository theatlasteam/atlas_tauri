import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { api } from "../../data/api";
import type { UserDto } from "../../data/generated";
import Appbar from "../../components/Appbar";
import Avatar from "../../components/Avatar";
import EmptyState from "../../components/EmptyState";
import VerifiedBadge from "../../components/VerifiedBadge";
import { SpinnerIcon, VerifiedIcon } from "../../icons";
import { t } from "../../lib/i18n";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Atlas-only screen for granting/removing verified checkmarks. Reached from
 * Settings, where the row is hidden for every other account — the real
 * authorization lives in server/src/routes/users.rs::require_atlas, which
 * gates both the listing and the PATCH.
 */
export default function Verification() {
  const [users, setUsers] = createSignal<UserDto[]>([]);
  const [query, setQuery] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const load = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.listAllUsers(q.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("verification.loadError"));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => void load(""));
  onCleanup(() => clearTimeout(searchTimer));

  const search = (q: string) => {
    setQuery(q);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void load(q), SEARCH_DEBOUNCE_MS);
  };

  const toggle = async (user: UserDto) => {
    setBusyId(user.id);
    setError(null);
    try {
      const updated = await api.setVerified(user.id, !user.verified);
      // Patch in place so the row doesn't jump to a new sort position
      // mid-tap — the order refreshes on the next load.
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("verification.updateError"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div class="flex h-full flex-col">
      <Appbar title={t("verification.title")} back="/settings" sticky />

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-28">
        <input
          value={query()}
          onInput={(e) => search(e.currentTarget.value)}
          placeholder={t("verification.searchPlaceholder")}
          autocapitalize="none"
          spellcheck={false}
          class="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink placeholder-ink-subtle outline-none focus:border-accent"
        />

        <Show when={error()}>
          <p class="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error()}</p>
        </Show>

        <Show
          when={users().length > 0}
          fallback={
            <Show when={!loading()}>
              <EmptyState
                icon={VerifiedIcon}
                title={t("verification.noUsersTitle")}
                subtitle={query().trim() ? t("verification.noUsersSubtitleQuery") : t("verification.noUsersSubtitleEmpty")}
              />
            </Show>
          }
        >
          <div class="divide-y divide-border rounded-2xl border border-border bg-surface">
            <For each={users()}>
              {(user) => (
                <div class="flex items-center gap-3 px-4 py-3">
                  <Avatar
                    color={user.avatarColor}
                    initial={user.avatarInitial}
                    size={40}
                    userId={user.id}
                    hasPhoto={user.hasAvatar}
                  />
                  <div class="min-w-0 flex-1">
                    <p class="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <span class="truncate">{user.name}</span>
                      <Show when={user.verified}>
                        <VerifiedBadge size={14} name={user.name} />
                      </Show>
                    </p>
                    <p class="truncate text-xs text-ink-subtle">@{user.handle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggle(user)}
                    disabled={busyId() === user.id}
                    class="shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50"
                    classList={{
                      "border-border text-ink-muted hover:bg-bg": user.verified,
                      "border-accent text-accent hover:bg-accent-soft": !user.verified,
                    }}
                  >
                    <Show when={busyId() !== user.id} fallback={<SpinnerIcon size={13} class="animate-spin" />}>
                      {user.verified ? t("verification.remove") : t("verification.verify")}
                    </Show>
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={loading()}>
          <p class="flex items-center justify-center gap-2 py-4 text-sm text-ink-subtle">
            <SpinnerIcon size={15} class="animate-spin" />
            {t("verification.loadingUsers")}
          </p>
        </Show>
      </div>
    </div>
  );
}
