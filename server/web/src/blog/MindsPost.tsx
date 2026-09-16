import { For, onCleanup, onMount } from "solid-js";
import { ArrowLeft, ArrowUpRight } from "phosphor-solid-js";
import { locale, t, type TranslationKey } from "../lib/i18n";
import Reveal from "../components/Reveal";
import FlipLede from "./FlipLede";
import "./blog-anim.css";
import MascotOrb from "./MascotOrb";
import DemoChat from "./DemoChat";
import Doccy from "./Doccy";
import { BlogFooter, blogPath } from "./BlogIndex";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import LanguageSwitcher from "../components/LanguageSwitcher";
import logo from "../assets/logo.svg";

const SECTIONS: { titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { titleKey: "blog.minds.s1.title", bodyKey: "blog.minds.s1.body" },
  { titleKey: "blog.minds.s2.title", bodyKey: "blog.minds.s2.body" },
  { titleKey: "blog.minds.s3.title", bodyKey: "blog.minds.s3.body" },
  { titleKey: "blog.minds.s4.title", bodyKey: "blog.minds.s4.body" },
  { titleKey: "blog.minds.s5.title", bodyKey: "blog.minds.s5.body" },
];

/** The Minds launch post, styled after the xAI Grok Bot landing: black
 *  page, centered hero with the mascot inline in the title, announcement
 *  pill, a self-playing chat demo, dark cards. */
export default function MindsPost() {
  // The post is a black page end to end (footer included): pin the theme
  // while mounted, restore whatever the visitor had on the way out.
  // Same for the tab: mascot favicon + post title instead of the generic
  // messenger ones, restored on the way out.
  onMount(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = "dark";
    const prevTitle = document.title;
    document.title = `${t("blog.minds.title")} — Atlas`;
    const head = document.head;
    const prevIcons: HTMLLinkElement[] = [];
    head.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((el) => {
      prevIcons.push(el);
      el.remove();
    });
    const mascot = document.createElement("link");
    mascot.rel = "icon";
    mascot.type = "image/svg+xml";
    mascot.href = "/minds-icon.svg";
    head.appendChild(mascot);
    onCleanup(() => {
      if (prev) root.dataset.theme = prev;
      else delete root.dataset.theme;
      document.title = prevTitle;
      mascot.remove();
      prevIcons.forEach((el) => head.appendChild(el));
    });
  });

  return (
    <div class="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar variant="pill">
        <NavbarBrand href="/" class="text-white">
          <img src={logo} alt="" width="20" height="15" />
          Atlas
        </NavbarBrand>
        <NavbarLinks>
          <NavbarLink href="/#features" class="text-white/60 hover:text-white">
            {t("nav.features")}
          </NavbarLink>
          <NavbarLink href={blogPath()} class="text-white/60 hover:text-white">
            {t("nav.blog")}
          </NavbarLink>
        </NavbarLinks>
        <div class="mx-1 h-4 w-px bg-white/10" />
        <LanguageSwitcher compact />
        <a
          href="/app/"
          class="ml-1 flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-black transition hover:bg-white/85"
        >
          {t("blog.minds.hero.cta")}
          <ArrowUpRight size={13} weight="bold" />
        </a>
      </Navbar>

      <main>
        {/* ============================= HERO ============================= */}
        <section class="mx-auto max-w-5xl px-6 pb-16 pt-36 text-center sm:pt-44">
          <Reveal>
            <a
              href="#how"
              class="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-1.5 text-[13px] text-white/75 transition hover:bg-white/[0.12] hover:text-white"
            >
              {t("blog.minds.hero.badge")} · {t("blog.minds.hero.secondary")}
              <ArrowUpRight size={13} weight="bold" />
            </a>
          </Reveal>
          <Reveal delay={60}>
            <h1 class="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-5xl font-medium tracking-tight sm:text-7xl">
              <span class="mx-hero-line" style={{ "animation-delay": "0.05s" }}>{t("blog.minds.hero.titleA")}</span>
              <span class="mx-hero-line inline-flex h-[1.1em] items-center" style={{ "animation-delay": "0.17s" }}>
                <MascotOrb state="thinking" size={84} />
              </span>
              <span class="mx-hero-line" style={{ "animation-delay": "0.29s" }}>{t("blog.minds.hero.titleB")}</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p class="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">
              <FlipLede key={locale()} text={t("blog.minds.hero.lede")} />
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="/app/"
                class="rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:bg-white/85"
              >
                {t("blog.minds.hero.cta")}
              </a>
              <a
                href="#how"
                class="rounded-full bg-white/10 px-7 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                {t("blog.minds.hero.secondary")}
              </a>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div class="mx-auto mt-14 w-full max-w-2xl text-left">
              <DemoChat bare />
            </div>
          </Reveal>
        </section>

        {/* ============================= SECTIONS ============================= */}
        <section id="how" class="mx-auto max-w-5xl scroll-mt-24 px-6 pb-24">
          <Reveal>
            <div class="mx-auto mb-12 flex max-w-2xl flex-col gap-4 text-center">
              <h2 class="text-3xl font-medium tracking-tight sm:text-4xl">
                {t("blog.minds.how")}
              </h2>
            </div>
          </Reveal>
          <div class="grid gap-5 sm:grid-cols-2">
            <For each={SECTIONS}>
              {(s, i) => (
                <Reveal delay={(i() % 2) * 60}>
                  <article
                    class="h-full rounded-3xl bg-white/[0.04] p-6 transition-colors duration-200 hover:bg-white/[0.06] sm:p-8"
                    classList={{ "sm:col-span-2": i() === SECTIONS.length - 1 }}
                  >
                    <h3 class="mb-2 text-base font-medium leading-relaxed">{t(s.titleKey)}</h3>
                    <p class="max-w-xl text-[15px] leading-relaxed text-white/60">{t(s.bodyKey)}</p>
                  </article>
                </Reveal>
              )}
            </For>
          </div>
          <Reveal>
            <a
              href={blogPath()}
              class="mt-10 inline-flex items-center gap-2 text-sm font-medium text-white/45 transition hover:text-white"
            >
              <ArrowLeft size={15} weight="bold" />
              {t("blog.back")}
            </a>
          </Reveal>
        </section>

        {/* ============================= CTA ============================= */}
        <section class="mx-auto max-w-5xl px-6 pb-28 text-center">
          <Reveal>
            <div class="mx-auto mb-8 w-fit">
              <MascotOrb state="happy" size={110} />
            </div>
            <h2 class="text-4xl font-medium tracking-tight sm:text-5xl">
              {t("blog.minds.cta.title")}
            </h2>
            <p class="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/55">
              {t("blog.minds.cta.body")}
            </p>
            <a
              href="/app/"
              class="mt-8 inline-flex items-center gap-1.5 rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition hover:bg-white/85"
            >
              {t("blog.minds.cta.button")}
              <ArrowUpRight size={15} weight="bold" />
            </a>
          </Reveal>
        </section>
      </main>

      <div>
        <BlogFooter />
      </div>
      <Doccy slug="minds" faqs={SECTIONS} />
    </div>
  );
}
