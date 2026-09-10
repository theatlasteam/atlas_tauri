import { Show, createSignal, For, type JSX, onCleanup, onMount } from "solid-js";
import {
  BoundingBox,
  CaretDown,
  ChartBar,
  ChatsCircle,
  Compass,
  Copy,
  DotsThree,
  File,
  Gear,
  House,
  Image,
  ListBullets,
  Moon,
  Palette,
  PencilSimple,
  Plus,
  PushPin,
  Sparkle,
  SquaresFour,
  Sun,
  Tray,
  Trash,
  User,
  WarningCircle,
} from "phosphor-solid-js";
import logo from "../assets/logo.svg";
import {
  Alert,
  AppShell,
  Avatar,
  Badge,
  Banner,
  BottomNav,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Bialog,
  Dialog,
  EmptyState,
  IconButton,
  Kbd,
  List,
  ListItem,
  Menu,
  Navbar,
  NavbarActions,
  NavbarBrand,
  NavbarLink,
  NavbarLinks,
  AiMessage,
  Combobox,
  Composer,
  Conversation,
  type ConversationMessage,
  MessageBubble,
  LimitBar,
  Progress,
  Sidebar,
  Skeleton,
  Slider,
  Switch,
  Tabs,
  TextArea,
  TextField,
  Toast,
  Tooltip,
} from "@atlas/ui";

const ACCENTS: { id: string; hex: string }[] = [
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
];

const SECTIONS = [
  { id: "overview", label: "Overview", icon: <House size={18} /> },
  { id: "buttons", label: "Buttons", icon: <SquaresFour size={18} /> },
  { id: "inputs", label: "Inputs", icon: <Palette size={18} /> },
  { id: "alerts", label: "Alert", icon: <WarningCircle size={18} /> },
  { id: "progress", label: "Progress", icon: <ChartBar size={18} /> },
  { id: "limitbar", label: "Limit bar", icon: <BoundingBox size={18} /> },
  { id: "dialog", label: "Dialog", icon: <ChatsCircle size={18} /> },
  { id: "bialog", label: "Bialog", icon: <Trash size={18} /> },
  { id: "toast", label: "Toast", icon: <Tray size={18} /> },
  { id: "empty", label: "Empty state", icon: <Tray size={18} /> },
  { id: "navigation", label: "Navigation", icon: <Compass size={18} /> },
  { id: "badges", label: "Badges", icon: <User size={18} /> },
  { id: "list", label: "List", icon: <ListBullets size={18} /> },
  { id: "skeleton", label: "Skeleton", icon: <SquaresFour size={18} /> },
  { id: "messages", label: "Messages", icon: <ChatsCircle size={18} /> },
  { id: "composer", label: "Composer", icon: <ChatsCircle size={18} /> },
  { id: "ai", label: "AI", icon: <Sparkle size={18} /> },
];

