import { createResource, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  AndroidLogo,
  AppleLogo,
  CalendarBlank,
  ChatCircle,
  Code,
  DownloadSimple,
  GithubLogo,
  LinuxLogo,
  Lock,
  Moon,
  Newspaper,
  PaintBrush,
  Paperclip,
  Phone,
  Sun,
  Tag,
  WarningCircle,
  WindowsLogo,
} from "phosphor-solid-js";
import logo from "./assets/logo.svg";
import AnimatedButton from "./components/AnimatedButton";
import EmberShader from "./components/EmberShader";
import HeroShader from "./components/HeroShader";
import LanguageSwitcher from "./components/LanguageSwitcher";
import Reveal from "./components/Reveal";
import WaitlistModal from "./components/WaitlistModal";
import { getWaitlistCount } from "./lib/api";
import { t, type TranslationKey } from "./lib/i18n";
import { GITHUB_REPO, GITHUB_REPO_URL } from "./lib/repo";
import {
  assetsByPlatform,
  detectPlatform,
  fetchLatestRelease,
  formatBytes,
  formatDate,
  type Platform,
} from "./lib/releases";

const FEATURES: { icon: typeof Lock; titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { icon: Lock, titleKey: "features.e2ee.title", bodyKey: "features.e2ee.body" },
  { icon: ChatCircle, titleKey: "features.dm.title", bodyKey: "features.dm.body" },
  { icon: Phone, titleKey: "features.calls.title", bodyKey: "features.calls.body" },
  { icon: Paperclip, titleKey: "features.rich.title", bodyKey: "features.rich.body" },
  { icon: PaintBrush, titleKey: "features.theme.title", bodyKey: "features.theme.body" },
  { icon: Code, titleKey: "features.rust.title", bodyKey: "features.rust.body" },
];

const PLATFORM_ICONS: Record<Platform, typeof WindowsLogo> = {
  windows: WindowsLogo,
  "linux-deb": LinuxLogo,
  "linux-appimage": LinuxLogo,
  macos: AppleLogo,
  android: AndroidLogo,
};

const PLATFORM_NAMES: Record<Platform, string> = {
  windows: "Windows",
  "linux-deb": "Linux",
  "linux-appimage": "Linux",
  macos: "macOS",
  android: "Android",
};

const PLATFORM_DETAILS: Record<Platform, string> = {
  windows: ".msi installer",
  "linux-deb": ".deb package",
  "linux-appimage": "portable .AppImage",
  macos: "unsigned universal .dmg",
  android: "debug-signed .apk",
};

