import { createSignal, For, onCleanup, onMount } from "solid-js";
import { ArrowLeft, ArrowUpRight } from "phosphor-solid-js";
import { t, type TranslationKey } from "../lib/i18n";
import Reveal from "../components/Reveal";
import MascotOrb, { type MascotState } from "./MascotOrb";
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

const MOODS: { id: MascotState; labelKey: TranslationKey }[] = [
  { id: "idle", labelKey: "blog.minds.demo.idle" },
  { id: "thinking", labelKey: "blog.minds.demo.thinking" },
  { id: "happy", labelKey: "blog.minds.demo.happy" },
  { id: "sleeping", labelKey: "blog.minds.demo.sleeping" },
];

/** The Minds launch post, styled after the xAI Grok Bot landing: black
 *  page, centered hero with the mascot inline in the title, announcement
 *  pill, the minds.png cover in a rounded showcase frame, dark cards. */
export default function MindsPost() {
  const [mood, setMood] = createSignal<MascotState>("thinking");

  // The post is a black page end to end (footer included): pin the theme
  // while mounted, restore whatever the visitor had on the way out.
  onMount(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = "dark";
    onCleanup(() => {
      if (prev) root.dataset.theme = prev;
      else delete root.dataset.theme;
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
              <span>{t("blog.minds.hero.titleA")}</span>
              <span class="inline-flex h-[1.1em] items-center">
                <MascotOrb state="thinking" size={84} />
              </span>
              <span>{t("blog.minds.hero.titleB")}</span>
            </h1>
          </Reveal>
          <Reveal delay={120}>
            <p class="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-white/55 sm:text-base">
              {t("blog.minds.hero.lede")}
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
        </section>

        {/* ============================= SHOWCASE ============================= */}
        <section class="mx-auto max-w-5xl px-6">
          <Reveal>
            <div class="overflow-hidden rounded-2xl border border-white/10">
              <img src="/minds.png" alt="Minds" class="block w-full" loading="eager" />
            </div>
          </Reveal>
        </section>

        {/* ============================= LIVE MASCOT ============================= */}
        <section class="mx-auto max-w-5xl px-6 py-24">
          <Reveal>
            <div class="grid items-center gap-10 rounded-2xl bg-white/[0.04] p-8 sm:p-12 lg:grid-cols-[auto_1fr]">
              <div class="mx-auto transition-transform duration-300 hover:scale-[1.03]">
                <MascotOrb state={mood()} size={190} />
              </div>
              <div>
                <p class="text-[15px] leading-relaxed text-white/60">{t("blog.minds.demo.label")}</p>
                <div class="mt-5 flex flex-wrap gap-2">
                  <For each={MOODS}>
                    {(m) => (
                      <button
                        type="button"
                        onClick={() => setMood(m.id)}
                        class="rounded-full px-4 py-2 text-[13px] font-medium transition"
                        classList={{
                          "bg-white text-black": mood() === m.id,
                          "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white":
                            mood() !== m.id,
                        }}
                      >
                        {t(m.labelKey)}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ============================= SECTIONS ============================= */}
        <section id="how" class="mx-auto max-w-5xl scroll-mt-24 px-6 pb-24">
          <Reveal>
            <a
              href={blogPath()}
              class="mb-10 inline-flex items-center gap-2 text-sm font-medium text-white/45 transition hover:text-white"
            >
              <ArrowLeft size={15} weight="bold" />
              {t("blog.back")}
            </a>
          </Reveal>
          <div class="grid gap-4 sm:grid-cols-2">
            <For each={SECTIONS}>
              {(s, i) => (
                <Reveal delay={(i() % 2) * 60}>
                  <article class="h-full rounded-2xl bg-white/[0.04] p-8">
                    <p class="mb-4 text-sm font-medium text-white/35">
                      {String(i() + 1).padStart(2, "0")}
                    </p>
                    <h2 class="mb-2 text-xl font-medium tracking-tight">{t(s.titleKey)}</h2>
                    <p class="text-[15px] leading-relaxed text-white/60">{t(s.bodyKey)}</p>
                  </article>
                </Reveal>
              )}
            </For>
          </div>
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
    </div>
  );
}
