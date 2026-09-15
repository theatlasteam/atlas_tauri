import { createSignal, For, onMount, Show } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Button, TextField, TextArea, Dialog } from "@atlas/ui";
import { mindsStore } from "../store/minds";
import MindOrb from "../components/MindOrb";
import EmptyState from "../components/EmptyState";
import AnimatedList from "../ui/AnimatedList";
import { BackIcon, CheckIcon, CompassIcon, PlayIcon, PlusIcon, TrashIcon } from "../icons";
import { formatRelativeTime } from "../lib/time";
import { useIsDesktopLayout } from "../lib/platform";

export default function MindDetail() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktopLayout();

  const [activeTab, setActiveTab] = createSignal<"runs" | "schedules" | "settings">("runs");
  const [manualInput, setManualInput] = createSignal("");
  const [running, setRunning] = createSignal(false);
  const [addingSchedule, setAddingSchedule] = createSignal(false);

  // Schedule modal form
  const [schedLabel, setSchedLabel] = createSignal("");
  const [schedCron, setSchedCron] = createSignal("0 9 * * *");
  const [schedTask, setSchedTask] = createSignal("");
  const [schedSaving, setSchedSaving] = createSignal(false);

  const mind = () => mindsStore.state.minds?.find((m) => m.id === params.id);
  const runs = () => mindsStore.state.runs[params.id] ?? [];
  const schedules = () => mindsStore.state.schedules[params.id] ?? [];

  onMount(() => {
    if (!mindsStore.state.minds) void mindsStore.loadMinds();
    void mindsStore.loadRuns(params.id);
    void mindsStore.loadSchedules(params.id);
  });

  const triggerRun = async () => {
    const text = manualInput().trim();
    if (!text || running()) return;
    setRunning(true);
    try {
      await mindsStore.runMind(params.id, text);
      setManualInput("");
    } catch {
      // Store error displayed
    } finally {
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
    } catch {
      // Store error
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
    <div class="flex h-full flex-col bg-bg">
      {/* Header */}
      <header class="flex shrink-0 items-center justify-between border-b border-border bg-appbar px-4 pb-3 pt-[max(var(--safe-top),1.5rem)]">
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
                <MindOrb color={m().color} colorEnd={m().colorEnd} size={36} />
                <div>
                  <h1 class="text-base font-bold text-ink leading-tight">{m().name}</h1>
                  <p class="text-xs text-ink-subtle">
                    {m().isActive ? "24/7 Sandbox Active" : "Paused"} · Status: {m().lastStatus}
                  </p>
                </div>
              </div>
            )}
          </Show>
        </div>

        <div class="flex items-center gap-2">
          <Show when={mind()}>
            {(m) => (
              <Button
                size="sm"
                variant={m().isActive ? "secondary" : "primary"}
                onClick={() => void toggleActive()}
              >
                {m().isActive ? "Pause Mind" : "Activate Mind"}
              </Button>
            )}
          </Show>
        </div>
      </header>

      {/* Tabs */}
      <div class="flex shrink-0 border-b border-border bg-surface px-4">
        <button
          type="button"
          onClick={() => setActiveTab("runs")}
          class="border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition"
          classList={{
            "border-accent text-accent": activeTab() === "runs",
            "border-transparent text-ink-muted hover:text-ink": activeTab() !== "runs",
          }}
        >
          Runs & Activity
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("schedules")}
          class="border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition"
          classList={{
            "border-accent text-accent": activeTab() === "schedules",
            "border-transparent text-ink-muted hover:text-ink": activeTab() !== "schedules",
          }}
        >
          24/7 Schedules ({schedules().length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          class="border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition"
          classList={{
            "border-accent text-accent": activeTab() === "settings",
            "border-transparent text-ink-muted hover:text-ink": activeTab() !== "settings",
          }}
        >
          Tools & Sandbox
        </button>
      </div>

      {/* Content */}
      <div class="min-h-0 flex-1 overflow-y-auto p-5">
        <Show when={mindsStore.state.error}>
          <div class="mb-4 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
            {mindsStore.state.error}
          </div>
        </Show>

        {/* Tab 1: Runs & Activity */}
        <Show when={activeTab() === "runs"}>
          {/* Quick Manual Run Composer */}
          <div class="mb-6 rounded-2xl border border-border bg-surface p-4">
            <h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              Direct Sandbox Job
            </h2>
            <p class="mb-3 text-xs text-ink-muted">
              Give this Mind a task to execute right now in its private sandbox environment with its tools.
            </p>
            <div class="flex gap-2">
              <input
                type="text"
                value={manualInput()}
                onInput={(e) => setManualInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void triggerRun()}
                placeholder="e.g. Check the latest price of iPhone 16 Pro on the web and store it"
                class="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3.5 py-2 text-sm text-ink outline-none transition focus:border-accent"
              />
              <Button size="sm" loading={running()} onClick={() => void triggerRun()}>
                <PlayIcon size={16} class="mr-1 inline" />
                Run
              </Button>
            </div>
          </div>

          {/* Runs Timeline */}
          <div class="flex flex-col gap-3">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
              Recent Execution Traces
            </h2>
            <Show
              when={runs().length > 0}
              fallback={
                <EmptyState
                  icon={PlayIcon}
                  title="No runs yet"
                  subtitle="Trigger a direct job above or add a recurring schedule."
                />
              }
            >
              <AnimatedList>
                <For each={runs()}>
                  {(run) => (
                    <div class="rounded-2xl border border-border bg-surface p-4">
                      <div class="mb-2 flex items-center justify-between gap-2">
                        <span class="flex items-center gap-2">
                          <span
                            class="inline-block h-2 w-2 rounded-full"
                            classList={{
                              "bg-success": run.status === "ok",
                              "bg-danger": run.status === "error",
                            }}
                          />
                          <span class="text-xs font-bold uppercase tracking-wider text-ink">
                            {run.trigger} run
                          </span>
                        </span>
                        <span class="text-xs text-ink-subtle">
                          {formatRelativeTime(run.startedAt)}
                        </span>
                      </div>

                      <div class="mb-2 rounded-xl bg-bg/80 p-3 text-xs text-ink">
                        <span class="font-semibold text-ink-subtle">Task: </span>
                        {run.input}
                      </div>

                      <Show when={run.toolCalls && run.toolCalls.length > 0}>
                        <div class="mb-2 flex flex-col gap-1.5 rounded-xl border border-border/70 bg-bg/50 p-2.5">
                          <span class="text-[11px] font-semibold text-accent">
                            Tool Executions ({run.toolCalls!.length}):
                          </span>
                          <For each={run.toolCalls}>
                            {(tc) => (
                              <div class="text-[11px] font-mono text-ink-muted">
                                <span class="font-bold text-ink">⚡ {tc.name}</span>:{" "}
                                <span class="truncate">{tc.output}</span>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>

                      <div class="whitespace-pre-wrap text-sm text-ink">{run.output}</div>
                      <Show when={run.error}>
                        <div class="mt-2 text-xs font-mono text-danger">{run.error}</div>
                      </Show>
                    </div>
                  )}
                </For>
              </AnimatedList>
            </Show>
          </div>
        </Show>

        {/* Tab 2: Schedules */}
        <Show when={activeTab() === "schedules"}>
          <div class="mb-4 flex items-center justify-between">
            <div>
              <h2 class="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Autonomous 24/7 Schedules
              </h2>
              <p class="text-xs text-ink-muted">
                The server runs these on schedule even when your app is closed or offline.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddingSchedule(true)}>
              <PlusIcon size={15} class="mr-1 inline" />
              New Schedule
            </Button>
          </div>

          <div class="flex flex-col gap-3">
            <Show
              when={schedules().length > 0}
              fallback={
                <EmptyState
                  icon={CompassIcon}
                  title="No schedules set"
                  subtitle="Add a schedule to have this Mind check prices, monitor pages, or report updates automatically."
                />
              }
            >
              <AnimatedList>
                <For each={schedules()}>
                  {(sched) => (
                    <div class="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <h3 class="font-semibold text-ink">{sched.label}</h3>
                          <span class="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-mono font-medium text-accent">
                            {sched.cronExpr}
                          </span>
                        </div>
                        <p class="truncate text-xs text-ink-muted mt-1">{sched.task}</p>
                        <p class="text-[11px] text-ink-subtle mt-1">
                          Next run: {sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleString() : "Paused"}
                        </p>
                      </div>

                      <div class="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={sched.enabled ? "secondary" : "ghost"}
                          onClick={() => void mindsStore.toggleSchedule(params.id, sched.id)}
                        >
                          {sched.enabled ? "Enabled" : "Paused"}
                        </Button>
                        <button
                          type="button"
                          onClick={() => void mindsStore.deleteSchedule(params.id, sched.id)}
                          class="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle hover:bg-bg hover:text-danger"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </AnimatedList>
            </Show>
          </div>
        </Show>

        {/* Tab 3: Tools & Sandbox */}
        <Show when={activeTab() === "settings"}>
          <div class="flex flex-col gap-6">
            <div class="rounded-2xl border border-border bg-surface p-5">
              <h2 class="mb-1 text-sm font-bold text-ink">Sandbox Tool Allowlist</h2>
              <p class="mb-4 text-xs text-ink-muted">
                Control which capabilities this Mind may execute in its isolated server sandbox.
              </p>

              <div class="flex flex-col gap-3">
                {[
                  {
                    key: "browser",
                    name: "Stealth Custom Browser",
                    desc: "Human-mimicking browser headers, randomized delays, and dynamic DOM parsing.",
                  },
                  {
                    key: "web_fetch",
                    name: "Direct Web Fetch",
                    desc: "Fast plain text fetch for lightweight articles, APIs, and blogs.",
                  },
                  {
                    key: "shell",
                    name: "Persistent Sandbox Shell",
                    desc: "Private directory with persistent storage to remember past observations.",
                  },
                  {
                    key: "set_schedule",
                    name: "Self-Scheduling",
                    desc: "Permits the Mind to set or adjust its own recurring schedules.",
                  },
                  {
                    key: "message_owner",
                    name: "Owner Direct Messaging",
                    desc: "Direct Atlas messenger delivery of findings to your chat.",
                  },
                ].map((tool) => {
                  const m = mind();
                  const enabled = () => m?.tools?.[tool.key] ?? true;
                  return (
                    <div class="flex items-center justify-between gap-4 rounded-xl border border-border/80 bg-bg/50 p-3.5">
                      <div>
                        <p class="text-sm font-semibold text-ink">{tool.name}</p>
                        <p class="text-xs text-ink-muted">{tool.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleTool(tool.key, enabled())}
                        class="flex h-6 w-11 shrink-0 rounded-full transition-colors"
                        classList={{
                          "bg-accent": enabled(),
                          "bg-border": !enabled(),
                        }}
                      >
                        <span
                          class="h-6 w-6 rounded-full bg-white shadow transition-transform"
                          classList={{
                            "translate-x-5": enabled(),
                            "translate-x-0": !enabled(),
                          }}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div class="rounded-2xl border border-border bg-surface p-5">
              <h2 class="mb-1 text-sm font-bold text-ink">Personality & Character</h2>
              <p class="mb-3 text-xs text-ink-muted">
                How this Mind approaches tasks and formats its findings.
              </p>
              <div class="rounded-xl bg-bg p-3.5 text-xs text-ink-muted whitespace-pre-wrap">
                {mind()?.prompt || "Standard proactive assistant"}
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* New Schedule Modal */}
      <Dialog
        open={addingSchedule()}
        onOpenChange={(o) => !o && setAddingSchedule(false)}
        title="New 24/7 Schedule"
        description="Configure a recurring autonomous task for this Mind."
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
            label="Schedule Name"
            placeholder="e.g. Daily Price Watch"
            value={schedLabel()}
            onInput={(e) => setSchedLabel(e.currentTarget.value)}
          />
          <TextField
            label="Cron Expression (5 fields)"
            placeholder="0 9 * * * (Daily at 9:00 AM UTC)"
            value={schedCron()}
            onInput={(e) => setSchedCron(e.currentTarget.value)}
          />
          <TextArea
            label="Specific Task"
            placeholder="e.g. Open https://example.com/product, scrape the current price, check against previous price in last_price.txt, and message me if changed."
            value={schedTask()}
            onInput={(e) => setSchedTask(e.currentTarget.value)}
          />
        </div>
      </Dialog>
    </div>
  );
}
