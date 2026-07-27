import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import Dialog from "../ui/Dialog";
import Avatar from "./Avatar";
import { api } from "../data/api";
import { toMessage } from "../data/mapping";
import { chatsStore } from "../store/chats";
import { session } from "../store/session";
import type { Message } from "../data/types";
import { formatRelativeTime } from "../lib/time";
import { t } from "../lib/i18n";

/**
 * Server-side search across all my chats (plaintext messages; E2EE bodies are
 * ciphertext to the server by design and can't match here).
 */
export default function MessageSearchDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<Message[]>([]);
  const [searching, setSearching] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const search = (q: string) => {
    setQuery(q);
    if (timer) clearTimeout(timer);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer = setTimeout(async () => {
      setSearching(true);
      try {
        const dtos = await api.searchMessages(q.trim());
        setResults(dtos.map((dto) => toMessage(dto, session.user()?.id ?? "")));
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const open = (message: Message) => {
    props.onOpenChange(false);
    setQuery("");
    setResults([]);
    navigate(`/chat/${message.chatId}`);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title={t("messageSearch.title")}>
      <div class="flex flex-col gap-3">
        <input
          value={query()}
          onInput={(e) => search(e.currentTarget.value)}
          placeholder={t("messageSearch.placeholder")}
          class="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-ink placeholder-ink-subtle outline-none focus:border-accent"
        />
        <div class="max-h-72 overflow-y-auto">
          <Show
            when={results().length > 0}
            fallback={
              <p class="px-2 py-6 text-center text-sm text-ink-subtle">
                {searching() ? t("messageSearch.searching") : query().trim().length >= 2 ? t("messageSearch.noMatches") : t("messageSearch.findAnything")}
              </p>
            }
          >
            <ul class="flex flex-col">
              <For each={results()}>
                {(message) => {
                  const chat = () => chatsStore.chat(message.chatId);
                  return (
                    <li>
                      <button
                        type="button"
                        onClick={() => open(message)}
                        class="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left active:bg-surface"
                      >
                        <Avatar
                          color={chat()?.avatarColor ?? "#94a3b8"}
                          initial={chat()?.avatarInitial ?? "?"}
                          size={36}
                          userId={chat()?.peerUserId}
                          hasPhoto={chat()?.peerHasAvatar}
                        />
                        <span class="min-w-0 flex-1">
                          <span class="flex items-baseline justify-between gap-2">
                            <span class="truncate text-sm font-semibold text-ink">{chat()?.name ?? t("messageSearch.chatFallback")}</span>
                            <span class="shrink-0 text-xs text-ink-subtle">{formatRelativeTime(message.sentAt)}</span>
                          </span>
                          <span class="block truncate text-sm text-ink-muted">{message.text}</span>
                        </span>
                      </button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>
      </div>
    </Dialog>
  );
}
