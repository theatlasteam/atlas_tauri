import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import BackHeader from "../components/BackHeader";
import Avatar from "../components/Avatar";
import VerifiedBadge from "../components/VerifiedBadge";
import { repository } from "../data/repository";
import { chatsStore } from "../store/chats";
import type { User } from "../data/types";
import { CheckIcon, UsersIcon } from "../icons";

/**
 * Start a conversation: search users, tap one for a DM, or flip to group
 * mode, pick several and name the group.
 */
export default function NewChat() {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<User[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [groupMode, setGroupMode] = createSignal(false);
  const [selected, setSelected] = createSignal<User[]>([]);
  const [groupName, setGroupName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const search = (q: string) => {
    setQuery(q);
    if (searchTimer) clearTimeout(searchTimer);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await repository.searchUsers(q.trim()));
      } finally {
        setSearching(false);
      }
    }, 250);
  };

  const isSelected = (user: User) => selected().some((u) => u.id === user.id);

  const pick = async (user: User) => {
    if (groupMode()) {
      setSelected(isSelected(user) ? selected().filter((u) => u.id !== user.id) : [...selected(), user]);
      return;
    }
    if (busy()) return;
    setBusy(true);
    try {
      const chat = await chatsStore.openDm(user.id);
      navigate(`/chat/${chat.id}`);
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async (e: Event) => {
    e.preventDefault();
    if (busy() || selected().length === 0 || !groupName().trim()) return;
    setBusy(true);
    try {
      const chat = await chatsStore.createGroup(
        groupName().trim(),
        selected().map((u) => u.id),
      );
      navigate(`/chat/${chat.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex h-full flex-col">
      <BackHeader title="New chat" back="/" />

      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-28">
        <input
          autofocus
          value={query()}
          onInput={(e) => search(e.currentTarget.value)}
          placeholder="Search by handle or name"
          autocapitalize="none"
          spellcheck={false}
          class="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink placeholder-ink-subtle outline-none focus:border-accent"
        />

        <button
          type="button"
          onClick={() => setGroupMode(!groupMode())}
          class="flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-ink-muted active:bg-surface"
        >
          <span
            class="flex h-9 w-9 items-center justify-center rounded-full"
            classList={{ "bg-accent text-accent-ink": groupMode(), "bg-accent-soft text-ink": !groupMode() }}
          >
            <UsersIcon size={18} />
          </span>
          {groupMode() ? "Group mode — pick members" : "New group…"}
        </button>

        <Show when={groupMode() && selected().length > 0}>
          <div class="no-scrollbar flex gap-2 overflow-x-auto">
            <For each={selected()}>
              {(user) => (
                <button
                  type="button"
                  onClick={() => pick(user)}
                  class="flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 py-1 text-xs font-medium text-ink"
                >
                  {user.name} ✕
                </button>
              )}
            </For>
          </div>
        </Show>

        <Show
          when={results().length > 0}
          fallback={
            <p class="px-2 py-6 text-center text-sm text-ink-subtle">
              {searching() ? "Searching…" : query().trim().length >= 2 ? "Nobody found" : "Type to search people"}
            </p>
          }
        >
          <ul class="flex flex-col">
            <For each={results()}>
              {(user) => (
                <li>
                  <button
                    type="button"
                    onClick={() => pick(user)}
                    class="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface"
                  >
                    <Avatar
                      color={user.avatarColor}
                      initial={user.avatarInitial}
                      size={36}
                      userId={user.id}
                      hasPhoto={user.hasAvatar}
                    />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center gap-1.5 font-medium text-ink">
                        <span class="truncate">{user.name}</span>
                        <Show when={user.verified}>
                          <VerifiedBadge size={14} name={user.name} />
                        </Show>
                      </span>
                      <span class="block truncate text-xs text-ink-subtle">@{user.handle}</span>
                    </span>
                    <Show when={groupMode() && isSelected(user)}>
                      <CheckIcon size={18} class="text-accent" />
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={groupMode()}>
          <form onSubmit={createGroup} class="flex gap-2">
            <input
              value={groupName()}
              onInput={(e) => setGroupName(e.currentTarget.value)}
              placeholder="Group name"
              class="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink placeholder-ink-subtle outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={busy() || selected().length === 0 || !groupName().trim()}
              class="rounded-pill bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink active:scale-95 disabled:opacity-40"
            >
              Create
            </button>
          </form>
        </Show>
      </div>
    </div>
  );
}
