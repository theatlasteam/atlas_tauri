import { For, Show } from "solid-js";
import { ArrowUpRight, PushPin } from "phosphor-solid-js";
import logo from "../assets/logo.svg";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import LanguageSwitcher from "../components/LanguageSwitcher";
import Reveal from "../components/Reveal";
import { locale } from "../lib/i18n";
import { t } from "../lib/i18n";
import { GITHUB_REPO_URL } from "../lib/repo";
import { sortedPosts } from "./posts";

/** Locale-aware path: /ru/blog/… and /en/blog/… both render, so crawlers
 *  and humans each get a deterministic locale. */
export function blogPath(slug = ""): string {
  const prefix = locale() === "en" ? "/en" : "/ru";
  return `${prefix}/blog${slug ? `/${slug}` : ""}`;
}

function BlogNav() {
  return (
    <Navbar variant="pill">
      <NavbarBrand href="/">
        <img src={logo} alt="" width="20" height="15" />
        Atlas
      </NavbarBrand>
      <NavbarLinks>
        <NavbarLink href="/#features">{t("nav.features")}</NavbarLink>
        <NavbarLink href={blogPath()}>{t("nav.blog")}</NavbarLink>
        <NavbarLink href="/plugins">{t("nav.plugins")}</NavbarLink>
        <NavbarLink href="/bots">{t("nav.bots")}</NavbarLink>
      </NavbarLinks>
      <div class="mx-1 h-4 w-px bg-black/10" />
      <LanguageSwitcher compact />
      <a
        href="/app/"
        class="ml-1 flex items-center gap-1 rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-bg transition hover:opacity-85"
      >
        {t("nav.webApp")}
        <ArrowUpRight size={13} weight="bold" />
      </a>
    </Navbar>
  );
}

export function BlogFooter() {
  return (
    <footer class="border-t border-border px-6 py-14">
      <div class="mx-auto grid max-w-6xl grid-cols-2 gap-10 sm:grid-cols-4">
        <div class="col-span-2 sm:col-span-1">
          <img src={logo} alt="" width="24" height="18" class="mb-3" />
          <p class="text-sm text-ink-muted">{t("footer.tagline")}</p>
        </div>
        <div>
          <p class="mb-3 font-heading text-sm font-semibold">{t("footer.product")}</p>
          <ul class="space-y-2 text-sm text-ink-muted">
            <li><a href="/#features" class="transition hover:text-ink">{t("nav.features")}</a></li>
            <li><a href={blogPath()} class="transition hover:text-ink">{t("nav.blog")}</a></li>
            <li><a href="/app/" class="transition hover:text-ink">{t("nav.webApp")}</a></li>
          </ul>
        </div>
        <div>
          <p class="mb-3 font-heading text-sm font-semibold">{t("footer.developers")}</p>
          <ul class="space-y-2 text-sm text-ink-muted">
            <li><a href={GITHUB_REPO_URL} class="transition hover:text-ink">{t("nav.github")}</a></li>
            <li><a href="/docs" class="transition hover:text-ink">{t("footer.docs")}</a></li>
          </ul>
        </div>
        <div>
          <p class="mb-3 font-heading text-sm font-semibold">{t("footer.legal")}</p>
          <ul class="space-y-2 text-sm text-ink-muted">
            <li><a href="/privacy" class="transition hover:text-ink">{t("footer.privacy")}</a></li>
            <li><a href="/terms" class="transition hover:text-ink">{t("footer.terms")}</a></li>
          </ul>
        </div>
      </div>
      <div class="mx-auto mt-12 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-ink-subtle">
        <p>{t("footer.license")}</p>
        <p>{t("footer.built")}</p>
      </div>
    </footer>
  );
}

export default function BlogIndex() {
  return (
    <div class="min-h-screen">
      <div class="grain-overlay" />
      <BlogNav />
      <main class="mx-auto max-w-6xl px-6 pb-24 pt-32">
        <Reveal>
          <p class="mb-4 text-[13px] font-medium uppercase tracking-[0.22em] text-accent">
            {t("blog.kicker")}
          </p>
          <h1 class="font-heading text-5xl font-light leading-[1.02] tracking-tight sm:text-6xl">
            {t("blog.title")}
          </h1>
          <p class="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-muted">{t("blog.lede")}</p>
        </Reveal>
        <div class="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          <For each={sortedPosts()}>
            {(post, i) => (
              <Reveal delay={i() * 60}>
                <a
                  href={blogPath(post.slug)}
                  class="group flex h-full flex-col overflow-hidden rounded-2xl bg-surface transition-colors duration-200 hover:bg-surface-raised"
                >
                  <div class="relative">
                    <img
                      src={post.image}
                      alt=""
                      loading="lazy"
                      class="aspect-[16/9] w-full object-cover"
                    />
                    <Show when={post.pinned}>
                      <span class="absolute left-4 top-4 flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-medium text-bg backdrop-blur">
                        <PushPin size={12} weight="fill" />
                        {t("blog.pinned")}
                      </span>
                    </Show>
                  </div>
                  <div class="flex flex-1 flex-col gap-4 p-7">
                  <div class="flex items-center gap-3 text-xs">
                    <span class="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
                      {t(post.tagKey)}
                    </span>
                    <span class="text-ink-subtle">{t(post.dateKey)}</span>
                    <span class="text-ink-subtle">· {t("blog.minRead", { n: String(post.minutes) })}</span>
                  </div>
                  <h2 class="font-heading text-2xl font-semibold leading-tight transition-colors group-hover:text-accent">
                    {t(post.titleKey)}
                  </h2>
                  <p class="text-sm leading-relaxed text-ink-muted">{t(post.excerptKey)}</p>
                  <span class="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-accent">
                    {t("blog.readMore")}
                    <ArrowUpRight size={15} weight="bold" />
                  </span>
                  </div>
                </a>
              </Reveal>
            )}
          </For>
        </div>
      </main>
      <BlogFooter />
    </div>
  );
}
