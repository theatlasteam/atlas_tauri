import { For, Show, createMemo, createSignal, onMount, type JSX } from "solid-js";
import {
  Copy,
  House,
  Key,
  Keyboard,
  List,
  Moon,
  PaintBucket,
  Path,
  Sparkle,
  SquaresFour,
  Sun,
  TextT,
  ChatCircle,
  Warning,
} from "phosphor-solid-js";
import {
  Alert,
  AppShell,
  Badge,
  Bialog,
  BottomNav,
  Button,
  Card,
  Checkbox,
  Combobox,
  Composer,
  Dialog,
  EmptyState,
  IconButton,
  Logo,
  MessageBubble,
  NavIcon,
  playNavIcon,
  Sidebar,
  Slider,
  Switch,
  TextField,
  Toast,
} from "@atlas/ui";

const ACCENTS = [
  { id: "amber", hex: "#c9772e" },
  { id: "jade", hex: "#2f8f6e" },
  { id: "violet", hex: "#7b5ec9" },
  { id: "rose", hex: "#c9436f" },
  { id: "slate", hex: "#4a6b7c" },
  { id: "sky", hex: "#2f6fc9" },
  { id: "teal", hex: "#1f8f8a" },
  { id: "coral", hex: "#d9603f" },
  { id: "indigo", hex: "#4550b8" },
  { id: "plum", hex: "#9c4fa0" },
] as const;

const NAV: { id: string; label: string; group: string; icon: () => JSX.Element }[] = [
  { id: "overview", label: "Overview", group: "Start", icon: () => <House size={18} /> },
  { id: "foundations", label: "Foundations", group: "Start", icon: () => <SquaresFour size={18} /> },
  { id: "color", label: "Color", group: "Foundations", icon: () => <PaintBucket size={18} /> },
  { id: "type", label: "Typography", group: "Foundations", icon: () => <TextT size={18} /> },
  { id: "motion", label: "Motion", group: "Foundations", icon: () => <Sparkle size={18} /> },
  { id: "a11y", label: "Accessibility", group: "Foundations", icon: () => <Key size={18} /> },
  { id: "button", label: "Button", group: "Components", icon: () => <SquaresFour size={18} /> },
  { id: "inputs", label: "Inputs", group: "Components", icon: () => <Keyboard size={18} /> },
  { id: "dialog", label: "Dialog", group: "Components", icon: () => <Warning size={18} /> },
  { id: "composer", label: "Composer", group: "Messaging", icon: () => <ChatCircle size={18} /> },
  { id: "messages", label: "Messages", group: "Messaging", icon: () => <ChatCircle size={18} /> },
  { id: "nav", label: "Navigation", group: "Patterns", icon: () => <Path size={18} /> },
  { id: "brand", label: "Logo & brand", group: "Brand", icon: () => <Sparkle size={18} /> },
];

function Code(props: { children: string }) {
  const [ok, setOk] = createSignal(false);
  return (
    <div class="relative">
      <pre class="overflow-x-auto rounded-xl border border-border bg-surface-raised p-3 font-mono text-[13px] text-ink">{props.children}</pre>
      <button
        type="button"
        class="atlas-focus absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-surface text-ink-muted"
        aria-label="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(props.children);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        }}
      >
        {ok() ? "✓" : <Copy size={16} />}
      </button>
    </div>
  );
}

function DoDont(props: { doTitle: string; dontTitle: string; do: JSX.Element; dont: JSX.Element }) {
  return (
    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-2xl border border-success/40 bg-surface p-4">
        <p class="mb-3 text-sm font-semibold text-success">Do · {props.doTitle}</p>
        {props.do}
      </div>
      <div class="rounded-2xl border border-danger/40 bg-surface p-4">
        <p class="mb-3 text-sm font-semibold text-danger">Don’t · {props.dontTitle}</p>
        {props.dont}
      </div>
    </div>
  );
}

