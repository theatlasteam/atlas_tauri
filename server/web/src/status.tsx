import { createResource, For, Show } from "solid-js";
import { render } from "solid-js/web";
import LimitBar from "../design-system/LimitBar";
import "./index.css";

type Section = { label: string; state: "up" | "miss" | "down"; weight: number };
type Component = {
  id: string;
  name: string;
  description: string;
  status: "operational" | "outage" | "unknown";
  uptimePct: number | null;
  sections: Section[];
};
type Incident = {
  id: string;
  title: string;
  body: string;
  startedAt: string;
  resolvedAt: string | null;
  severity: string;
};
type Payload = {
  overall: Component["status"];
  components: Component[];
  incidents: Incident[];
};

const COLOR = { up: "#2f8f6e", miss: "#e08a2c", down: "#c4453a" };

const STATUS_WORD: Record<Component["status"], string> = {
  operational: "Operational",
  outage: "Outage",
  unknown: "No recent check",
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Page() {
  const [data] = createResource(async () => {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("status unavailable");
    return (await res.json()) as Payload;
  });

  const open = () => (data()?.incidents ?? []).filter((inc) => !inc.resolvedAt);
  const past = () => (data()?.incidents ?? []).filter((inc) => inc.resolvedAt);

  return (
    <main class="mx-auto min-h-screen max-w-3xl px-5 py-12">
      <Show when={open().length > 0}>
        <div class="mb-8 overflow-hidden rounded-xl border border-danger/40 bg-danger/10">
          <div class="h-1.5 w-full" style={{ background: COLOR.down }} />
          <div class="px-4 py-3">
            <p class="text-sm font-medium text-danger">Incident in progress</p>
            <For each={open()}>
              {(inc) => (
                <div class="mt-3">
                  <p class="font-medium">{inc.title}</p>
                  <p class="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{inc.body}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <header class="mb-10">
        <p class="font-mono text-[11px] tracking-[0.16em] text-ink-muted">ATLAS</p>
        <h1 class="mt-2 font-heading text-4xl font-medium tracking-tight">Status</h1>
        <Show when={data()} fallback={<p class="mt-3 text-ink-muted">Loading…</p>}>
          {(payload) => (
            <p class="mt-3 text-lg">
              <span
                class="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: payload().overall === "operational" ? COLOR.up : payload().overall === "outage" ? COLOR.down : COLOR.miss }}
              />
              {payload().overall === "operational"
                ? "All systems operational"
                : payload().overall === "outage"
                  ? "An incident is in progress"
                  : "Some checks have not reported"}
            </p>
          )}
        </Show>
      </header>

      <Show when={data.error}>
        <p class="text-danger">Could not load status.</p>
      </Show>

      <Show when={past().length > 0}>
        <section class="mb-10">
          <h2 class="font-heading text-2xl font-medium">Past incidents</h2>
          <ul class="mt-4 flex flex-col gap-4">
            <For each={past()}>
              {(inc) => (
                <li class="rounded-lg border border-border px-4 py-3">
                  <p class="font-medium">{inc.title}</p>
                  <p class="mt-1 text-sm text-ink-muted">
                    {formatWhen(inc.startedAt)} – {formatWhen(inc.resolvedAt!)}
                  </p>
                  <Show when={inc.body}>
                    <p class="mt-2 whitespace-pre-wrap text-sm">{inc.body}</p>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <div class="flex flex-col gap-8">
        <For each={data()?.components ?? []}>
          {(comp) => (
            <section>
              <div class="mb-2 flex items-baseline justify-between gap-4">
                <div>
                  <h2 class="text-base font-medium">{comp.name}</h2>
                  <p class="text-sm text-ink-muted">{comp.description}</p>
                </div>
                <div class="text-right">
                  <p class="text-sm">{STATUS_WORD[comp.status]}</p>
                  <p class="font-mono text-xs text-ink-muted">
                    {comp.uptimePct == null ? "— uptime" : `${comp.uptimePct}% uptime`}
                  </p>
                </div>
              </div>
              <LimitBar
                items={comp.sections.map((section) => ({
                  value: section.weight,
                  color: COLOR[section.state],
                  minWidth: section.state === "up" ? undefined : "4px",
                  title:
                    section.state === "down"
                      ? `${section.label} · incident`
                      : section.state === "miss"
                        ? `${section.label} · no data`
                        : `${section.label} · operational`,
                }))}
              />
              <div class="mt-1 flex justify-between font-mono text-[10px] text-ink-subtle">
                <span>90 days ago</span>
                <span>Today</span>
              </div>
            </section>
          )}
        </For>
      </div>

    </main>
  );
}

const root = document.getElementById("root");
if (root) render(() => <Page />, root);
