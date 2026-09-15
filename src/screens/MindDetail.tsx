import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Button, TextField, TextArea, Dialog } from "@atlas/ui";
import { mindsStore } from "../store/minds";
import MindOrb from "../components/MindOrb";
import MarkdownContent from "../components/MarkdownContent";
import EmptyState from "../components/EmptyState";
import AnimatedList from "../ui/AnimatedList";
import {
  BackIcon,
  CheckIcon,
  CompassIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  SpinnerIcon,
  TrashIcon,
  WrenchIcon,
} from "../icons";
import { formatRelativeTime } from "../lib/time";
import { useIsDesktopLayout } from "../lib/platform";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: Array<{ name: string; arguments: any; output: string }>;
  status?: string;
  time: string;
}

export default function MindDetail() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();

  const [draft, setDraft] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [liveAction, setLiveAction] = createSignal<string | null>(null);
  const [showSettings, setShowSettings] = createSignal(false);
  const [addingSchedule, setAddingSchedule] = createSignal(false);

  // Schedule modal form
  const [schedLabel, setSchedLabel] = createSignal("");
  const [schedCron, setSchedCron] = createSignal("0 9 * * *");
  const [schedTask, setSchedTask] = createSignal("");
  const [schedSaving, setSchedSaving] = createSignal(false);

  let scrollRef: HTMLDivElement | undefined;
  let inputRef: HTMLTextAreaElement | undefined;

  const mind = () => mindsStore.state.minds?.find((m) => m.id === params.id);
  const runs = () => mindsStore.state.runs[params.id] ?? [];
  const schedules = () => mindsStore.state.schedules[params.id] ?? [];

  onMount(() => {
    if (!mindsStore.state.minds) void mindsStore.loadMinds();
    void mindsStore.loadRuns(params.id);
    void mindsStore.loadSchedules(params.id);
  });

  const scrollToBottom = () => {
    queueMicrotask(() => {
      if (scrollRef) {
        scrollRef.scrollTop = scrollRef.scrollHeight;
      }
    });
  };

  createEffect(() => {
    void runs().length;
    void running();
    scrollToBottom();
  });

  // Convert persisted runs into a fluid conversational chat timeline
  const chatMessages = () => {
    const list: ChatTurn[] = [];
    const sortedRuns = [...runs()].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    for (const r of sortedRuns) {
      if (r.input) {
        list.push({
          id: `${r.id}-user`,
          role: "user",
          text: r.input,
          time: r.startedAt,
        });
      }
      if (r.output || (r.toolCalls && r.toolCalls.length > 0)) {
        list.push({
          id: `${r.id}-asst`,
          role: "assistant",
          text: r.output || (r.status === "error" ? "Run failed with an error." : "Task completed."),
          toolCalls: r.toolCalls,
          status: r.status,
          time: r.finishedAt || r.startedAt,
        });
      }
    }
    return list;
  };

  const handleSend = async () => {
    const text = draft().trim();
    if (!text || running()) return;
    setDraft("");
    setRunning(true);
    setLiveAction("Starting isolated sandbox container…");

    // Realistic progressive status steps while the autonomous loop executes
    const timer1 = setTimeout(() => {
      setLiveAction("Launching stealth browser & executing sandbox tools…");
    }, 1500);
    const timer2 = setTimeout(() => {
      setLiveAction("Analyzing page content & evaluating findings…");
    }, 4500);

    try {
      await mindsStore.runMind(params.id, text);
    } catch {
      // Error handled in store
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setLiveAction(null);
      setRunning(false);
      inputRef?.focus();
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

  return (
    <div class="flex h-full flex-col bg-bg text-ink">
      {/* Telegram / Grok-style Header */}
      <header class="flex shrink-0 items-center justify-between border-b border-border bg-appbar px-4 pb-3 pt-[max(var(--safe-top),1.25rem)] backdrop-blur">
        <div class="flex items-center gap-3">
          <Show when={!isDesktop()}>
            <A
              href="/minds"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
            >
              <BackIcon size={20} />
            </A>
          </Show>
          <Show when={mind()}>
            {(m) => (
              <div class="flex items-center gap-3">
                <div class="relative">
                  <MindOrb color={m().color} colorEnd={m().colorEnd} size={38} thinking={running()} />
                  <span
                    class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-appbar"
                    classList={{
                      "bg-success": m().isActive && !running(),
                      "bg-accent animate-pulse": running(),
                      "bg-ink-subtle": !m().isActive,
                    }}
                  />
                </div>
                <div>
                  <h1 class="flex items-center gap-1.5 text-[15px] font-bold text-ink leading-tight">
                    {m().name}
                    <span class="rounded bg-accent-soft px-1.5 py-0.2 text-[10px] font-semibold text-accent uppercase">
                      bot
                    </span>
                  </h1>
                  <p class="text-xs text-ink-muted flex items-center gap-1">
                    <Show
                      when={running()}
                      fallback={
                        <span>
                          {m().isActive ? "24/7 Sandbox Active" : "Paused"} ·{" "}
                          {schedules().filter((s) => s.enabled).length} active schedules
                        </span>
                      }
                    >
                      <span class="text-accent flex items-center gap-1 font-medium">
                        <SpinnerIcon size={12} class="animate-spin inline" />
                        {liveAction() || "Thinking…"}
                      </span>
                    </Show>
                  </p>
                </div>
              </div>
            )}
          </Show>
        </div>

        {/* Mind Settings Gear Button */}
        <div class="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            class="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface hover:text-ink active:scale-95"
            title="Mind Settings & Schedules"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </header>

      {/* Main Chat Stream Container */}
      <div ref={scrollRef} class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div class="mx-auto flex max-w-3xl flex-col gap-4">
          {/* Welcome Intro Card */}
          <div class="mx-auto max-w-md my-4 rounded-2xl border border-border/60 bg-surface/70 p-4 text-center shadow-xs backdrop-blur">
            <div class="mx-auto mb-2 flex justify-center">
              <Show when={mind()}>
                {(m) => <MindOrb color={m().color} colorEnd={m().colorEnd} size={48} />}
              </Show>
            </div>
            <h2 class="text-sm font-bold text-ink">{mind()?.name}</h2>
            <p class="mt-1 text-xs text-ink-muted leading-relaxed">
              {mind()?.prompt || "Autonomous agent ready for 24/7 jobs, schedules, and live browsing."}
            </p>
            <div class="mt-3 flex flex-wrap justify-center gap-2">
              <span class="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-ink-subtle border border-border">
                🌐 Stealth Browser
              </span>
              <span class="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-ink-subtle border border-border">
                ⚡ Persistent Shell
              </span>
              <span class="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-ink-subtle border border-border">
                ⏰ 24/7 Cron Tasks
              </span>
            </div>
          </div>

          {/* Conversation Bubbles */}
          <For each={chatMessages()}>
            {(msg) => (
              <div class="flex flex-col gap-1.5" classList={{ "items-end": msg.role === "user", "items-start": msg.role === "assistant" }}>
                {/* User Bubble */}
                <Show when={msg.role === "user"}>
                  <div class="max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-xs">
                    <p class="whitespace-pre-wrap break-words">{msg.text}</p>
                  </div>
                  <span class="px-2 text-[10px] text-ink-subtle">{formatRelativeTime(msg.time)}</span>
                </Show>

                {/* Assistant (Mind) Bubble */}
                <Show when={msg.role === "assistant"}>
                  <div class="flex gap-2.5 max-w-[90%]">
                    <div class="mt-1 shrink-0">
                      <MindOrb color={mind()?.color ?? "#8a8a8a"} colorEnd={mind()?.colorEnd} size={28} />
                    </div>
                    <div class="flex flex-col gap-2 min-w-0">
                      {/* Real-time Tool Activity Drawer if tools were invoked */}
                      <Show when={msg.toolCalls && msg.toolCalls.length > 0}>
                        <div class="rounded-xl border border-border bg-surface/90 p-2.5 text-xs shadow-xs">
                          <div class="mb-1.5 flex items-center gap-1.5 font-semibold text-accent">
                            <span>⚡ Autonomous Actions ({msg.toolCalls!.length})</span>
                          </div>
                          <div class="flex flex-col gap-1.5">
                            <For each={msg.toolCalls}>
                              {(tc) => (
                                <div class="rounded-lg bg-bg/80 p-2 font-mono text-[11px] text-ink-muted">
                                  <div class="font-bold text-ink flex items-center gap-1">
                                    <span>▸ {tc.name}</span>
                                    <span class="font-normal text-ink-subtle text-[10px]">
                                      {JSON.stringify(tc.arguments)}
                                    </span>
                                  </div>
                                  <div class="mt-1 text-ink-muted break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
                                    {tc.output}
                                  </div>
                                </div>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>

                      {/* Mind Text Response */}
                      <div class="rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink shadow-xs">
                        <MarkdownContent text={msg.text} />
                      </div>
                      <span class="px-2 text-[10px] text-ink-subtle">{formatRelativeTime(msg.time)}</span>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>

          {/* Live Typing & Action Status Indicator */}
          <Show when={running()}>
            <div class="flex items-center gap-3 py-2 text-sm text-ink-muted">
              <MindOrb color={mind()?.color ?? "#8a8a8a"} colorEnd={mind()?.colorEnd} size={28} thinking />
              <div class="flex items-center gap-2 rounded-2xl border border-accent/40 bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent">
                <SpinnerIcon size={14} class="animate-spin inline" />
                <span>{liveAction() || "Thinking & checking sandbox tools…"}</span>
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* Modern Composer */}
      <div class="shrink-0 border-t border-border bg-surface/95 px-4 pb-[max(var(--safe-bottom),0.75rem)] pt-3 backdrop-blur">
        <form
          class="mx-auto flex max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            ref={inputRef}
            value={draft()}
            rows="1"
            placeholder={`Message ${mind()?.name || "Mind"}… (e.g. check listing price every morning)`}
            disabled={running()}
            class="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-bg px-4 py-2.5 text-[15px] text-ink outline-none transition placeholder:text-ink-subtle focus:border-accent disabled:opacity-60"
            onInput={(e) => {
              setDraft(e.currentTarget.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="submit"
            disabled={!draft().trim() || running()}
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white transition hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            <SendIcon size={18} />
          </button>
        </form>
      </div>

      {/* Mind Settings & 24/7 Schedules Drawer/Dialog */}
      <Dialog
        open={showSettings()}
        onOpenChange={(o) => setShowSettings(o)}
        title={`${mind()?.name ?? "Mind"} Settings & 24/7 Schedules`}
        description="Manage autonomous capabilities, recurring schedules, and sandbox tools."
        footer={
          <Button size="sm" onClick={() => setShowSettings(false)}>
            Done
          </Button>
        }
      >
        <div class="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Status & Active Switch */}
          <div class="flex items-center justify-between rounded-xl border border-border bg-bg p-3.5">
            <div>
              <p class="text-sm font-semibold text-ink">24/7 Autonomous Status</p>
              <p class="text-xs text-ink-muted">
                {mind()?.isActive ? "Active and running scheduled tasks" : "Paused"}
              </p>
            </div>
            <Button
              size="sm"
              variant={mind()?.isActive ? "secondary" : "primary"}
              onClick={() => void toggleActive()}
            >
              {mind()?.isActive ? "Pause Mind" : "Activate Mind"}
            </Button>
          </div>

          {/* 24/7 Schedules Manager */}
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                  Recurring 24/7 Schedules ({schedules().length})
                </h3>
                <p class="text-xs text-ink-muted">Runs in background even when you're offline.</p>
              </div>
              <Button size="sm" onClick={() => setAddingSchedule(true)}>
                <PlusIcon size={14} class="mr-1 inline" />
                Add
              </Button>
            </div>

            <Show
              when={schedules().length > 0}
              fallback={
                <div class="rounded-xl border border-dashed border-border p-4 text-center text-xs text-ink-muted">
                  No schedules active. Click "Add" or tell the Mind in chat: "Check this listing every day at 9am".
                </div>
              }
            >
              <div class="flex flex-col gap-2">
                <For each={schedules()}>
                  {(sched) => (
                    <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg p-3">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="font-semibold text-xs text-ink">{sched.label}</span>
                          <span class="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-mono font-medium text-accent">
                            {sched.cronExpr}
                          </span>
                        </div>
                        <p class="truncate text-xs text-ink-muted mt-0.5">{sched.task}</p>
                      </div>

                      <div class="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void mindsStore.toggleSchedule(params.id, sched.id)}
                          class="rounded-lg px-2 py-1 text-xs font-medium transition"
                          classList={{
                            "bg-accent-soft text-accent": sched.enabled,
                            "bg-surface text-ink-muted": !sched.enabled,
                          }}
                        >
                          {sched.enabled ? "Active" : "Paused"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void mindsStore.deleteSchedule(params.id, sched.id)}
                          class="text-ink-subtle hover:text-danger p-1"
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

          {/* Sandbox Tool Toggles */}
          <div class="flex flex-col gap-3">
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink-subtle">
              Allowed Sandbox Capabilities
            </h3>
            {[
              {
                key: "browser",
                name: "Stealth Custom Browser",
                desc: "Human-mimicking headers & dynamic DOM scraper",
              },
              {
                key: "web_fetch",
                name: "Direct Web Fetch",
                desc: "Fast plain text fetch for lightweight URLs",
              },
              {
                key: "shell",
                name: "Sandbox Shell",
                desc: "Persistent workspace directory to store history",
              },
              {
                key: "set_schedule",
                name: "Self-Scheduling",
                desc: "Allows the Mind to configure its own cron schedules",
              },
              {
                key: "message_owner",
                name: "Owner Direct Messaging",
                desc: "Delivers findings right into your Atlas chat",
              },
            ].map((tool) => {
              const m = mind();
              const enabled = () => m?.tools?.[tool.key] ?? true;
              return (
                <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg p-3">
                  <div>
                    <p class="text-xs font-semibold text-ink">{tool.name}</p>
                    <p class="text-[11px] text-ink-muted">{tool.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleTool(tool.key, enabled())}
                    class="flex h-5 w-9 shrink-0 rounded-full transition-colors"
                    classList={{
                      "bg-accent": enabled(),
                      "bg-border": !enabled(),
                    }}
                  >
                    <span
                      class="h-5 w-5 rounded-full bg-white shadow transition-transform"
                      classList={{
                        "translate-x-4": enabled(),
                        "translate-x-0": !enabled(),
                      }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>

      {/* New Schedule Modal */}
      <Dialog
        open={addingSchedule()}
        onOpenChange={(o) => !o && setAddingSchedule(false)}
        title="Add Recurring 24/7 Schedule"
        description="Set a cron task that runs continuously on the server."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setAddingSchedule(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={schedSaving()} onClick={() => void saveSchedule()}>
              Save Schedule
            </Button>
          </>
        }
      >
        <div class="flex flex-col gap-3">
          <TextField
            label="Schedule Title"
            placeholder="e.g. Daily Price Check"
            value={schedLabel()}
            onInput={(e) => setSchedLabel(e.currentTarget.value)}
          />
          <TextField
            label="Cron Expression (5 fields)"
            placeholder="0 9 * * * (Every day at 9am UTC)"
            value={schedCron()}
            onInput={(e) => setSchedCron(e.currentTarget.value)}
          />
          <TextArea
            label="Task Instructions"
            placeholder="e.g. Fetch the listing page, scrape the price, and message me if it drops."
            value={schedTask()}
            onInput={(e) => setSchedTask(e.currentTarget.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
