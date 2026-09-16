import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Button, Composer, Dialog, TextArea, TextField } from "@atlas/ui";
import { mindsStore } from "../store/minds";
import { preferences } from "../store/preferences";
import { session } from "../store/session";
import type { Message } from "../data/types";
import MessageBubble from "../components/MessageBubble";
import MindOrb from "../components/MindOrb";
import MarkdownContent from "../components/MarkdownContent";
import MindTool from "../components/MindTool";
import { ArrowDownIcon, BackIcon, PlusIcon, SettingsIcon, SpinnerIcon, TrashIcon } from "../icons";
import { t, type TranslationKey } from "../lib/i18n";
import { useIsDesktopLayout } from "../lib/platform";
import { MIND_PALETTE, darkenColor } from "../lib/minds";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ name: string; arguments: any; output: string }>;
  status?: string;
  time: string;
}

/** Tools worth showing in the activity drawer. `say` is excluded — its note
 *  already streams into the chat as a bubble, so listing it again (with its
 *  "shown in chat." receipt) is pure noise. */
function visibleTools(msg: { toolCalls?: ChatTurn["toolCalls"] }): NonNullable<ChatTurn["toolCalls"]> {
  return (msg.toolCalls ?? []).filter((tc) => tc.name !== "say");
}

/**
 * A 1:1 Mind chat — deliberately the same screen as ChatView (same header,
 * same message column, same composer), backed by the Mind's run history
 * instead of the messages table. Runs stream: `say` notes land as bubbles
 * in real time and the header subtitle shows live status (typing, browsing,
 * working in the sandbox…) until the final answer arrives.
 */
