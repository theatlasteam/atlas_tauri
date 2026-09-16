import { For, Show, createSignal, onMount } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { Button, TextField, TextArea, Dialog } from "@atlas/ui";
import { mindsStore } from "../store/minds";
import Appbar from "../components/Appbar";
import MindOrb from "../components/MindOrb";
import EmptyState from "../components/EmptyState";
import AnimatedList from "../ui/AnimatedList";
import { CheckIcon, PlusIcon, TrashIcon, UsersIcon } from "../icons";
import { t } from "../lib/i18n";
import { MAX_MINDS, MAX_ROOM_MINDS, personalitySummary, roomRoster } from "../lib/minds";
import { formatRelativeTime } from "../lib/time";

/**
 * Atlas X — Compass Minds. Two lists in one screen: the Minds you've made
 * (people) and the rooms they're in (conversations). They're separate things —
 * a Mind exists on its own and can be in many rooms — but there's no point in
 * a Mind you never put anywhere, so both live here.
 *
 * Gated on `session.user().atlasX`; the server enforces the same thing on
 * every route, this just avoids showing a screen that can only fail.
 */
export default function Minds() {
  const navigate = useNavigate();
  const [creating, setCreating] = createSignal(false);
  const [picking, setPicking] = createSignal(false);
  const [selected, setSelected] = createSignal<string[]>([]);
  const [roomTitle, setRoomTitle] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  onMount(() => {
    void mindsStore.refresh();
  });

  const allowed = () => mindsStore.hasAccess();
  const minds = () => mindsStore.state.minds ?? [];
  const rooms = () => mindsStore.state.rooms ?? [];
  const loading = () => mindsStore.state.minds === null;

  const toggleSelected = (id: string) => {
    setSelected((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      // Cap reached: swap the oldest pick out rather than silently ignoring
      // the tap, which reads as a broken button.
      if (list.length >= MAX_ROOM_MINDS) return [...list.slice(1), id];
      return [...list, id];
    });
  };

  const startRoom = async () => {
    const ids = selected();
    if (ids.length === 0 || busy()) return;
    setBusy(true);
    try {
      const room = await mindsStore.createRoom(ids, roomTitle());
      setPicking(false);
      setSelected([]);
      setRoomTitle("");
      navigate(`/minds/${room.id}`);
    } catch {
      /* the store keeps the error; the dialog stays open so it's visible */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex h-full flex-col">
      <Appbar
        title={t("minds.title")}
        actions={
          <Show when={allowed() && minds().length > 0}>
            <button
              type="button"
              onClick={() => setPicking(true)}
              class="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
              aria-label={t("minds.newRoomAria")}
            >
              <UsersIcon size={21} />
            </button>
          </Show>
        }
      />

      <Show
        when={allowed()}
        fallback={
          <div class="flex min-h-0 flex-1 items-center justify-center p-6">
            <EmptyState icon={UsersIcon} title={t("minds.lockedTitle")} subtitle={t("minds.lockedBody")} />
          </div>
        }
      >
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-28">
          <p class="pb-5 pt-1 text-sm text-ink-muted">{t("minds.intro")}</p>

          <Show when={mindsStore.state.error}>
            <p class="mb-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
              {mindsStore.state.error}
            </p>
          </Show>

          {/* ---- Minds ---- */}
          <section class="mb-7">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                {t("minds.people")}
              </h2>
              <Show when={minds().length < MAX_MINDS}>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  class="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
                >
                  <PlusIcon size={14} />
                  {t("minds.newMind")}
                </button>
              </Show>
            </div>

            <Show
              when={minds().length > 0}
              fallback={
                <Show when={!loading()}>
                  <EmptyState
                    icon={UsersIcon}
                    title={t("minds.noMindsTitle")}
                    subtitle={t("minds.noMindsBody")}
                    action={
                      <Button size="sm" onClick={() => setCreating(true)}>
                        {t("minds.create")}
                      </Button>
                    }
                  />
                </Show>
              }
            >
              <ul class="flex flex-col gap-2">
                <AnimatedList>
                  <For each={minds()}>
                    {(mind) => (
                      <li>
                        <MindRow
                          mindId={mind.id}
                          onDeleted={() => void mindsStore.refresh()}
                        />
                      </li>
                    )}
                  </For>
                </AnimatedList>
              </ul>
            </Show>
          </section>

          {/* ---- Rooms ---- */}
          <section>
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              {t("minds.rooms")}
            </h2>
            <Show
              when={rooms().length > 0}
              fallback={
                <Show when={!loading()}>
                  <EmptyState
                    icon={UsersIcon}
                    title={t("minds.noRoomsTitle")}
                    subtitle={t("minds.noRoomsBody")}
                  />
                </Show>
              }
            >
              <ul class="flex flex-col gap-2">
                <AnimatedList>
                  <For each={rooms()}>
                    {(room) => (
                      <li class="group flex items-center gap-1 rounded-2xl border border-border bg-surface">
                        <A
                          href={`/minds/${room.id}`}
                          class="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3"
                        >
                          <span class="flex shrink-0 -space-x-2">
                            <For each={room.minds.slice(0, 3)}>
                              {(m) => (
                                <span class="rounded-full ring-2 ring-surface">
                                  <MindOrb color={m.color} colorEnd={m.colorEnd} size={30} />
                                </span>
                              )}
                            </For>
                          </span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate font-semibold text-ink">{room.title}</span>
                            <span class="block truncate text-sm text-ink-muted">
                              {roomRoster(room) || t("minds.noMindsTitle")}
                            </span>
                          </span>
                          <span class="shrink-0 text-xs text-ink-subtle">
                            {formatRelativeTime(room.createdAt)}
                          </span>
                        </A>
                        <button
                          type="button"
                          class="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-bg hover:text-danger"
                          aria-label={t("minds.deleteRoomAria")}
                          onClick={async () => {
                            if (!confirm(t("minds.deleteRoomConfirm"))) return;
                            await mindsStore.deleteRoom(room.id);
                          }}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </li>
                    )}
                  </For>
                </AnimatedList>
              </ul>
            </Show>
          </section>
        </div>
      </Show>

      <MindEditor
        open={creating()}
        onClose={() => setCreating(false)}
        onCreate={async (name, prompt) => {
          await mindsStore.createMind(name, prompt);
          setCreating(false);
        }}
      />

      {/* Room picker */}
      <Dialog
        open={picking()}
        onOpenChange={(o) => !o && setPicking(false)}
        title={t("minds.newRoom")}
        description={t("minds.pickMindsHint")}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
              {t("minds.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={selected().length === 0 || busy()}
              loading={busy()}
              onClick={() => void startRoom()}
            >
              {t("minds.createRoom")}
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-3">
          <TextField
            label={t("minds.roomTitleLabel")}
            placeholder={t("minds.roomTitlePlaceholder")}
            value={roomTitle()}
            onInput={(e) => setRoomTitle(e.currentTarget.value)}
          />
          <p class="text-sm font-medium text-ink">{t("minds.pickMinds")}</p>
          <div class="flex flex-col gap-1.5">
            <For each={minds()}>
              {(mind) => {
                const on = () => selected().includes(mind.id);
                return (
                  <button
                    type="button"
                    onClick={() => toggleSelected(mind.id)}
                    class="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-left transition"
                    classList={{
                      "border-accent bg-accent-soft": on(),
                      "border-border bg-surface hover:bg-bg": !on(),
                    }}
                  >
                    <MindOrb color={mind.color} colorEnd={mind.colorEnd} size={28} />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-ink">{mind.name}</span>
                      <span class="block truncate text-xs text-ink-subtle">
                        {personalitySummary(mind.prompt, "")}
                      </span>
                    </span>
                    <Show when={on()}>
                      <CheckIcon size={16} class="shrink-0 text-accent" />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
          <Show when={selected().length > 0}>
            <p class="text-xs text-ink-subtle">{t("minds.selected", { n: selected().length })}</p>
          </Show>
        </div>
      </Dialog>
    </div>
  );
}

/** One Mind row — the orb, its name, its personality, and edit/delete. */
function MindRow(props: { mindId: string; onDeleted: () => void }) {
  const [editing, setEditing] = createSignal(false);

  const mind = () => mindsStore.state.minds?.find((m) => m.id === props.mindId);

  return (
    <Show when={mind()}>
      {(m) => (
        <div class="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5">
          <A href={`/minds/${m().id}`} class="flex min-w-0 flex-1 items-center gap-3">
            <MindOrb color={m().color} colorEnd={m().colorEnd} size={38} sleeping={!m().isActive} />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-ink">{m().name}</p>
              <p class="truncate text-xs text-ink-subtle">{personalitySummary(m().prompt, "")}</p>
            </div>
          </A>
          <button
            type="button"
            onClick={() => setEditing(true)}
            class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-ink-muted hover:bg-bg hover:text-ink"
          >
            {t("minds.edit")}
          </button>
          <button
            type="button"
            aria-label={t("minds.deleteAria")}
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:bg-bg hover:text-danger"
            onClick={async () => {
              if (!confirm(t("minds.deleteConfirm", { name: m().name }))) return;
              await mindsStore.deleteMind(m().id);
              props.onDeleted();
            }}
          >
            <TrashIcon size={15} />
          </button>

          <MindEditor
            open={editing()}
            initial={m()}
            onClose={() => setEditing(false)}
            onCreate={async (name, prompt) => {
              await mindsStore.updateMind(m().id, name, prompt);
              setEditing(false);
            }}
          />
        </div>
      )}
    </Show>
  );
}

/**
 * Create/edit dialog. Shared by both modes because they're the same two
 * fields — the only difference is the title and whether a Mind already exists.
 */
function MindEditor(props: {
  open: boolean;
  initial?: { name: string; prompt: string };
  onClose: () => void;
  onCreate: (name: string, prompt: string) => Promise<void>;
}) {
  const [name, setName] = createSignal("");
  const [prompt, setPrompt] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  // Seed from `initial` each time it opens, so reopening after an edit shows
  // the current values rather than whatever was left from last time.
  const seed = () => {
    setName(props.initial?.name ?? "");
    setPrompt(props.initial?.prompt ?? "");
    setError(null);
  };

  const submit = async () => {
    if (!name().trim()) {
      setError(t("minds.errorName"));
      return;
    }
    setSaving(true);
    try {
      await props.onCreate(name(), prompt());
    } catch (e) {
      setError(e instanceof Error ? e.message : t("minds.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => {
        if (o) seed();
        else props.onClose();
      }}
      title={props.initial ? t("minds.editTitle") : t("minds.createTitle")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("minds.cancel")}
          </Button>
          <Button size="sm" loading={saving()} onClick={() => void submit()}>
            {props.initial ? t("minds.save") : t("minds.create")}
          </Button>
        </>
      }
    >
      <div class="flex flex-col gap-3">
        <TextField
          label={t("minds.nameLabel")}
          placeholder={t("minds.namePlaceholder")}
          value={name()}
          maxLength={40}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
        />
        <TextArea
          label={t("minds.promptLabel")}
          placeholder={t("minds.promptPlaceholder")}
          hint={t("minds.promptHint")}
          value={prompt()}
          maxLength={2000}
          onInput={(e) => setPrompt(e.currentTarget.value)}
        />
        <Show when={error()}>
          <p class="text-xs text-danger">{error()}</p>
        </Show>
      </div>
    </Dialog>
  );
}
