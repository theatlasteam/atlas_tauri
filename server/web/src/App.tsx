import { createResource, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
  AndroidLogo,
  AppleLogo,
  ArrowUpRight,
  CalendarBlank,
  DownloadSimple,
  GithubLogo,
  LinuxLogo,
  Moon,
  Sun,
  Tag,
  WarningCircle,
  WindowsLogo,
} from "phosphor-solid-js";
import logo from "./assets/logo.svg";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import HeroGlass from "./components/HeroGlass";
import HeroTextField from "./components/HeroTextField";
import LanguageSwitcher from "./components/LanguageSwitcher";
import Reveal from "./components/Reveal";
import WaitlistModal from "./components/WaitlistModal";
import { getWaitlistCount } from "./lib/api";
import { t, type TranslationKey } from "./lib/i18n";
import { GITHUB_REPO_URL } from "./lib/repo";
import {
  assetsByPlatform,
  detectPlatform,
  fetchLatestRelease,
  formatBytes,
  formatDate,
  type Platform,
} from "./lib/releases";

const PRIVACY_POINTS: TranslationKey[] = ["privacy.b1", "privacy.b2", "privacy.b3"];

const FEATURES: { titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { titleKey: "features.e2ee.title", bodyKey: "features.e2ee.body" },
  { titleKey: "features.compass.title", bodyKey: "features.compass.body" },
  { titleKey: "features.dm.title", bodyKey: "features.dm.body" },
  { titleKey: "features.calls.title", bodyKey: "features.calls.body" },
  { titleKey: "features.rich.title", bodyKey: "features.rich.body" },
  { titleKey: "features.capsules.title", bodyKey: "features.capsules.body" },
  { titleKey: "features.theme.title", bodyKey: "features.theme.body" },
  { titleKey: "features.plugins.title", bodyKey: "features.plugins.body" },
  { titleKey: "features.rust.title", bodyKey: "features.rust.body" },
];