function Section(props: { id: string; title: string; lead?: string; children: JSX.Element }) {
  return (
    <section id={props.id} class="scroll-mt-6 space-y-4">
      <div>
        <h2 class="font-heading text-xl font-semibold text-ink">{props.title}</h2>
        {props.lead && <p class="mt-1 text-sm text-ink-muted">{props.lead}</p>}
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
  const [on, setOn] = createSignal(true);
  const [checked, setChecked] = createSignal(false);
  const [tab, setTab] = createSignal("account");
  const [dialog, setDialog] = createSignal(false);
  const [nav, setNav] = createSignal("overview");
  const [bottom, setBottom] = createSignal("chats");
  const [slider, setSlider] = createSignal(0.62);
  const [toast, setToast] = createSignal(false);
  const [banner, setBanner] = createSignal(true);
  const [select, setSelect] = createSignal("en");
  const [composerDraft, setComposerDraft] = createSignal("");
  const [recording, setRecording] = createSignal(false);
  const [prompt, setPrompt] = createSignal("");
  const [promptLoading, setPromptLoading] = createSignal(false);
  const [loaderPattern, setLoaderPattern] = createSignal<"hollow" | "random">("hollow");
  const [model, setModel] = createSignal("grok-4.5");
  const [thread, setThread] = createSignal<ConversationMessage[]>([
    { id: "a1", role: "assistant", content: "Want a hand summarizing that thread?" },
    { id: "u1", role: "user", content: "Yes — keep it to three bullets." },
    {
      id: "a2",
      role: "assistant",
      content: "Keys stay on-device. Groups use the same protocol. Calls are end-to-end as well.",
    },
  ]);

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }
  function applyAccent(next: string) {
    setAccent(next);
    document.documentElement.setAttribute("data-accent", next);
  }

  let toastTimer = 0;
  function showToast() {
    setToast(true);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(false), 2200);
  }

  onCleanup(() => window.clearTimeout(toastTimer));

  onMount(() => {
    const ids = SECTIONS.map((s) => s.id);
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setNav(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.25, 0.5] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    onCleanup(() => obs.disconnect());
  });

  return (
    <AppShell
      sidebar={
        <Sidebar
          variant="expanded"
          header={
            <a href="/" onClick={(e) => { if (props.onOpenApp) { e.preventDefault(); props.onOpenApp(); } }} class="flex items-center gap-2 px-1 py-1.5 font-heading text-sm font-semibold text-ink">
              <img src={logo} alt="" width="22" height="16" />
              Atlas UI
            </a>
          }
          groups={[
            {
              label: "Docs",
              items: SECTIONS.map((s) => ({
                id: s.id,
                href: `#${s.id}`,
                label: s.label,
                icon: s.icon,
                active: nav() === s.id,
                onClick: () => setNav(s.id),
              })),
            },
            {
              label: "Elsewhere",
              items: [
                { id: "app", href: "/app", label: "Messenger", icon: <ChatsCircle size={18} /> },
                { id: "site", href: "/", label: "Marketing", icon: <Gear size={18} /> },
              ],
            },
          ]}
          footer={
            <div class="flex items-center gap-2 px-1 py-1 text-xs text-ink-subtle">
              <Avatar name="Atlas" size={22} />
              @atlas/ui
            </div>
          }
        />
      }
      top={
        <Navbar variant="bar">
          <NavbarBrand href="/design">
            <span class="hidden sm:inline">Design system</span>
            <span class="sm:hidden">UI</span>
          </NavbarBrand>
          <NavbarLinks>
            <NavbarLink href="/">Home</NavbarLink>
            <NavbarLink href="/plugins">Plugins</NavbarLink>
            <NavbarLink href="/bots">Bots</NavbarLink>
            <NavbarLink href="/docs">Docs</NavbarLink>
            <NavbarLink href="/design">Design</NavbarLink>
          </NavbarLinks>
          <NavbarActions>
            <Tooltip label={theme() === "dark" ? "Light mode" : "Dark mode"}>
              <IconButton
                ariaLabel="Toggle theme"
                onClick={() => applyTheme(theme() === "dark" ? "light" : "dark")}
              >
                {theme() === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </IconButton>
            </Tooltip>
            <Menu
              trigger={
                <IconButton ariaLabel="More">
                  <DotsThree size={18} />
                </IconButton>
              }
              items={[
                { id: "copy", label: "Copy import", icon: <Copy size={16} />, onSelect: () => showToast() },
                { id: "app", label: "Open app", icon: <SquaresFour size={16} />, onSelect: () => props.onOpenApp ? props.onOpenApp() : (window.location.href = "/app") },
              ]}
            />
          </NavbarActions>
        </Navbar>
      }
    >
      <Show when={banner()}>
        <Banner
          onDismiss={() => setBanner(false)}
          action={
            <Button size="sm" variant="ghost" href="/app">
              Open app
            </Button>
          }
        >
          Same tokens as the messenger. Try an accent, then scroll — the sidebar stays put.
        </Banner>
      </Show>

      <div class="mx-auto max-w-3xl space-y-16 px-6 py-10 pb-24">
        <Section id="overview" title="Atlas UI" lead="Shared Solid primitives for the messenger, PWA, and this site. Import from @atlas/ui.">
          <Breadcrumbs items={[{ href: "/", label: "Atlas" }, { href: "/design", label: "Design" }, { label: "Overview" }]} />
          <Card title="Accent" description="Tokens tint surfaces from the active hue. Same ramp as the app.">
            <div class="flex flex-wrap gap-2">
              <For each={ACCENTS}>
                {(item) => (
                  <button
                    type="button"
                    onClick={() => applyAccent(item.id)}
                    class="h-8 w-8 rounded-full border border-border transition hover:scale-105"
                    style={{ background: item.hex }}
                    classList={{ "ring-2 ring-ink ring-offset-2 ring-offset-bg": accent() === item.id }}
                    aria-label={item.id}
                  />
                )}
              </For>
            </div>
            <p class="mt-3 text-xs text-ink-subtle">
              Active <span class="font-medium text-ink">{accent()}</span> · import{" "}
              <code class="rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] text-accent">{"import { Button } from \"@atlas/ui\""}</code>
            </p>
          </Card>
        </Section>

        <Section id="buttons" title="Buttons" lead="Pills with primary / soft / ghost / danger. Icon buttons and menus sit next to them.">
          <Card>
            <div class="flex flex-wrap items-center gap-2.5">
              <Button>Primary</Button>
              <Button variant="soft">Soft</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
              <Tooltip label="New chat">
                <IconButton ariaLabel="New chat">
                  <Plus size={16} />
                </IconButton>
              </Tooltip>
              <Menu
                trigger={
                  <Button variant="ghost" size="sm">
                    Menu <CaretDown size={12} />
                  </Button>
                }
                items={[
                  { id: "edit", label: "Edit", icon: <PencilSimple size={16} /> },
                  { id: "pin", label: "Pin", icon: <PushPin size={16} /> },
                  { id: "del", label: "Delete", icon: <Trash size={16} />, danger: true, onSelect: () => setDialog(true) },
                ]}
              />
            </div>
            <p class="mt-4 text-xs text-ink-subtle">
              Keyboard <Kbd>⌘</Kbd> <Kbd>K</Kbd> is a typical command palette shortcut.
            </p>
          </Card>
        </Section>

        <Section id="inputs" title="Inputs" lead="Fields, selects, switches, sliders — all using the same border and focus ring.">
          <div class="grid gap-4 sm:grid-cols-2">
            <Card class="space-y-4 sm:col-span-2">
              <div class="grid gap-4 sm:grid-cols-2">
                <TextField label="Display name" placeholder="Ada Lovelace" hint="Shown to people you chat with." />
                <Combobox
                  label="Language"
                  value={select()}
                  onChange={setSelect}
                  placeholder="Search languages…"
                  hint="Type to filter, arrows to move, Enter to pick."
                  options={[
                    { value: "en", label: "English", hint: "en" },
                    { value: "ru", label: "Русский", hint: "ru" },
                    { value: "de", label: "Deutsch", hint: "de" },
                    { value: "es", label: "Español", hint: "es" },
                    { value: "fr", label: "Français", hint: "fr" },
                    { value: "ja", label: "日本語", hint: "ja" },
                    { value: "zh", label: "中文", hint: "zh" },
                  ]}
                />
              </div>
              <Combobox
                label="Accent"
                value={accent()}
                onChange={applyAccent}
                placeholder="Search accents…"
                options={ACCENTS.map((a) => ({ value: a.id, label: a.id, hint: a.hex }))}
              />
              <TextArea label="Bio" placeholder="A short note…" hint="Markdown is fine." />
              <div class="flex flex-wrap items-center justify-between gap-4">
                <Switch checked={on()} onChange={setOn} label="Notifications" />
                <span class="text-sm text-ink-muted">{on() ? "On" : "Off"}</span>
                <Checkbox checked={checked()} onChange={setChecked} label="Read receipts" />
              </div>
              <Slider label="Media quality" value={slider()} onChange={setSlider} />
              <Slider label="Volume" min={0} max={100} value={slider() * 100} onChange={(v) => setSlider(v / 100)} />
            </Card>
          </div>
        </Section>

        <Section id="alerts" title="Alert">
          <Card>
            <div class="space-y-3">
              <Alert title="Keys ready">This device is enrolled for E2EE.</Alert>
              <Alert tone="warning" title="Unsigned build">
                macOS will warn until the app is notarized.
              </Alert>
              <Alert tone="danger" title="Couldn’t send">
                Check the network and try again.
              </Alert>
            </div>
          </Card>
        </Section>

        <Section id="progress" title="Progress">
          <Card>
            <div class="space-y-4">
              <Progress label="Uploading voice note" value={slider() * 100} />
              <Progress label="Almost done" value={92} />
            </div>
          </Card>
        </Section>

        <Section id="limitbar" title="Limit bar">
          <Card>
            <LimitBar
              label="Storage"
              max={100}
              items={[
                { value: 42, label: "Images" },
                { value: 18, label: "Voice" },
                { value: 9, label: "Other" },
              ]}
            />
          </Card>
        </Section>

        <Section id="dialog" title="Dialog">
          <Card>
            <Button variant="soft" onClick={() => setDialog(true)}>
              Open dialog
            </Button>
          </Card>
          <Dialog
            open={dialog()}
            onOpenChange={setDialog}
            title="Delete conversation?"
            description="This only removes it from this device. The other person still has their copy."
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialog(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => setDialog(false)}>
                  Delete
                </Button>
              </>
            }
          >
            <p class="text-sm text-ink-muted">You can restore it from backups if you have them enabled.</p>
          </Dialog>
        </Section>

        <Section
          id="bialog"
          title="Bialog"
          lead="A button that becomes the dialog — it grows from the click instead of popping up in the middle of the screen."
        >
          <Card>
            <div class="flex flex-wrap items-center gap-3">
              <Bialog
                variant="danger"
                label={
                  <>
                    <Trash size={16} />
                    Delete account
                  </>
                }
                title="Delete your account?"
                description="This permanently removes your profile, chats, and keys from Atlas. You cannot undo this."
                cancelLabel="Keep account"
              >
                <p class="text-ink-muted">Sessions on other devices will be signed out. Shared groups stay; you just leave them.</p>
              </Bialog>
              <Bialog
                variant="soft"
                label="Export data"
                title="Export your data?"
                description="We’ll pack your chats into an archive. It can take a minute."
              />
            </div>
          </Card>
        </Section>

        <Section id="toast" title="Toast">
          <Card>
            <Button variant="ghost" onClick={showToast}>
              Show toast
            </Button>
          </Card>
          <Toast open={toast()}>Copied import path</Toast>
        </Section>

        <Section id="empty" title="Empty state">
          <Card padded={false}>
            <EmptyState
              icon={<ChatsCircle size={26} />}
              title="No messages yet"
              subtitle="Start a conversation — it stays on this device until you send it."
              action={<Button size="sm">New chat</Button>}
            />
          </Card>
        </Section>

        <Section id="navigation" title="Navigation" lead="Navbar, sidebar (this page), tabs, and a mobile bottom bar.">
          <Tabs
            value={tab()}
            onChange={setTab}
            items={[
              { id: "account", label: "Account" },
              { id: "privacy", label: "Privacy" },
              { id: "plugins", label: "Plugins" },
            ]}
          />
          <Card padded={false} class="overflow-hidden">
            <div class="border-b border-border bg-bg px-4 py-2 text-xs font-medium text-ink-subtle">Phone chrome</div>
            <div class="mx-auto max-w-xs">
              <div class="flex h-48 flex-col bg-bg">
                <div class="flex-1 p-4 text-sm text-ink-muted">Chat list</div>
                <BottomNav
                  items={[
                    {
                      id: "chats",
                      label: "Chats",
                      icon: <ChatsCircle size={20} />,
                      active: bottom() === "chats",
                      onClick: () => setBottom("chats"),
                    },
                    {
                      id: "compass",
                      label: "Compass",
                      icon: <Compass size={20} />,
                      active: bottom() === "compass",
                      onClick: () => setBottom("compass"),
                    },
                    {
                      id: "you",
                      label: "You",
                      icon: <User size={20} />,
                      active: bottom() === "you",
                      onClick: () => setBottom("you"),
                    },
                  ]}
                />
              </div>
            </div>
          </Card>
        </Section>

        <Section id="badges" title="Badges">
          <Card>
            <div class="flex flex-wrap items-center gap-2">
              <Badge>Muted</Badge>
              <Badge color="accent">Accent</Badge>
              <Badge color="success">Online</Badge>
              <Badge color="danger">Blocked</Badge>
              <Avatar name="Ada Lovelace" />
              <Avatar name="Alan Turing" size={44} />
              <Avatar name="Atlas" size={28} />
            </div>
          </Card>
        </Section>

        <Section id="list" title="List">
          <List>
            <ListItem
              leading={<Avatar name="Ada Lovelace" size={40} />}
              title="Ada Lovelace"
              description="The analytical engine notes"
              trailing={<Badge color="accent">E2EE</Badge>}
              onClick={() => undefined}
            />
            <ListItem
              leading={<Avatar name="Alan Turing" size={40} />}
              title="Alan Turing"
              description="On computable numbers…"
              trailing={<span class="text-xs text-ink-subtle">2m</span>}
              onClick={() => undefined}
            />
            <ListItem
              leading={<Avatar name="Grace Hopper" size={40} />}
              title="Grace Hopper"
              description="Drafting the compiler notes"
              trailing={<Badge>3</Badge>}
              onClick={() => undefined}
            />
          </List>
        </Section>

        <Section id="skeleton" title="Skeleton">
          <Card>
            <div class="flex items-center gap-3">
              <Skeleton class="h-12 w-12 rounded-full" />
              <div class="flex-1 space-y-2">
                <Skeleton class="h-3 w-1/3" />
                <Skeleton class="h-3 w-2/3" />
              </div>
            </div>
          </Card>
        </Section>

        <Section id="messages" title="Messages">
          <Card>
            <div class="space-y-3">
              <MessageBubble side="received" name="Ada" time="14:02">
                Are you free after standup?
              </MessageBubble>
              <MessageBubble side="sent" time="14:03" status="read">
                Give me ten minutes.
              </MessageBubble>
              <MessageBubble side="received" name="Ada" time="14:03">
                Ping me when you’re done.
              </MessageBubble>
              <MessageBubble side="sent" time="14:04" status="sent">
                On my way.
              </MessageBubble>
              <MessageBubble side="received" name="Atlas" time="14:05" comments={{ count: 0 }}>
                Channel post — comments on.
              </MessageBubble>
              <MessageBubble side="received" name="Atlas" time="14:06" comments={{ count: 12 }}>
                Twelve people replied.
              </MessageBubble>
              <MessageBubble
                side="received"
                name="Weather Bot"
                time="14:07"
                keyboard={[
                  { label: "Weather", data: "/weather", icon: "☀️" },
                  { label: "Help", data: "/help", icon: "❓" },
                  { label: "Atlas", url: "https://atlasmsg.app", icon: "✨", row: 1 },
                ]}
              >
                Welcome! Pick something.
              </MessageBubble>
            </div>
          </Card>
        </Section>

        <Section id="composer" title="Composer">
          <Card>
            <Composer
              value={composerDraft()}
              onChange={setComposerDraft}
              recording={recording()}
              placeholder="Message"
              addItems={[
                { id: "photo", label: "Photo", icon: <Image size={16} /> },
                { id: "file", label: "File", icon: <File size={16} /> },
              ]}
              onVoice={() => setRecording((v) => !v)}
              onSubmit={() => {
                setComposerDraft("");
                setRecording(false);
              }}
            />
            <p class="mt-2 text-xs text-ink-subtle">Empty → mic · type → send · + for extras</p>
          </Card>
        </Section>

        <Section id="ai" title="AI" lead="Each piece on its own, then assembled.">
          <Card title="AiMessage" description="Assistant copy, or the thinking row.">
            <div class="space-y-6">
              <AiMessage name="Atlas">Three bullets, no preamble. Keys on-device, same protocol in groups, E2EE calls.</AiMessage>
              <AiMessage thinking thinkingLabel="Churring..." name="Atlas" loaderPattern={loaderPattern()} />
            </div>
          </Card>

          <Card title="Conversation" description="Thread plus composer." padded={false}>
            <div class="h-[26rem]">
              <Conversation
                class="h-full rounded-none border-0"
                messages={thread()}
                thinking={promptLoading()}
                thinkingLabel="Churring..."
                loaderPattern={loaderPattern()}
                assistantName="Atlas"
                prompt={{
                  value: prompt(),
                  onChange: setPrompt,
                  placeholder: "Message",
                  models: [
                    { id: "grok-4.5", label: "Grok 4.5", hint: "default" },
                    { id: "grok-4", label: "Grok 4" },
                    { id: "grok-3-mini", label: "Grok 3 mini", hint: "fast" },
                  ],
                  model: model(),
                  onModelChange: setModel,
                  addItems: [
                    {
                      id: "pattern",
                      label: loaderPattern() === "hollow" ? "Loader: random" : "Loader: hollow",
                      icon: <Sparkle size={16} />,
                      onSelect: () => setLoaderPattern((p) => (p === "hollow" ? "random" : "hollow")),
                    },
                  ],
                  onSubmit: (text) => {
                    setThread((msgs) => [...msgs, { id: crypto.randomUUID(), role: "user", content: text }]);
                    setPrompt("");
                    setPromptLoading(true);
                    window.setTimeout(() => {
                      setThread((msgs) => [
                        ...msgs,
                        { id: crypto.randomUUID(), role: "assistant", content: text },
                      ]);
                      setPromptLoading(false);
                    }, 1800);
                  },
                }}
              />
            </div>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