function H(props: { id: string; kicker?: string; title: string; lead?: string; status?: string; children: JSX.Element }) {
  return (
    <section id={props.id} class="scroll-mt-24 space-y-6 border-b border-border py-12 last:border-0">
      <div>
        <Show when={props.kicker}>
          <p class="text-sm font-medium uppercase tracking-wide text-ink-subtle">{props.kicker}</p>
        </Show>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <h2 class="font-heading text-3xl font-semibold tracking-tight text-ink">{props.title}</h2>
          <Show when={props.status}>
            <Badge>{props.status}</Badge>
          </Show>
        </div>
        <Show when={props.lead}>
          <p class="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{props.lead}</p>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

export default function DesignSystem(props: { onOpenApp?: () => void } = {}) {
  const [theme, setTheme] = createSignal<"light" | "dark">(
    (document.documentElement.dataset.theme as "light" | "dark") ?? "light",
  );
  const [accent, setAccent] = createSignal(document.documentElement.dataset.accent || "amber");
  const [query, setQuery] = createSignal("");
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [dialog, setDialog] = createSignal(false);
  const [toast, setToast] = createSignal(false);
  const [on, setOn] = createSignal(true);
  const [checked, setChecked] = createSignal(false);
  const [slider, setSlider] = createSignal(0.4);
  const [select, setSelect] = createSignal("en");
  const [draft, setDraft] = createSignal("");
  const [nav, setNav] = createSignal("chats");

  const filteredNav = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return NAV;
    return NAV.filter((n) => n.label.toLowerCase().includes(q) || n.id.includes(q) || n.group.toLowerCase().includes(q));
  });

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }
  function applyAccent(id: string) {
    setAccent(id);
    document.documentElement.setAttribute("data-accent", id);
  }

  onMount(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash) document.getElementById(hash)?.scrollIntoView();
  });

  const sidebar = (
    <Sidebar
      variant="expanded"
      header={
        <a href="#overview" class="flex items-center gap-2.5 px-1 py-1 no-underline">
          <Logo width={32} static />
          <span>
            <span class="block font-heading text-sm font-semibold leading-tight text-ink">Atlas</span>
            <span class="block text-[13px] leading-tight text-ink-subtle">Design system</span>
          </span>
        </a>
      }
      items={filteredNav().map((n) => ({
        id: n.id,
        href: `#${n.id}`,
        label: n.label,
        icon: n.icon(),
        active: false,
        onClick: () => setMenuOpen(false),
      }))}
    />
  );

  return (
    <AppShell
      nav="auto"
      menuOpen={menuOpen()}
      onMenuOpen={setMenuOpen}
      menuButton={
        <button
          type="button"
          class="atlas-focus m-2 grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface md:hidden"
          aria-label="Open design navigation"
          aria-expanded={menuOpen()}
          onClick={() => setMenuOpen(true)}
        >
          <List size={20} />
        </button>
      }
      sidebar={sidebar}
      top={
        <header class="flex flex-wrap items-center gap-2 border-b border-border bg-appbar px-3 py-2">
          <p class="mr-auto font-heading text-sm font-semibold">Atlas design system</p>
          <input
            class="atlas-focus min-h-11 min-w-[10rem] flex-1 rounded-full border border-border bg-surface px-3 text-sm md:max-w-xs"
            placeholder="Search…"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            aria-label="Search the spec"
          />
          <IconButton ariaLabel="Toggle theme" onClick={() => applyTheme(theme() === "dark" ? "light" : "dark")}>
            {theme() === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
          <Show when={props.onOpenApp}>
            <Button size="sm" href="/app" onClick={() => props.onOpenApp?.()}>
              Open app
            </Button>
          </Show>
        </header>
      }
    >
      <div class="mx-auto max-w-4xl px-4 pb-24 pt-4 sm:px-8">
        <H id="overview" kicker="Atlas" title="A living messenger system" lead="Warm surfaces, round mark, accent as material — not a paint chip. This spec is the product contract for @atlas/ui." status="stable">
          <div class="grid gap-4 sm:grid-cols-3">
            <Card class="p-4">
              <p class="font-heading font-semibold">One material</p>
              <p class="mt-1 text-sm text-ink-muted">Accent tints background, chrome, and brand together.</p>
            </Card>
            <Card class="p-4">
              <p class="font-heading font-semibold">Messenger-first</p>
              <p class="mt-1 text-sm text-ink-muted">Composer, bubbles, and 44px hits before decorative chrome.</p>
            </Card>
            <Card class="p-4">
              <p class="font-heading font-semibold">Documented</p>
              <p class="mt-1 text-sm text-ink-muted">Anatomy, states, Do/Don’t, keyboard, and copyable Solid.</p>
            </Card>
          </div>
        </H>

        <H id="foundations" kicker="Foundations" title="Tokens" lead="tokens.css is the only place color, radius, motion, and type roles are defined. App.css keeps wallpapers and user fonts.">
          <Code>{`:root {
  --motion-fast: 140ms;
  --motion-ui: 220ms;
  --motion-expressive: 800ms;
  --control-hit: 44px;
}`}</Code>
        </H>

        <H id="color" title="Color" lead="Semantic names, not paint names. Danger / warning / success / verified never follow accent.">
          <div class="flex flex-wrap gap-2">
            <For each={ACCENTS}>
              {(a) => (
                <button
                  type="button"
                  class="atlas-focus h-11 w-11 rounded-xl"
                  style={{ background: a.hex }}
                  aria-label={a.id}
                  aria-pressed={accent() === a.id}
                  onClick={() => applyAccent(a.id)}
                />
              )}
            </For>
          </div>
          <DoDont
            doTitle="Accent for brand and selection"
            dontTitle="Accent for danger"
            do={
              <div class="flex flex-wrap items-center gap-2">
                <Button>Send</Button>
                <Button variant="soft">Selected</Button>
              </div>
            }
            dont={
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="danger">Send</Button>
                <Button variant="danger">Save</Button>
              </div>
            }
          />
        </H>

        <H id="type" title="Typography" lead="Manrope for headings and brand. Inter (site) / Manrope (app chrome) for body. Caption floor is 13px.">
          <div class="space-y-2">
            <p class="font-heading text-4xl font-semibold">Display</p>
            <p class="font-heading text-3xl font-semibold">Heading 1</p>
            <p class="text-[17px]">Body large — 17px reading.</p>
            <p class="text-[15px]">Body — 15px UI.</p>
            <p class="text-sm font-medium">Label — 14px actions.</p>
            <p class="text-[13px] text-ink-muted">Caption — 13px metadata.</p>
          </div>
        </H>

        <H id="motion" title="Motion" lead="Fast 140ms, UI 220ms, expressive 800ms. Never transition every button globally.">
          <DoDont
            doTitle="One-shot on select"
            dontTitle="Loop forever"
            do={
              <button type="button" class="atlas-focus flex h-11 items-center gap-2 rounded-xl px-3" onClick={() => playNavIcon("settings")}>
                <NavIcon name="settings" />
                <span class="text-sm">Tap settings</span>
              </button>
            }
            dont={
              <div class="flex h-11 items-center gap-2 px-3 text-ink-subtle">
                <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                <span class="text-sm">Always spinning</span>
              </div>
            }
          />
        </H>

        <H id="a11y" title="Accessibility" lead="Focus-visible accent ring, 44×44 hit targets on touch, WCAG AA on every preset.">
          <DoDont
            doTitle="44px hit + label"
            dontTitle="8px icon, no name"
            do={<IconButton ariaLabel="Settings"><NavIcon name="settings" size={18} /></IconButton>}
            dont={
              <button type="button" class="h-4 w-4 text-ink-subtle" aria-hidden>
                <NavIcon name="settings" size={12} />
              </button>
            }
          />
        </H>

        <H id="button" kicker="Components" title="Button" status="stable" lead="Primary / soft / ghost / danger. Background is inline CSS so production purge cannot drop danger.">
          <div class="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
          <DoDont
            doTitle="One primary verb"
            dontTitle="Two primaries"
            do={
              <div class="flex gap-2">
                <Button>Save</Button>
                <Button variant="ghost">Cancel</Button>
              </div>
            }
            dont={
              <div class="flex gap-2">
                <Button>Save</Button>
                <Button>Publish</Button>
              </div>
            }
          />
          <Code>{`<Button variant="danger" loading={busy()}>Delete</Button>`}</Code>
        </H>

        <H id="inputs" title="Inputs" status="stable" lead="Custom Combobox only — never a native select for product UI.">
          <div class="grid max-w-md gap-4">
            <TextField label="Display name" placeholder="Atlas" />
            <Combobox
              label="Language"
              value={select()}
              onChange={setSelect}
              options={[
                { value: "en", label: "English" },
                { value: "ru", label: "Русский" },
              ]}
            />
            <Switch checked={on()} onChange={setOn} label="Read receipts" />
            <Checkbox checked={checked()} onChange={setChecked} label="Notifications" />
            <Slider value={slider()} onChange={setSlider} label="Volume" />
          </div>
        </H>

        <H id="dialog" title="Dialog" status="stable" lead="Centered on desktop, sheet on mobile. MorphDialog (alias Bialog) expands from a button.">
          <div class="flex flex-wrap gap-2">
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Bialog title="Delete account?" description="This cannot be undone." label="Morph dialog" variant="danger" onConfirm={() => {}}>
              <p class="text-sm text-ink-muted">History, keys, and bots go with it.</p>
            </Bialog>
            <Button variant="ghost" onClick={() => { setToast(true); setTimeout(() => setToast(false), 2000); }}>Toast</Button>
          </div>
          <DoDont
            doTitle="Short title, safe action stays"
            dontTitle="Vague title, all buttons equal"
            do={
              <div class="flex justify-end gap-2">
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger">Delete</Button>
              </div>
            }
            dont={
              <div class="flex justify-end gap-2">
                <Button>OK</Button>
                <Button>OK</Button>
                <Button>OK</Button>
              </div>
            }
          />
          <Dialog open={dialog()} onOpenChange={setDialog} title="Leave group?" description="You can be added back later." footer={<Button onClick={() => setDialog(false)}>OK</Button>}>
            <p class="text-sm text-ink-muted">Members will see that you left.</p>
          </Dialog>
          <Toast open={toast()}>Copied</Toast>
        </H>

        <H id="composer" kicker="Messaging" title="Composer" status="beta" lead="One surface. Empty → mic, text → send, same 44px slot.">
          <Composer value={draft()} onChange={setDraft} onSubmit={() => setDraft("")} placeholder="Message" />
          <DoDont
            doTitle="Stable 44px action"
            dontTitle="Jumping width"
            do={<Composer value="Hi" onChange={() => {}} />}
            dont={
              <div class="flex items-center gap-2">
                <input class="min-w-0 flex-1 rounded-full border border-border px-3 py-1 text-sm" value="Hi" readOnly />
                <button type="button" class="rounded-full bg-accent px-5 py-1 text-xs text-accent-ink">Send</button>
              </div>
            }
          />
        </H>

        <H id="messages" title="Messages" status="stable" lead="Sent uses accent. Received uses raised surface. Group consecutive authors; max 560px desktop / 86% mobile.">
          <div class="space-y-1 rounded-2xl bg-bg p-4">
            <div class="flex justify-start">
              <MessageBubble side="received">Keys stay on this device.</MessageBubble>
            </div>
            <div class="flex justify-start">
              <MessageBubble side="received">Groups use Megolm.</MessageBubble>
            </div>
            <div class="mt-3 flex justify-end">
              <MessageBubble side="sent">Got it.</MessageBubble>
            </div>
          </div>
        </H>

        <H id="nav" kicker="Patterns" title="Navigation" status="stable" lead="Rail on tablet, drawer under 768px, expanded ≥1024px. Active state is shape + contrast, not color alone.">
          <div class="overflow-hidden rounded-2xl border border-border">
            <BottomNav
              items={[
                { id: "chats", label: "Chats", icon: <NavIcon name="chats" />, active: nav() === "chats", onClick: () => { setNav("chats"); playNavIcon("chats"); } },
                { id: "calls", label: "Calls", icon: <NavIcon name="calls" />, active: nav() === "calls", onClick: () => { setNav("calls"); playNavIcon("calls"); } },
                { id: "compass", label: "Compass", icon: <NavIcon name="compass" />, active: nav() === "compass", onClick: () => { setNav("compass"); playNavIcon("compass"); } },
                { id: "profile", label: "You", icon: <NavIcon name="profile" />, active: nav() === "profile", onClick: () => { setNav("profile"); playNavIcon("profile"); } },
                { id: "settings", label: "Settings", icon: <NavIcon name="settings" />, active: nav() === "settings", onClick: () => { setNav("settings"); playNavIcon("settings"); } },
              ]}
            />
          </div>
          <DoDont
            doTitle="One active tab + one-shot motion"
            dontTitle="Tiny unlabeled icons"
            do={
              <div class="flex justify-around rounded-xl bg-surface py-2">
                <button type="button" class="flex flex-col items-center text-[13px] text-accent" onClick={() => playNavIcon("chats")}>
                  <NavIcon name="chats" />
                  Chats
                </button>
                <button type="button" class="flex flex-col items-center text-[13px] text-ink-subtle" onClick={() => playNavIcon("calls")}>
                  <NavIcon name="calls" />
                  Calls
                </button>
              </div>
            }
            dont={
              <div class="flex justify-around rounded-xl bg-surface py-2 opacity-70">
                <span class="text-[10px] text-accent">●</span>
                <span class="text-[10px]">○</span>
                <span class="text-[10px]">○</span>
              </div>
            }
          />
          <EmptyState title="No chats yet" subtitle="Start a conversation from search." />
          <Alert tone="warning">You’re offline. Messages will send when you’re back.</Alert>
        </H>

        <H id="brand" kicker="Brand" title="Logo" status="stable" lead="Shape is a mask. Accent gradient feathers from the top. Use the compact mark with a wordmark in chrome.">
          <div class="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-surface-raised px-5 py-6">
            <Logo width={72} />
            <div>
              <p class="font-heading text-2xl font-semibold text-ink">Atlas</p>
              <p class="mt-1 max-w-sm text-[15px] text-ink-muted">Tap an accent swatch in Color — the gradient reveals from the top. Dense UI uses the 32px static mark.</p>
            </div>
          </div>
          <DoDont
            doTitle="Keep proportions + wordmark"
            dontTitle="Stretch or drop the name"
            do={
              <div class="flex items-center gap-2">
                <Logo width={36} static />
                <span class="font-heading text-sm font-semibold">Atlas</span>
              </div>
            }
            dont={<div class="h-8 w-36 overflow-hidden opacity-50"><Logo width={140} static /></div>}
          />
        </H>
      </div>
    </AppShell>
  );
}
