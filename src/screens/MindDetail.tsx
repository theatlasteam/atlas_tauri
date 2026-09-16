import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { AiMessage, Button, Composer, Dialog, MessageBubble, TextArea, TextField } from "@atlas/ui";
import { mindsStore } from "../store/minds";
import MindOrb from "../components/MindOrb";
import MarkdownContent from "../components/MarkdownContent";
import { ArrowDownIcon, BackIcon, PlusIcon, SettingsIcon, TrashIcon } from "../icons";
import { formatRelativeTime } from "../lib/time";
import { t, type TranslationKey } from "../lib/i18n";
import { useIsDesktopLayout } from "../lib/platform";

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
function visibleTools(msg: ChatTurn): NonNullable<ChatTurn["toolCalls"]> {
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
      () => runs().length + (live()?.says.length ?? 0) + (pendingInput() ? 1 : 0),
      (len, prevLen) => {
        if (prevLen !== undefined && len > prevLen && atBottom()) {
          queueMicrotask(() => scrollToBottom());
        }
      },
    ),
  );

  // Convert persisted runs into a conversational timeline, oldest first.
  const chatMessages = () => {
    const list: ChatTurn[] = [];
    const sortedRuns = [...runs()].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );
    for (const r of sortedRuns) {
      if (r.input) {
        list.push({ id: `${r.id}-user`, role: "user", text: r.input, time: r.startedAt });
      }
      if (r.output || (r.toolCalls && r.toolCalls.length > 0)) {
        list.push({
          id: `${r.id}-asst`,
          role: "assistant",
          text: r.output || (r.status === "error" ? t("minds.runFailed") : t("minds.taskCompleted")),
          toolCalls: r.toolCalls,
          status: r.status,
          time: r.finishedAt || r.startedAt,
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
              <span class="relative shrink-0">
                <MindOrb color={m().color} colorEnd={m().colorEnd} size={36} thinking={running()} />
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
              <button
                type="button"
                onClick={() => setShowSettings(true)}
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
            class="h-full min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 md:px-6"
          >
            <div class="flex w-full max-w-[40rem] flex-col gap-2.5">
              <For each={chatMessages()}>
                {(msg) => (
                  <Show
                    when={msg.role === "assistant"}
                    fallback={
                      <MessageBubble side="sent" time={formatRelativeTime(msg.time)}>
                        {msg.text}
                      </MessageBubble>
                    }
                  >
                    <AiMessage name={mind()?.name ?? t("minds.title")}>
                      <Show when={visibleTools(msg).length > 0}>
                        <div class="mb-2 rounded-xl border border-border bg-surface px-2.5 py-2 text-xs">
                          <p class="mb-1.5 font-semibold text-accent">
                            {t("minds.liveActions", { n: visibleTools(msg).length })}
                          </p>
                          <div class="flex flex-col gap-1.5">
                            <For each={visibleTools(msg)}>
                              {(tc) => (
                                <div class="rounded-lg bg-bg p-2 font-mono text-[11px] text-ink-muted">
                                  <p class="font-bold text-ink">
                                    ▸ {tc.name}{" "}
                                    <span class="font-normal text-[10px] text-ink-subtle">
                                      {JSON.stringify(tc.arguments)}
                                    </span>
                                  </p>
                                  <p class="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words">
                                    {tc.output}
                                  </p>
                                </div>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>
                      <MarkdownContent text={msg.text} />
                      <p class="mt-1 text-[10px] text-ink-subtle">{formatRelativeTime(msg.time)}</p>
                    </AiMessage>
                  </Show>
                )}
              </For>

              {/* Streaming turn: the pending question plus every `say` note so
                  far, arriving live instead of all at once at the end. */}
              <Show when={pendingInput()}>
                <MessageBubble side="sent" status="sending">
                  {pendingInput()}
                </MessageBubble>
              </Show>
              <For each={live()?.says ?? []}>
                {(note) => (
                  <AiMessage name={mind()?.name ?? t("minds.title")}>
                    <MarkdownContent text={note} />
                  </AiMessage>
                )}
              </For>
              <Show when={running() && (live()?.says.length ?? 0) === 0}>
                <AiMessage
                  name={mind()?.name ?? t("minds.title")}
                  thinking
                  thinkingLabel={`${mind()?.name ?? t("minds.title")}…`}
                />
              </Show>

              <Show when={mindsStore.state.error}>
                <p class="rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
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

      <Dialog
        open={showSettings()}
        onOpenChange={(o) => setShowSettings(o)}
        title={t("minds.settingsTitle", { name: mind()?.name ?? t("minds.title") })}
        description={t("minds.settingsDesc")}
        footer={
          <Button size="sm" onClick={() => setShowSettings(false)}>
            {t("minds.settingsDone")}
          </Button>
        }
      >
        <div class="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <div class="flex items-center justify-between rounded-xl border border-border bg-bg p-3.5">
            <div>
              <p class="text-sm font-semibold text-ink">{t("minds.autonomousStatus")}</p>
              <p class="text-xs text-ink-muted">
                {mind()?.isActive ? t("minds.autonomousActive") : t("minds.mindPaused")}
              </p>
            </div>
            <Button size="sm" variant={mind()?.isActive ? "soft" : "primary"} onClick={() => void toggleActive()}>
              {mind()?.isActive ? t("minds.pauseMind") : t("minds.activateMind")}
            </Button>
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  {t("minds.schedulesTitle", { n: schedules().length })}
                </h3>
                <p class="text-xs text-ink-muted">{t("minds.schedulesHint")}</p>
              </div>
              <Button size="sm" onClick={() => setAddingSchedule(true)}>
                <PlusIcon size={14} class="mr-1 inline" />
                {t("minds.add")}
              </Button>
            </div>

            <Show when={schedules().length > 0} fallback={
              <div class="rounded-xl border border-dashed border-border p-4 text-center text-xs text-ink-muted">
                {t("minds.noSchedules")}
              </div>
            }>
              <div class="flex flex-col gap-2">
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

          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink-subtle">
              {t("minds.toolsTitle")}
            </h3>
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
      </Dialog>

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
