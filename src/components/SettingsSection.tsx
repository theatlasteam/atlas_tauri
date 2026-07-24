import type { JSX } from "solid-js";
import { A } from "@solidjs/router";
import { ChevronRightIcon } from "../icons";

export function SettingsSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class="px-5 pb-6">
      <h2 class="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{props.title}</h2>
      <div class="divide-y divide-border rounded-2xl border border-border bg-surface">{props.children}</div>
    </section>
  );
}

export function SettingsRow(props: { label: string; description?: string; children?: JSX.Element }) {
  return (
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-ink">{props.label}</p>
        {props.description && <p class="text-xs text-ink-subtle">{props.description}</p>}
      </div>
      {props.children}
    </div>
  );
}

export function SettingsLinkRow(props: { href: string; label: string; description?: string; icon: (p: { size?: number; class?: string }) => JSX.Element }) {
  return (
    <A href={props.href} class="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 first:rounded-t-2xl last:rounded-b-2xl hover:bg-bg active:bg-bg">
      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <props.icon size={18} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-ink">{props.label}</p>
        {props.description && <p class="truncate text-xs text-ink-subtle">{props.description}</p>}
      </div>
      <ChevronRightIcon size={18} class="shrink-0 text-ink-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
    </A>
  );
}
