import { For, onMount } from "solid-js";
import { ArrowLeft, ArrowUpRight } from "phosphor-solid-js";
import logo from "../assets/logo.svg";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import LanguageSwitcher from "../components/LanguageSwitcher";
import Reveal from "../components/Reveal";
import { t, type TranslationKey } from "../lib/i18n";
import { findPost } from "./posts";
import { BlogFooter, blogPath } from "./BlogIndex";

/** Number of s1..sN sections per generic post. Minds keeps its custom page. */
const SECTION_COUNTS: Record<string, number> = {
  encryption: 5,
  plugins: 5,
  capsules: 4,
};

/** Generic article page driven by the `blog.{slug}.*` i18n keys: add a slug
 *  to POSTS plus a key block in i18n and it renders with zero plumbing. */
export default function ArticlePost(props: { slug: string }) {
  const post = () => findPost(props.slug);
  const k = (rest: string): TranslationKey => `blog.${props.slug}.${rest}` as TranslationKey;
  const sections = () =>
    Array.from({ length: SECTION_COUNTS[props.slug] ?? 0 }, (_, i) => ({
      titleKey: k(`s${i + 1}.title`),
      bodyKey: k(`s${i + 1}.body`),
    }));

  onMount(() => {
    const title = post() ? t(k("title")) : "Atlas";
    const prev = document.title;
    document.title = `${title} — Atlas`;
    return () => {
      document.title = prev;
    };
  });

  return (
    <div class="min-h-screen">
      <div class="grain-overlay" />
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

      <main class="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <Reveal>
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <span class="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
              {t(k("tag"))}
            </span>
            <span class="text-ink-subtle">{t(k("date"))}</span>
            <span class="text-ink-subtle">· {t("blog.minRead", { n: String(post()?.minutes ?? 5) })}</span>
          </div>
          <h1 class="mt-5 font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            {t(k("title"))}
          </h1>
          <p class="mt-5 text-[17px] leading-relaxed text-ink-muted">{t(k("hero.lede"))}</p>
        </Reveal>

        <Reveal delay={80}>
          <img
            src={post()?.image ?? ""}
            alt=""
            class="mt-10 aspect-[16/9] w-full rounded-2xl border border-border object-cover"
          />
        </Reveal>

        <div class="mt-12 space-y-10">
          <For each={sections()}>
            {(s, i) => (
              <Reveal delay={(i() % 2) * 60}>
                <article>
                  <h2 class="font-heading text-2xl font-semibold tracking-tight">{t(s.titleKey)}</h2>
                  <p class="mt-3 text-[15px] leading-relaxed text-ink-muted">{t(s.bodyKey)}</p>
                </article>
              </Reveal>
            )}
          </For>
        </div>

        <Reveal>
          <section class="mt-16 rounded-3xl bg-ink p-8 text-center text-bg sm:p-12">
            <h2 class="font-heading text-3xl font-semibold tracking-tight">{t(k("cta.title"))}</h2>
            <p class="mx-auto mt-3 max-w-md text-[15px] leading-relaxed opacity-70">{t(k("cta.body"))}</p>
            <a
              href="/app/"
              class="mt-7 inline-flex items-center gap-1.5 rounded-full bg-accent px-7 py-3 text-sm font-medium text-white transition hover:opacity-90"
            >
              {t(k("cta.button"))}
              <ArrowUpRight size={15} weight="bold" />
            </a>
          </section>
        </Reveal>

        <a
          href={blogPath()}
          class="mt-10 inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft size={15} weight="bold" />
          {t("blog.back")}
        </a>
      </main>

      <BlogFooter />
    </div>
  );
}