const FAQ: { q: TranslationKey; a: TranslationKey }[] = [
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
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

      {/* ============================= HERO ============================= */}
      <section class="relative flex min-h-screen flex-col overflow-hidden bg-[#0e0c0a] text-[#f2ede2]">
        <HeroGlass />
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0e0c0a] via-[#0e0c0a]/40 to-[#0e0c0a]/70" />

        <Navbar variant="pill" scrolled={scrolled()}>
            <NavbarBrand href="#top" class="text-[#f2ede2]">
              <img src={logo} alt="" width="20" height="15" />
              Atlas
            </NavbarBrand>
            <NavbarLinks>
              <NavbarLink href="#privacy" class="text-[#f2ede2]/70 hover:text-[#f2ede2]">
                {t("privacy.kicker")}
              </NavbarLink>
              <NavbarLink href="#features" class="text-[#f2ede2]/70 hover:text-[#f2ede2]">
                {t("nav.features")}
              </NavbarLink>
              <NavbarLink href="/plugins" class="text-[#f2ede2]/70 hover:text-[#f2ede2]">
                {t("nav.plugins")}
              </NavbarLink>
              <NavbarLink href="/bots" class="text-[#f2ede2]/70 hover:text-[#f2ede2]">
                {t("nav.bots")}
              </NavbarLink>
              <NavbarLink href="/design" class="text-[#f2ede2]/70 hover:text-[#f2ede2]">
                Design
              </NavbarLink>
            </NavbarLinks>
            <div class="mx-1 h-4 w-px bg-white/10" />
            <LanguageSwitcher compact />
            <button
              type="button"
              onClick={toggleTheme}
              class="grid h-7 w-7 place-items-center rounded-full text-[#f2ede2]/60 transition hover:text-[#f2ede2]"
              aria-label="Toggle dark mode"
            >
              {theme() === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <a
              href="#download"
              class="ml-1 flex items-center gap-1 rounded-full bg-[#f2ede2] px-4 py-1.5 text-[13px] font-medium text-[#0e0c0a] transition hover:bg-white"
            >
              {t("nav.getStarted")}
              <ArrowUpRight size={13} weight="bold" />
            </a>
        </Navbar>

        {/* Hero content pinned to the bottom, split left/right */}
        <div
          id="top"
          class="relative z-10 mt-auto grid w-full items-end gap-10 px-6 pb-12 pt-32 sm:px-10 sm:pb-14 lg:grid-cols-[1.3fr_1fr]"
        >
          <div class="flex flex-col items-start gap-7">
            <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] text-[#f2ede2]/75 backdrop-blur">
              <span class="h-1.5 w-1.5 rounded-full bg-[#f5c98a]" />
              <Switch>
                <Match when={release.loading}>{t("hero.checking")}</Match>
                <Match when={release.error}>{t("hero.badge")}</Match>
                <Match when={release()}>{t("hero.latest", { tag: release()!.tag_name })}</Match>
              </Switch>
            </span>
            <h1 class="font-heading text-6xl font-extralight leading-[1.02] tracking-tight sm:text-7xl">
              {t("hero.title1")}
              <br />
              <span class="font-accent font-light text-[#f5c98a]">{t("hero.title2")}</span>
            </h1>
          </div>

          <div class="flex flex-col gap-6 lg:items-end lg:text-right">
            <p class="max-w-sm text-[15px] leading-relaxed text-[#f2ede2]/65">{t("hero.lede")}</p>
            <div class="flex flex-wrap items-center gap-3">
              <a
                href="/app/"
                class="flex items-center gap-1.5 rounded-full bg-[#f5c98a] px-6 py-3 text-sm font-medium text-[#0e0c0a] transition hover:bg-white"
              >
                {t("nav.webApp")}
                <ArrowUpRight size={15} weight="bold" />
              </a>
              <a
                href={primaryAsset()?.asset.browser_download_url ?? "#download"}
                class="flex items-center gap-1.5 rounded-full bg-[#f2ede2] px-6 py-3 text-sm font-medium text-[#0e0c0a] transition hover:bg-white"
              >
                {release.loading
                  ? t("hero.loading")
                  : primaryAsset()
                    ? t("hero.downloadFor", { platform: primaryAsset()!.label })
                    : t("hero.seeAll")}
                <ArrowUpRight size={15} weight="bold" />
              </a>
              <a
                href={GITHUB_REPO_URL}
                class="flex items-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-[#f2ede2]/85 transition hover:border-white/30 hover:text-[#f2ede2]"
              >
                {t("hero.github")}
                <ArrowUpRight size={15} weight="bold" />
              </a>
            </div>
            <Show when={waitlistCount() !== undefined}>
              <p class="text-xs text-[#f2ede2]/45">
                {t("hero.waitlistCount", { count: String(waitlistCount()!) })}
              </p>
            </Show>
          </div>
        </div>
      </section>

      <main>
        {/* ============================= PRIVACY ============================= */}
        <section id="privacy" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
          <Reveal>
            <div class="grid gap-8 border-b border-border pb-12 lg:grid-cols-[1fr_1.2fr] lg:items-end">
              <div>
                <p class="mb-4 text-[13px] font-medium uppercase tracking-[0.22em] text-accent">
                  {t("privacy.kicker")}
                </p>
                <h2 class="font-heading text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
                  {t("privacy.title.a")} <span class="font-accent font-light text-accent">{t("privacy.title.script")}</span> {t("privacy.title.b")}
                </h2>
              </div>
              <p class="max-w-xl text-[15px] leading-relaxed text-ink-muted lg:justify-self-end">
                {t("privacy.body")}
              </p>
            </div>
          </Reveal>
          <div class="grid gap-x-10 sm:grid-cols-3">
            <For each={PRIVACY_POINTS}>
              {(key, i) => (
                <Reveal delay={i() * 60}>
                  <div class="border-b border-border py-6 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:pr-8 sm:last:pr-0">
                    <p class="mb-4 font-heading text-3xl font-light text-accent/80">{String(i() + 1).padStart(2, "0")}</p>
                    <p class="max-w-xs text-sm leading-relaxed">{t(key)}</p>
                  </div>
                </Reveal>
              )}
            </For>
          </div>
        </section>

        {/* ============================= FEATURES ============================= */}
        <section id="features" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Reveal>
            <div class="mb-16 grid items-end gap-6 lg:grid-cols-2">
              <h2 class="font-heading text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
                {t("showcase.title")}
              </h2>
              <p class="max-w-sm text-sm leading-relaxed text-ink-muted lg:justify-self-end">
                {t("showcase.kicker")}
              </p>
            </div>
          </Reveal>
          <div class="grid grid-cols-1 gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
            <For each={FEATURES}>
              {(feature, i) => (
                <Reveal delay={i() * 40}>
                  <article class="border-t border-border py-7">
                    <h3 class="mb-2 font-heading text-[15px] font-semibold">{t(feature.titleKey)}</h3>
                    <p class="text-sm leading-relaxed text-ink-muted">{t(feature.bodyKey)}</p>
                  </article>
                </Reveal>
              )}
            </For>
          </div>
        </section>

        {/* ============================= DOWNLOAD ============================= */}
        <section id="download" class="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
          <Reveal>
            <div class="mb-14 grid items-end gap-6 lg:grid-cols-2">
              <h2 class="font-heading text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
                {t("downloads.title")}
              </h2>
              <div class="flex flex-col gap-2 lg:items-end">
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
                <p class="text-sm text-ink-muted">{t("downloads.sub")}</p>
              </div>
            </div>
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
              <div class="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
                <For each={assetsByPlatform(release()!)}>
                  {({ platform: p, asset }, i) => {
                    const Icon = PLATFORM_ICONS[p];
                    return (
                      <a
                        href={asset.browser_download_url}
                        class="group flex flex-col gap-6 bg-surface p-6 transition-colors duration-200 hover:bg-surface-raised"
                      >
                        <div class="flex items-center justify-between">
                          <Icon size={22} class="text-ink-subtle transition-colors group-hover:text-accent" />
                          <span class="text-xs text-ink-subtle transition-colors group-hover:text-accent">
                            {String(i() + 1).padStart(2, "0")}
                          </span>
                        </div>
                        <div>
                          <p class="font-heading text-sm font-semibold">{PLATFORM_NAMES[p]}</p>
                          <p class="mt-1 text-xs text-ink-subtle">
                            {PLATFORM_DETAILS[p]} · {formatBytes(asset.size)}
                          </p>
                        </div>
                        <span class="mt-auto flex items-center gap-1.5 text-xs font-medium text-accent">
                          {t("downloads.download")}
                          <DownloadSimple size={13} />
                        </span>
                      </a>
                    );
                  }}
                </For>
              </div>
            </Match>
          </Switch>

          <p class="mt-6 text-xs text-ink-subtle">{t("downloads.note")}</p>
        </section>

        {/* ============================= FAQ ============================= */}
        <section class="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
          <Reveal>
            <h2 class="mb-14 font-heading text-4xl font-light leading-[1.05] tracking-tight sm:text-5xl">
              {t("faq.title")}
            </h2>
          </Reveal>
          <div class="grid gap-x-16 lg:grid-cols-2">
            <For each={FAQ}>
              {(item, i) => (
                <Reveal delay={i() * 40}>
                  <details class="group border-t border-border py-6 [&_summary::-webkit-details-marker]:hidden">
                    <summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-heading text-[15px] font-semibold transition-colors hover:text-accent">
                      {t(item.q)}
                      <span class="shrink-0 text-lg text-ink-subtle transition-transform duration-200 group-open:rotate-45 group-open:text-accent">
                        +
                      </span>
                    </summary>
                    <p class="mt-3 text-sm leading-relaxed text-ink-muted">{t(item.a)}</p>
                  </details>
                </Reveal>
              )}
            </For>
          </div>
        </section>

        {/* ============================= FINAL CTA ============================= */}
        <section class="relative scroll-mt-24 overflow-hidden bg-[#0e0c0a] text-[#f2ede2]">
          <HeroTextField />
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0e0c0a] via-transparent to-[#0e0c0a]" />
          <div class="relative z-10 grid items-end gap-10 px-6 py-32 sm:px-10 lg:grid-cols-[1.3fr_1fr]">
            <Reveal>
              <h2 class="font-heading text-5xl font-light leading-[1.02] tracking-tight sm:text-6xl">
                {t("cta.title")}
              </h2>
            </Reveal>
            <Reveal delay={100}>
              <div class="flex flex-col gap-6 lg:items-end">
                <p class="max-w-sm text-[15px] leading-relaxed text-[#f2ede2]/65 lg:text-right">{t("cta.body")}</p>
                <div class="flex flex-wrap items-center gap-3">
                  <a
                    href={primaryAsset()?.asset.browser_download_url ?? "#download"}
                    class="flex items-center gap-1.5 rounded-full bg-[#f2ede2] px-6 py-3 text-sm font-medium text-[#0e0c0a] transition hover:bg-white"
                  >
                    {t("cta.button")}
                    <ArrowUpRight size={15} weight="bold" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setWaitlistOpen(true)}
                    class="flex items-center gap-1.5 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-[#f2ede2]/85 transition hover:border-white/30 hover:text-[#f2ede2]"
                  >
                    {t("waitlist.cta")}
                    <ArrowUpRight size={15} weight="bold" />
                  </button>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ============================= FOOTER ============================= */}
      <footer class="border-t border-border px-6 py-14">
        <div class="mx-auto grid max-w-6xl grid-cols-2 gap-10 sm:grid-cols-4">
          <div class="col-span-2 sm:col-span-1">
            <img src={logo} alt="" width="24" height="18" class="mb-3" />
            <p class="text-sm text-ink-muted">{t("footer.tagline")}</p>
          </div>
          <div>
            <p class="mb-3 font-heading text-sm font-semibold">{t("footer.product")}</p>
            <ul class="space-y-2 text-sm text-ink-muted">
              <li><a href="#features" class="transition hover:text-ink">{t("nav.features")}</a></li>
              <li><a href="/app/" class="transition hover:text-ink">{t("nav.webApp")}</a></li>
              <li><a href="#download" class="transition hover:text-ink">{t("nav.download")}</a></li>
              <li><a href="/plugins" class="transition hover:text-ink">{t("nav.plugins")}</a></li>
            </ul>
          </div>
          <div>
            <p class="mb-3 font-heading text-sm font-semibold">{t("footer.developers")}</p>
            <ul class="space-y-2 text-sm text-ink-muted">
              <li>
                <a href={GITHUB_REPO_URL} class="inline-flex items-center gap-1.5 transition hover:text-ink">
                  <GithubLogo size={14} weight="bold" /> {t("nav.github")}
                </a>
              </li>
              <li><a href="/plugins" class="transition hover:text-ink">{t("nav.plugins")}</a></li>
              <li><a href="/bots" class="transition hover:text-ink">{t("nav.bots")}</a></li>
              <li><a href="/docs" class="transition hover:text-ink">{t("footer.docs")}</a></li>
              <li><a href="/mcp" class="transition hover:text-ink">{t("footer.mcp")}</a></li>
            </ul>
          </div>
          <div>
            <p class="mb-3 font-heading text-sm font-semibold">{t("footer.legal")}</p>
            <ul class="space-y-2 text-sm text-ink-muted">
              <li><a href="/privacy" class="transition hover:text-ink">{t("footer.privacy")}</a></li>
              <li><a href="/terms" class="transition hover:text-ink">{t("footer.terms")}</a></li>
              <li><a href="/oferta" class="transition hover:text-ink">{t("footer.oferta")}</a></li>
            </ul>
          </div>
        </div>
        <div class="mx-auto mt-12 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-ink-subtle">
          <p>{t("footer.license")}</p>
          <p>{t("footer.built")}</p>
        </div>
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