export default function App() {
  const [theme, setTheme] = createSignal<"light" | "dark">(
    (document.documentElement.dataset.theme as "light" | "dark") ?? "light",
  );
  const [release] = createResource(fetchLatestRelease);
  const platform = detectPlatform();
  const [waitlistOpen, setWaitlistOpen] = createSignal(false);
  const [waitlistCount, { refetch: refetchWaitlistCount }] = createResource(getWaitlistCount);

  // Compact pill once scrolled even slightly — the header floats over every
  // section below the hero, not just the dark one it starts flush against,
  // so it needs its own background as soon as it's not sitting at the top.
  const [scrolled, setScrolled] = createSignal(false);
  const onScroll = () => setScrolled(window.scrollY > 8);
  onMount(() => {
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => window.removeEventListener("scroll", onScroll));
  });

  function toggleTheme() {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }

  const primaryAsset = () => {
    if (release.state !== "ready") return undefined;
    const assets = assetsByPlatform(release()!);
    return assets.find((a) => a.platform === platform) ?? assets[0];
  };

  return (
    <div class="min-h-screen">
      <div class="grain-overlay" />

      <section class="relative flex min-h-screen flex-col overflow-hidden bg-[#0e0c0a] text-[#f2ede2]">
        <HeroShader />
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0e0c0a] via-transparent to-[#0e0c0a]/40" />

        <header
          class="fixed inset-x-0 top-0 z-40 px-3 transition-[padding-top] duration-300 ease-out sm:px-6"
          classList={{
            "pt-[max(var(--safe-top),0.75rem)]": !scrolled(),
            "pt-[max(var(--safe-top),1.25rem)]": scrolled(),
          }}
        >
          <div
            class="mx-auto flex w-full items-center justify-between rounded-pill shadow-lg transition-[max-width,padding,background-color,border-color,box-shadow] duration-300 ease-out"
            classList={{
              // `none` (default max-width, no shadow) can't be interpolated
              // to/from — the browser just snaps at some point mid-transition
              // instead of tweening, which (since this bar is laid out with
              // justify-between) reads as the logo/buttons jumping into
              // place. Real values on both ends — a max-width way past any
              // real viewport, and a same-shaped shadow at zero alpha —
              // fixes that.
              "max-w-[160rem] border border-transparent bg-transparent px-1 py-3 shadow-black/0 sm:px-4": !scrolled(),
              "max-w-3xl border border-white/10 bg-[#14110d]/80 px-4 py-2 shadow-black/20 backdrop-blur-md sm:px-5": scrolled(),
            }}
          >
            <a href="#top" class="flex items-center gap-2 font-heading text-lg font-semibold">
              <img src={logo} alt="" width="26" height="19" />
              Atlas
            </a>
            <nav class="hidden items-center gap-6 text-sm text-[#f2ede2]/75 sm:flex">
              <a href="#features" class="hover:text-[#f2ede2]">
                {t("nav.features")}
              </a>
              <a href="#download" class="hover:text-[#f2ede2]">
                {t("nav.download")}
              </a>
              <a href="#source" class="hover:text-[#f2ede2]">
                {t("nav.source")}
              </a>
              <a href="/plugins" class="hover:text-[#f2ede2]">
                {t("nav.plugins")}
              </a>
            </nav>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setWaitlistOpen(true)}
                aria-label={t("waitlist.cta")}
                title={t("waitlist.cta")}
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border border-white/15 bg-white/5 text-[#f2ede2]/90 backdrop-blur transition hover:bg-white/10"
              >
                <Newspaper size={16} />
              </button>
              <LanguageSwitcher compact={scrolled()} />
              <button
                type="button"
                onClick={toggleTheme}
                class="grid h-9 w-9 shrink-0 place-items-center rounded-pill border border-white/15 text-[#f2ede2]/75 transition hover:text-[#f2ede2]"
                aria-label="Toggle dark mode"
              >
                {theme() === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </header>

        <div
          id="top"
          class="relative z-10 mt-auto flex flex-col gap-6 px-6 pb-16 pt-24 sm:px-10 sm:pb-24 lg:max-w-2xl"
        >
          <a
            href="#download"
            class="inline-flex w-fit items-center gap-2 rounded-pill border border-white/15 bg-white/5 px-4 py-1.5 text-sm text-[#f2ede2]/80 backdrop-blur"
          >
            <Switch>
              <Match when={release.loading}>
                <span class="spinner" /> {t("hero.checking")}
              </Match>
              <Match when={release.error}>{t("hero.unavailable")}</Match>
              <Match when={release()}>{t("hero.latest", { tag: release()!.tag_name })}</Match>
            </Switch>
          </a>

          <h1 class="font-heading text-5xl font-semibold leading-[1.05] sm:text-6xl">
            {t("hero.title1")}
            <br />
            <span class="font-script text-7xl font-normal text-[#f5c98a] sm:text-8xl">{t("hero.title2")}</span>
          </h1>

          <p class="max-w-md text-lg text-[#f2ede2]/70">{t("hero.lede")}</p>

          <div class="flex flex-wrap items-center gap-3 pt-2">
            <AnimatedButton
              href={primaryAsset()?.asset.browser_download_url ?? "#download"}
              icon={DownloadSimple}
              label={() =>
                release.loading
                  ? t("hero.loading")
                  : primaryAsset()
                    ? t("hero.downloadFor", { platform: primaryAsset()!.label })
                    : t("hero.seeAll")
              }
            />
            <AnimatedButton
              href="#"
              icon={Newspaper}
              variant="ghost"
              label={() => t("waitlist.cta")}
              onClick={() => setWaitlistOpen(true)}
            />
          </div>

          <Show when={waitlistCount() !== undefined}>
            <p class="text-sm text-[#f2ede2]/60">
              {t("hero.waitlistCount", { count: String(waitlistCount()!) })}
            </p>
          </Show>
        </div>
      </section>

      <main>
        <section id="features" class="mx-auto max-w-4xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <h2 class="mb-12 font-heading text-3xl font-semibold">{t("features.title")}</h2>
          </Reveal>
          <div class="divide-y divide-border border-y border-border">
            <For each={FEATURES}>
              {(feature, i) => (
                <Reveal delay={i() * 50}>
                  <article class="flex items-baseline gap-5 py-6 sm:gap-8">
                    <span class="w-6 shrink-0 font-heading text-sm text-ink-subtle sm:w-8">
                      {String(i() + 1).padStart(2, "0")}
                    </span>
                    <div class="min-w-0">
                      <h3 class="mb-1 flex items-center gap-2 font-heading text-base font-semibold">
                        <feature.icon size={16} class="shrink-0 text-accent" weight="bold" />
                        {t(feature.titleKey)}
                      </h3>
                      <p class="text-sm leading-relaxed text-ink-muted">{t(feature.bodyKey)}</p>
                    </div>
                  </article>
                </Reveal>
              )}
            </For>
          </div>
        </section>

        <section id="download" class="mx-auto max-w-4xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <div class="mb-10 flex flex-wrap items-baseline justify-between gap-3">
              <h2 class="font-heading text-3xl font-semibold">{t("downloads.title")}</h2>
              <Show when={release()}>
                <div class="flex items-center gap-4 text-sm text-ink-subtle">
                  <span class="flex items-center gap-1.5">
                    <Tag size={14} /> {release()!.tag_name}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <CalendarBlank size={14} /> {formatDate(release()!.published_at)}
                  </span>
                </div>
              </Show>
            </div>
            <p class="mb-10 text-ink-muted">{t("downloads.sub")}</p>
          </Reveal>

          <Switch>
            <Match when={release.loading}>
              <div class="divide-y divide-border border-y border-border">
                <For each={[0, 1, 2, 3]}>
                  {() => (
                    <div class="flex animate-pulse items-center gap-4 py-4">
                      <div class="h-4 w-4 rounded bg-border" />
                      <div class="h-3.5 w-24 rounded bg-border" />
                      <div class="ml-auto h-3.5 w-16 rounded bg-border" />
                    </div>
                  )}
                </For>
              </div>
            </Match>

            <Match when={release.error}>
              <div class="flex flex-col items-start gap-3 border-y border-border py-10">
                <WarningCircle size={22} class="text-ink-subtle" />
                <p class="text-ink-muted">{t("downloads.error")}</p>
                <a
                  href={`${GITHUB_REPO_URL}/releases`}
                  class="text-sm font-medium text-accent underline underline-offset-4"
                >
                  {t("downloads.browse")}
                </a>
              </div>
            </Match>

            <Match when={release()}>
              <div class="divide-y divide-border border-y border-border">
                <For each={assetsByPlatform(release()!)}>
                  {({ platform: p, asset }, i) => {
                    const Icon = PLATFORM_ICONS[p];
                    return (
                      <Reveal delay={i() * 50}>
                        <a
                          href={asset.browser_download_url}
                          class="group flex items-center gap-4 py-4 transition-colors duration-150 hover:text-accent"
                        >
                          <Icon size={20} class="shrink-0 text-ink-subtle transition-colors duration-150 group-hover:text-accent" />
                          <span class="min-w-0">
                            <span class="block font-heading text-sm font-semibold">{PLATFORM_NAMES[p]}</span>
                            <span class="block text-xs text-ink-subtle">
                              {PLATFORM_DETAILS[p]} · {formatBytes(asset.size)}
                            </span>
                          </span>
                          <span class="ml-auto flex shrink-0 items-center gap-1.5 text-sm font-medium">
                            {t("downloads.download")}
                            <DownloadSimple size={15} />
                          </span>
                        </a>
                      </Reveal>
                    );
                  }}
                </For>
              </div>
            </Match>
          </Switch>

          <p class="mt-6 text-xs text-ink-subtle">{t("downloads.note")}</p>

          <div class="mt-8">
            <button
              type="button"
              onClick={() => setWaitlistOpen(true)}
              class="rounded-pill border border-border bg-surface px-5 py-2 text-sm font-medium text-ink transition hover:border-accent/40"
            >
              {t("waitlist.cta")}
            </button>
          </div>
        </section>

        <section id="source" class="relative scroll-mt-24 overflow-hidden bg-[#0e0c0a] py-20 text-[#f2ede2]">
          <EmberShader />
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0e0c0a] via-transparent to-[#0e0c0a]" />

          <div class="relative z-10 mx-auto max-w-2xl px-6 text-center">
            <Reveal>
              <h2 class="mb-2 font-heading text-3xl font-semibold">{t("source.title")}</h2>
              <p class="mb-6 text-[#f2ede2]/70">
                {t("source.needBun")}{" "}
                <a href="https://bun.sh" class="text-[#f5c98a] underline">
                  Bun
                </a>{" "}
                {t("source.and")}{" "}
                <a href="https://www.rust-lang.org/" class="text-[#f5c98a] underline">
                  Rust
                </a>
                . {t("source.that")}
              </p>
              <pre class="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm backdrop-blur">
                <code>
                  git clone {GITHUB_REPO_URL}.git{"\n"}
                  cd {GITHUB_REPO.split("/")[1]}
                  {"\n"}
                  bun install{"\n"}
                  bun run tauri:dev
                </code>
              </pre>
            </Reveal>
          </div>
        </section>
      </main>

      <footer class="border-t border-border px-6 py-10 text-center text-sm text-ink-subtle">
        <img src={logo} alt="" width="20" height="15" class="mx-auto mb-3" />
        <p>
          {t("footer.license")}{" "}
          <a href={GITHUB_REPO_URL} class="inline-flex items-center gap-1 text-accent underline">
            <GithubLogo size={14} weight="bold" /> {t("footer.source")}
          </a>
          .
        </p>
        <p class="mt-1 text-xs text-ink-subtle/70">{t("footer.built")}</p>
        <p class="mt-3 text-xs">
          <a href="/privacy" class="text-ink-subtle underline underline-offset-4 hover:text-ink">
            {t("footer.privacy")}
          </a>
        </p>
      </footer>

      <WaitlistModal
        open={waitlistOpen()}
        onClose={() => {
          setWaitlistOpen(false);
          void refetchWaitlistCount();
        }}
      />
    </div>
  );
}
