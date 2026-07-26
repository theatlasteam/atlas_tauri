import { createResource, createSignal, For, Match, Switch } from "solid-js";
import {
  AndroidLogo,
  CalendarBlank,
  ChatCircle,
  Code,
  DownloadSimple,
  GithubLogo,
  LinuxLogo,
  Lock,
  Moon,
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
  android: AndroidLogo,
};

const PLATFORM_NAMES: Record<Platform, string> = {
  windows: "Windows",
  "linux-deb": "Linux",
  "linux-appimage": "Linux",
  android: "Android",
};

const PLATFORM_DETAILS: Record<Platform, string> = {
  windows: ".msi installer",
  "linux-deb": ".deb package",
  "linux-appimage": "portable .AppImage",
  android: "debug-signed .apk",
};

export default function App() {
  const [theme, setTheme] = createSignal<"light" | "dark">(
    (document.documentElement.dataset.theme as "light" | "dark") ?? "light",
  );
  const [release] = createResource(fetchLatestRelease);
  const platform = detectPlatform();

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

        <header class="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
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
            <a href={GITHUB_REPO_URL} class="flex items-center gap-1.5 hover:text-[#f2ede2]">
              <GithubLogo size={16} weight="bold" /> {t("nav.github")}
            </a>
          </nav>
          <div class="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={toggleTheme}
              class="grid h-9 w-9 place-items-center rounded-pill border border-white/15 text-[#f2ede2]/75 transition hover:text-[#f2ede2]"
              aria-label="Toggle dark mode"
            >
              {theme() === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
            <AnimatedButton href={GITHUB_REPO_URL} icon={GithubLogo} variant="ghost" label={() => t("hero.github")} />
          </div>
        </div>
      </section>

      <main>
        <section id="features" class="mx-auto max-w-5xl px-6 py-16">
          <Reveal>
            <h2 class="mb-8 text-center font-heading text-3xl font-semibold">{t("features.title")}</h2>
          </Reveal>
          <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <For each={FEATURES}>
              {(feature, i) => (
                <Reveal delay={i() * 60}>
                  <article class="group h-full rounded-2xl border border-border bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-floating">
                    <div class="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent transition-transform duration-300 group-hover:scale-110">
                      <feature.icon size={20} weight="bold" />
                    </div>
                    <h3 class="mb-1 font-heading font-semibold">{t(feature.titleKey)}</h3>
                    <p class="text-sm text-ink-muted">{t(feature.bodyKey)}</p>
                  </article>
                </Reveal>
              )}
            </For>
          </div>
        </section>

        <section id="download" class="mx-auto max-w-5xl px-6 py-16">
          <Reveal>
            <h2 class="mb-2 text-center font-heading text-3xl font-semibold">{t("downloads.title")}</h2>
            <p class="mb-10 text-center text-ink-muted">{t("downloads.sub")}</p>
          </Reveal>

          <Switch>
            <Match when={release.loading}>
              <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <For each={[0, 1, 2, 3]}>
                  {() => (
                    <div class="animate-pulse rounded-2xl border border-border bg-surface p-6">
                      <div class="mb-5 h-11 w-11 rounded-xl bg-accent-soft" />
                      <div class="mb-2 h-4 w-2/3 rounded bg-border" />
                      <div class="mb-6 h-3 w-1/2 rounded bg-border" />
                      <div class="h-10 rounded-pill bg-border" />
                    </div>
                  )}
                </For>
              </div>
            </Match>

            <Match when={release.error}>
              <div class="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-8 py-12 text-center">
                <WarningCircle size={28} class="text-ink-subtle" />
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
              <div class="mb-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-subtle">
                <span class="flex items-center gap-1.5">
                  <Tag size={15} /> {release()!.tag_name}
                </span>
                <span class="flex items-center gap-1.5">
                  <CalendarBlank size={15} /> {formatDate(release()!.published_at)}
                </span>
              </div>

              <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <For each={assetsByPlatform(release()!)}>
                  {({ platform: p, asset }, i) => {
                    const Icon = PLATFORM_ICONS[p];
                    return (
                      <Reveal delay={i() * 60}>
                        <div class="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-floating">
                          <div class="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent transition-transform duration-300 group-hover:scale-110">
                            <Icon size={22} weight="bold" />
                          </div>
                          <h3 class="font-heading text-lg font-semibold">{PLATFORM_NAMES[p]}</h3>
                          <p class="mb-6 text-sm text-ink-subtle">
                            {PLATFORM_DETAILS[p]} · {formatBytes(asset.size)}
                          </p>
                          <AnimatedButton
                            href={asset.browser_download_url}
                            icon={DownloadSimple}
                            size="sm"
                            class="mt-auto w-full justify-center"
                            label={() => t("downloads.download")}
                          />
                        </div>
                      </Reveal>
                    );
                  }}
                </For>
              </div>
            </Match>
          </Switch>

          <p class="mt-8 text-center text-xs text-ink-subtle">{t("downloads.note")}</p>
        </section>

        <section id="source" class="relative overflow-hidden bg-[#0e0c0a] py-20 text-[#f2ede2]">
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
      </footer>
    </div>
  );
}