export default function MindDetail() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();

  const [draft, setDraft] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [pendingInput, setPendingInput] = createSignal<string | null>(null);
  const [atBottom, setAtBottom] = createSignal(true);
  const [showSettings, setShowSettings] = createSignal(false);
  const [addingSchedule, setAddingSchedule] = createSignal(false);

  // Schedule modal form
  const [schedLabel, setSchedLabel] = createSignal("");
  const [schedCron, setSchedCron] = createSignal("0 9 * * *");
  const [schedTask, setSchedTask] = createSignal("");
  const [schedSaving, setSchedSaving] = createSignal(false);

  const [editName, setEditName] = createSignal("");
  const [editPrompt, setEditPrompt] = createSignal("");
  const [editColor, setEditColor] = createSignal(MIND_PALETTE[0].color);
  const [editColorEnd, setEditColorEnd] = createSignal(MIND_PALETTE[0].colorEnd);
  const [savingProfile, setSavingProfile] = createSignal(false);

  const openSettings = () => {
    const m = mind();
    if (m) {
      setEditName(m.name);
      setEditPrompt(m.prompt);
      setEditColor(m.color);
      setEditColorEnd(m.colorEnd);
    }
    setShowSettings(true);
  };

  const saveMindProfile = async () => {
    const m = mind();
    if (!m || !editName().trim()) return;
    setSavingProfile(true);
    try {
      await mindsStore.updateMind(m.id, editName(), editPrompt(), {
        color: editColor(),
        colorEnd: editColorEnd(),
      });
      setShowSettings(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const deleteThisMind = async () => {
    const m = mind();
    if (!m) return;
    if (!confirm(t("minds.deleteConfirm", { name: m.name }))) return;
    await mindsStore.deleteMind(m.id);
    navigate("/minds", { replace: true });
  };

  let scrollRef: HTMLDivElement | undefined;
  let abort: AbortController | null = null;

  const mind = () => mindsStore.state.minds?.find((m) => m.id === params.id);
  const runs = () => mindsStore.state.runs[params.id] ?? [];
  const schedules = () => mindsStore.state.schedules[params.id] ?? [];
  const live = () => mindsStore.state.live[params.id];

  onMount(() => {
    if (!mindsStore.state.minds) void mindsStore.loadMinds();
    void mindsStore.loadRuns(params.id);
    void mindsStore.loadSchedules(params.id);
  });

  onCleanup(() => {
    abort?.abort();
    if (params.id) mindsStore.clearLive(params.id);
  });

  // A Mind deleted elsewhere has nothing to show.
  createEffect(() => {
    if (mindsStore.state.minds && !mind() && !running()) navigate("/minds", { replace: true });
  });

  const scrollToBottom = (smooth = true) => {
    scrollRef?.scrollTo({ top: scrollRef.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  const handleScroll = () => {
    if (!scrollRef) return;
    const distanceFromBottom = scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight;
    setAtBottom(distanceFromBottom < 80);
  };

  // Stick to bottom as streamed notes and the final answer land (if there).
  createEffect(
    on(
      () => runs().length + (live()?.events.length ?? 0) + (pendingInput() ? 1 : 0),
      (len, prevLen) => {
        if (prevLen !== undefined && len > prevLen && atBottom()) {
          queueMicrotask(() => scrollToBottom());
        }
      },
    ),
  );

  // Convert persisted runs into a conversational timeline, oldest first.
  const feedMessages = () => {
    const list: Array<Message & { toolCalls?: ChatTurn["toolCalls"] }> = [];
    const sortedRuns = [...runs()].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
    const userId = session.user()?.id ?? "me";
    const mindId = params.id;
    for (const r of sortedRuns) {
      if (r.input) {
        list.push({
          id: `${r.id}-user`,
          chatId: mindId,
          authorId: userId,
          text: r.input,
          scheme: "plain",
          sentAt: r.startedAt,
          mine: true,
          reactions: [],
        });
      }
      if (r.output || (r.toolCalls && r.toolCalls.length > 0)) {
        list.push({
          id: `${r.id}-asst`,
          chatId: mindId,
          authorId: mindId,
          text: r.output || (r.status === "error" ? t("minds.runFailed") : t("minds.taskCompleted")),
          scheme: "plain",
          sentAt: r.finishedAt || r.startedAt,
          mine: false,
          reactions: [],
          toolCalls: r.toolCalls,
        });
      }
    }
    return list;
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? draft()).trim();
    if (!text || running()) return;
    setDraft("");
    setPendingInput(text);
    setRunning(true);
    queueMicrotask(() => scrollToBottom());
    abort = new AbortController();
    try {
      await mindsStore.runMindLive(params.id, text, { signal: abort.signal });
    } catch {
      /* the store surfaces the error; the input stays visible for a retry */
    } finally {
      abort = null;
      setPendingInput(null);
      setRunning(false);
    }
  };

  const saveSchedule = async () => {
    if (!schedLabel().trim() || !schedCron().trim() || schedSaving()) return;
    setSchedSaving(true);
    try {
      await mindsStore.createSchedule(params.id, {
        label: schedLabel().trim(),
        cronExpr: schedCron().trim(),
        task: schedTask().trim(),
      });
      setAddingSchedule(false);
      setSchedLabel("");
      setSchedCron("0 9 * * *");
      setSchedTask("");
    } finally {
      setSchedSaving(false);
    }
  };

  const toggleTool = async (toolKey: string, current: boolean) => {
    const m = mind();
    if (!m) return;
    const tools = { ...(m.tools || {}), [toolKey]: !current };
    await mindsStore.updateMind(m.id, m.name, m.prompt, { tools });
  };

  const toggleActive = async () => {
    const m = mind();
    if (!m) return;
    await mindsStore.updateMind(m.id, m.name, m.prompt, { isActive: !m.isActive });
  };


  /** Header subtitle: live status beats schedule summary — same precedence as
   *  ChatView's typing-beats-presence subtitle. */
  const subtitle = () => {    const l = live();
    if (l) return l.status;
    const m = mind();
    if (!m) return "";
    return m.isActive
      ? `${t("minds.sandboxActive")} · ${t("minds.schedulesActive", { n: schedules().filter((s) => s.enabled).length })}`
      : t("minds.mindPaused");
  };

  const TOOLS: { key: string; nameKey: TranslationKey; descKey: TranslationKey }[] = [    { key: "browser", nameKey: "minds.toolBrowser", descKey: "minds.toolBrowserDesc" },
    { key: "web_fetch", nameKey: "minds.toolFetch", descKey: "minds.toolFetchDesc" },
    { key: "shell", nameKey: "minds.toolShell", descKey: "minds.toolShellDesc" },
    { key: "set_schedule", nameKey: "minds.toolSchedule", descKey: "minds.toolScheduleDesc" },
    { key: "message_owner", nameKey: "minds.toolMessage", descKey: "minds.toolMessageDesc" },
  ];

  return (
    <div class="relative flex h-full flex-col">
      <Show
        when={!showSettings()}
        fallback={
          <div class="flex h-full flex-col overflow-hidden bg-bg">
            <header class="flex shrink-0 items-center justify-between border-b border-border bg-appbar px-4 pb-3 pt-[max(var(--safe-top),1.5rem)]">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                aria-label={t("profile.cancel")}
              >
                <BackIcon size={22} />
              </button>
              <h1 class="font-heading text-lg font-bold text-ink">
                {t("minds.editTitle")}
              </h1>
              <button
                type="button"
                onClick={() => void saveMindProfile()}
                disabled={savingProfile() || !editName().trim()}
                class="min-h-11 rounded-pill px-3 text-sm font-semibold text-accent transition active:opacity-60 disabled:opacity-40"
              >
                <Show when={!savingProfile()} fallback={<SpinnerIcon size={16} class="animate-spin" />}>
                  {t("minds.save")}
                </Show>
              </button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28">
              <div class="mx-auto flex max-w-lg flex-col items-center gap-3 px-5 pt-4">
                {/* Hero Avatar with glow blur */}
                <div class="relative mt-2">
                  <div
                    class="absolute inset-0 -z-10 rounded-full opacity-40 blur-2xl transition-all duration-300"
                    style={{
                      background: `linear-gradient(180deg, ${editColor()}, ${editColorEnd()})`,
                    }}
                  />
                  <MindOrb
                    color={editColor()}
                    colorEnd={editColorEnd()}
                    size={96}
                    thinking={running()}
                    sleeping={!mind()?.isActive}
                  />
                </div>

                {/* Name & status */}
                <div class="mt-1 text-center">
                  <h2 class="text-xl font-bold text-ink">{editName() || mind()?.name}</h2>
                  <p class="text-sm text-ink-subtle">@mind · Compass</p>
                  <div class="mt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleActive()}
                      class="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium transition active:scale-95"
                      classList={{
                        "bg-success/10 text-success": mind()?.isActive,
                        "bg-ink-subtle/10 text-ink-subtle": !mind()?.isActive,
                      }}
                    >
                      <span
                        class="h-1.5 w-1.5 rounded-full"
                        classList={{
                          "bg-success": mind()?.isActive,
                          "bg-ink-subtle": !mind()?.isActive,
                        }}
                      />
                      {mind()?.isActive ? t("minds.autonomousActive") : t("minds.mindPaused")}
                    </button>
                  </div>
                </div>

                {/* Main Card: Name, Personality (Bio), and Color */}
                <div class="mt-4 w-full overflow-hidden rounded-2xl border border-border bg-surface">
                  <div class="p-4">
                    <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                      {t("minds.nameLabel")}
                    </h3>
                    <input
                      type="text"
                      value={editName()}
                      onInput={(e) => setEditName(e.currentTarget.value)}
                      placeholder={t("minds.namePlaceholder")}
                      maxLength={40}
                      class="w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                    />
                  </div>

                  <div class="border-t border-border p-4">
                    <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                      {t("minds.promptLabel")}
                    </h3>
                    <textarea
                      rows={4}
                      value={editPrompt()}
                      onInput={(e) => setEditPrompt(e.currentTarget.value)}
                      placeholder={t("minds.promptPlaceholder")}
                      maxLength={2000}
                      class="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-accent"
                    />
                    <p class="mt-1 text-[11px] text-ink-subtle">{t("minds.promptHint")}</p>
                  </div>

                  <div class="border-t border-border p-4">
                    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                      {t("minds.colorLabel")}
                    </h3>
                    <div class="flex flex-wrap items-center gap-2.5">
                      <For each={MIND_PALETTE}>
                        {(p) => {
                          const isSelected = () => editColor().toLowerCase() === p.color.toLowerCase();
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setEditColor(p.color);
                                setEditColorEnd(p.colorEnd);
                              }}
                              class="relative h-7 w-7 rounded-full transition-transform active:scale-90"
                              style={{
                                background: `linear-gradient(180deg, ${p.color}, ${p.colorEnd})`,
                              }}
                              aria-label={p.color}
                            >
                              <Show when={isSelected()}>
                                <span class="absolute inset-0 rounded-full ring-2 ring-accent ring-offset-2 ring-offset-surface" />
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                      <label
                        class="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-ink-muted transition hover:border-accent hover:text-accent active:scale-90"
                        title={t("minds.colorCustom")}
                      >
                        <input
                          type="color"
                          value={editColor()}
                          onInput={(e) => {
                            const val = e.currentTarget.value;
                            setEditColor(val);
                            setEditColorEnd(darkenColor(val));
                          }}
                          class="absolute inset-0 cursor-pointer opacity-0 w-full h-full"
                        />
                        <span class="text-xs font-bold leading-none">+</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Schedules Card */}
                <div class="mt-2 w-full overflow-hidden rounded-2xl border border-border bg-surface p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                        {t("minds.schedulesTitle", { n: schedules().length })}
                      </h3>
                      <p class="text-xs text-ink-muted">{t("minds.schedulesHint")}</p>
                    </div>
                    <Button size="sm" onClick={() => setAddingSchedule(true)}>
                      <PlusIcon size={14} class="mr-1 inline" />
                      {t("minds.add")}
                    </Button>
                  </div>

                  <Show
                    when={schedules().length > 0}
                    fallback={
                      <div class="mt-3 rounded-xl border border-dashed border-border p-4 text-center text-xs text-ink-muted">
                        {t("minds.noSchedules")}
                      </div>
                    }
                  >
                    <div class="mt-3 flex flex-col gap-2">
                      <For each={schedules()}>
                        {(sched) => (
                          <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg p-3">
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2">
                                <span class="text-xs font-semibold text-ink">{sched.label}</span>
                                <span class="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-medium text-accent">
                                  {sched.cronExpr}
                                </span>
                              </div>
                              <p class="mt-0.5 truncate text-xs text-ink-muted">{sched.task}</p>
                            </div>
                            <div class="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void mindsStore.toggleSchedule(params.id, sched.id)}
                                class="rounded-lg px-2 py-1 text-xs font-medium transition"
                                classList={{
                                  "bg-accent-soft text-accent": sched.enabled,
                                  "bg-surface text-ink-muted": !sched.enabled,
                                }}
                              >
                                {sched.enabled ? t("minds.scheduleActive") : t("minds.schedulePaused")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void mindsStore.deleteSchedule(params.id, sched.id)}
                                class="p-1 text-ink-subtle hover:text-danger"
                              >
                                <TrashIcon size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                {/* Tools Card */}
                <div class="mt-2 w-full overflow-hidden rounded-2xl border border-border bg-surface p-4">
                  <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                    {t("minds.toolsTitle")}
                  </h3>
                  <div class="flex flex-col gap-2.5">
                    <For each={TOOLS}>
                      {(tool) => {
                        const enabled = () => mind()?.tools?.[tool.key] ?? true;
                        return (
                          <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg p-3">
                            <div>
                              <p class="text-xs font-semibold text-ink">{t(tool.nameKey)}</p>
                              <p class="text-[11px] text-ink-muted">{t(tool.descKey)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void toggleTool(tool.key, enabled())}
                              class="flex h-5 w-9 shrink-0 rounded-full transition-colors"
                              classList={{ "bg-accent": enabled(), "bg-border": !enabled() }}
                            >
                              <span
                                class="h-5 w-5 rounded-full bg-white shadow transition-transform"
                                classList={{ "translate-x-4": enabled(), "translate-x-0": !enabled() }}
                              />
                            </button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>

                {/* Actions like UserProfile */}
                <div class="mt-4 flex w-full flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => void toggleActive()}
                    class="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-ink transition active:scale-[0.98]"
                  >
                    {mind()?.isActive ? t("minds.pauseMind") : t("minds.activateMind")}
                  </button>

                  <button
                    type="button"
                    onClick={() => void deleteThisMind()}
                    class="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-danger transition active:scale-[0.98]"
                  >
                    <TrashIcon size={16} />
                    {t("minds.delete")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        }
      >
        <div class="flex h-full flex-col overflow-hidden">
          <header class="flex shrink-0 items-center gap-3 border-b border-border bg-appbar px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
            <Show when={!isDesktop()}>
              <A
                href="/minds"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
              >
                <BackIcon size={22} />
              </A>
            </Show>
            <Show when={mind()}>
              {(m) => (
                <>
                  <button
                    type="button"
                    onClick={() => openSettings()}
                    class="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 text-left transition-colors duration-150 hover:bg-surface active:bg-surface"
                  >
                    <span class="relative shrink-0">
                      <MindOrb color={m().color} colorEnd={m().colorEnd} size={36} thinking={running()} sleeping={!m().isActive && !running()} />
                      <span
                        class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-appbar"
                        classList={{
                          "bg-success": m().isActive && !running(),
                          "bg-accent animate-pulse": running(),
                          "bg-ink-subtle": !m().isActive,
                        }}
                      />
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate font-semibold leading-tight">{m().name}</p>
                      <p
                        class="truncate text-xs"
                        classList={{ "text-accent animate-pulse": running(), "text-ink-subtle": !running() }}
                      >
                        {subtitle()}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettings()}
                    class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
                    aria-label={t("minds.settingsTitle", { name: m().name })}
                  >
                    <SettingsIcon size={20} />
                  </button>
                </>
              )}
            </Show>
          </header>

          <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                data-wallpaper={preferences.wallpaper}
                class="h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 md:px-6"
              >
                <div class="flex w-full max-w-[40rem] flex-col">
                  <For each={feedMessages()}>
                    {(message, i) => {
                      const list = () => feedMessages();
                      const groupable = (m: (Message & { toolCalls?: ChatTurn["toolCalls"] }) | undefined) => !!m;
                      const prev = () => list()[i() - 1];
                      const next = () => list()[i() + 1];
                      const isFirst = () => !groupable(prev()) || prev()!.authorId !== message.authorId;
                      const isLast = () => !groupable(next()) || next()!.authorId !== message.authorId;
                      const mMind = () => mind();
                      return (
                        <div
                          classList={{
                            "mt-3": isFirst() && preferences.bubbleStyle !== "compact",
                            "mt-2": isFirst() && preferences.bubbleStyle === "compact",
                            "mt-[2px]": !isFirst(),
                          }}
                        >
                          <MessageBubble
                            message={message}
                            chat={undefined}
                            authorName={message.mine ? undefined : mMind()?.name}
                            avatar={
                              message.mine ? undefined : (
                                <MindOrb
                                  color={mMind()?.color ?? "#8a8a8a"}
                                  colorEnd={mMind()?.colorEnd}
                                  size={preferences.bubbleStyle === "compact" ? 36 : 24}
                                />
                              )
                            }
                            isFirstInGroup={isFirst()}
                            isLastInGroup={isLast()}
                            content={
                              <div>
                                <MarkdownContent text={message.text} />
                                <Show when={visibleTools(message).length > 0}>
                                  <div class="mt-2 flex flex-col gap-1.5">
                                    <For each={visibleTools(message)}>
                                      {(tc) => (
                                        <MindTool
                                          name={tc.name}
                                          args={typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {})}
                                          output={tc.output}
                                          state={tc.output.trimStart().startsWith("error:") ? "error" : "done"}
                                        />
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </div>
                            }
                          />
                        </div>
                      );
                    }}
                  </For>

                  {/* Live turn: user's sending bubble, says, and tool cards */}
                  <Show when={pendingInput()}>
                    <div
                      classList={{
                        "mt-3": preferences.bubbleStyle !== "compact",
                        "mt-2": preferences.bubbleStyle === "compact",
                      }}
                    >
                      <MessageBubble
                        message={{
                          id: "pending-user",
                          chatId: params.id,
                          authorId: session.user()?.id ?? "me",
                          text: pendingInput()!,
                          scheme: "plain",
                          sentAt: new Date().toISOString(),
                          mine: true,
                          pending: true,
                          reactions: [],
                        }}
                        chat={undefined}
                        isFirstInGroup={true}
                        isLastInGroup={true}
                      />
                    </div>
                  </Show>

                  <For each={live()?.events ?? []}>
                    {(item) => (
                      <Show
                        when={item.kind === "tool"}
                        fallback={
                          <div
                            classList={{
                              "mt-3": preferences.bubbleStyle !== "compact",
                              "mt-2": preferences.bubbleStyle === "compact",
                            }}
                          >
                            <MessageBubble
                              message={{
                                id: "live-asst",
                                chatId: params.id,
                                authorId: params.id,
                                text: (item as { text: string }).text,
                                scheme: "plain",
                                sentAt: new Date().toISOString(),
                                mine: false,
                                reactions: [],
                              }}
                              chat={undefined}
                              authorName={mind()?.name}
                              avatar={
                                <MindOrb
                                  color={mind()?.color ?? "#8a8a8a"}
                                  colorEnd={mind()?.colorEnd}
                                  size={preferences.bubbleStyle === "compact" ? 36 : 24}
                                  thinking
                                />
                              }
                              isFirstInGroup={true}
                              isLastInGroup={true}
                              content={<MarkdownContent text={(item as { text: string }).text} />}
                            />
                          </div>
                        }
                      >
                        {(() => {
                          const tool = item as {
                            name: string;
                            args: string;
                            output: string;
                            state: "running" | "done";
                          };
                          return (
                            <div class="mt-2 max-w-full">
                              <MindTool
                                name={tool.name}
                                args={tool.args}
                                output={tool.state === "done" ? tool.output : undefined}
                                state={tool.state === "running" ? "running" : tool.output.trimStart().startsWith("error:") ? "error" : "done"}
                                defaultOpen={tool.state === "running"}
                              />
                            </div>
                          );
                        })()}
                      </Show>
                    )}
                  </For>

                  {/* Live typing / thinking indicator formatted like ChatView liveDrafts */}
                  <Show when={running() && (live()?.events.length ?? 0) === 0}>
                    <div class="mt-2.5 flex w-full max-w-[40rem] justify-start">
                      <div class="max-w-[86%] rounded-[1.1rem] rounded-bl-md border border-dashed border-accent/40 bg-bubble-received/60 px-3 py-1.5 text-bubble-received-ink md:max-w-[28rem]">
                        <p class="mb-0.5 truncate text-xs font-semibold text-accent">
                          {mind()?.name ?? t("minds.title")}
                        </p>
                        <p class="whitespace-pre-wrap break-words text-[0.95em] leading-snug opacity-70">
                          <span class="animate-pulse">{subtitle() || `${mind()?.name ?? t("minds.title")}…`}</span>
                          <span class="ml-0.5 inline-block animate-pulse font-semibold text-accent">▍</span>
                        </p>
                      </div>
                    </div>
                  </Show>

                  <Show when={mindsStore.state.error}>
                    <p class="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                      {mindsStore.state.error}
                    </p>
                  </Show>
                </div>
              </div>

              <Show when={!atBottom()}>
                <button
                  type="button"
                  onClick={() => scrollToBottom()}
                  class="pop-in absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-raised text-ink shadow-floating transition-transform duration-150 hover:scale-105 active:scale-95"
                  aria-label={t("chatView.scrollToLatestAria")}
                >
                  <ArrowDownIcon size={18} />
                </button>
              </Show>
            </div>

            <div class="shrink-0 border-t border-border bg-bg">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                class="w-full px-[max(var(--safe-left),0.75rem)] pb-[max(var(--safe-bottom),0.75rem)] pt-2.5"
              >
                <Composer
                  value={draft()}
                  onChange={setDraft}
                  disabled={running()}
                  hideAdd
                  hideVoice
                  placeholder={t("minds.messagePlaceholder", { name: mind()?.name ?? t("minds.title") })}
                  onSubmit={() => void handleSend()}
                />
              </form>
            </div>
          </div>
        </div>
      </Show>

      <Dialog
        open={addingSchedule()}
        onOpenChange={(o) => !o && setAddingSchedule(false)}
        title={t("minds.addScheduleTitle")}
        description={t("minds.addScheduleDesc")}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddingSchedule(false)}>
              {t("minds.cancel")}
            </Button>
            <Button size="sm" loading={schedSaving()} onClick={() => void saveSchedule()}>
              {t("minds.saveSchedule")}
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-3">
          <TextField
            label={t("minds.scheduleLabel")}
            placeholder={t("minds.scheduleLabelPlaceholder")}
            value={schedLabel()}
            onInput={(e) => setSchedLabel(e.currentTarget.value)}
          />
          <TextField
            label={t("minds.scheduleCron")}
            placeholder={t("minds.scheduleCronPlaceholder")}
            value={schedCron()}
            onInput={(e) => setSchedCron(e.currentTarget.value)}
          />
          <TextArea
            label={t("minds.scheduleTask")}
            placeholder={t("minds.scheduleTaskPlaceholder")}
            value={schedTask()}
            onInput={(e) => setSchedTask(e.currentTarget.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
