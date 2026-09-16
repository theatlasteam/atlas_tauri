import { onCleanup, onMount } from "solid-js";
import { ArrowLeft, ArrowUpRight } from "phosphor-solid-js";
import logo from "../assets/logo.svg";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { t, type TranslationKey } from "../lib/i18n";
import { BlogFooter, blogPath } from "./BlogIndex";
import CapsuleCountdown from "./widgets/CapsuleCountdown";
import Doccy from "./Doccy";

/** Capsules post: a light vertical timeline. The only live element is the
 *  countdown itself — the page around it stays still. */
export default function CapsulesPost() {
  const k = (rest: string): TranslationKey => `blog.capsules.${rest}` as TranslationKey;
  const steps = [1, 2, 3, 4].map((n) => ({
    n,
    titleKey: k(`s${n}.title`),
    bodyKey: k(`s${n}.body`),
  }));

  onMount(() => {
    const prevTitle = document.title;
    document.title = `${t(k("title"))} — Atlas`;
    onCleanup(() => {
      document.title = prevTitle;
    });
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
          <NavbarLink href="/app/">{t("nav.webApp")}</NavbarLink>
        </NavbarLinks>
        <div class="mx-1 h-4 w-px bg-black/10" />
        <LanguageSwitcher compact />
        <a
          href="/app/"
          class="ml-1 flex items-center gap-1 rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-bg transition hover:opacity-85"
        >
          {t(k("cta.button"))}
          <ArrowUpRight size={13} weight="bold" />
        </a>
      </Navbar>

      <main class="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <p class="text-center text-[13px] font-medium uppercase tracking-[0.22em] text-accent">
          {t(k("tag"))} · {t(k("date"))} · {t("blog.minRead", { n: "3" })}
        </p>
        <h1 class="mt-4 text-center font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          {t(k("title"))}
        </h1>
        <p class="mx-auto mt-5 max-w-2xl text-center text-[17px] leading-relaxed text-ink-muted">
          {t(k("hero.lede"))}
        </p>

        <div class="mt-12">
          <CapsuleCountdown />
        </div>

        <ol class="relative mt-14 space-y-10 border-l border-border pl-8">
          {steps.map((s) => (
            <li class="relative">
              <span
                aria-hidden="true"
                class="absolute -left-8 top-1.5 h-3 w-3 -translate-x-[5px] rounded-full border-2 border-accent bg-bg"
              />
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                {String(s.n).padStart(2, "0")}
              </p>
              <h2 class="mt-1 font-heading text-xl font-semibold tracking-tight">{t(s.titleKey)}</h2>
              <p class="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{t(s.bodyKey)}</p>
            </li>
          ))}
        </ol>

        <div class="mt-14 text-center">
          <h2 class="font-heading text-3xl font-semibold tracking-tight">{t(k("cta.title"))}</h2>
          <p class="mx-auto mt-3 max-w-md text-[15px] text-ink-muted">{t(k("cta.body"))}</p>
          <a
            href="/app/"
            class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-bg transition hover:opacity-85"
          >
            {t(k("cta.button"))}
            <ArrowUpRight size={15} weight="bold" />
          </a>
          <div>
            <a
              href={blogPath()}
              class="mt-8 inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft size={15} weight="bold" />
              {t("blog.back")}
            </a>
          </div>
        </div>
      </main>

      <BlogFooter />
      <Doccy
        slug="capsules"
        faqs={[1, 2, 3, 4].map((n) => ({
          titleKey: k(`s${n}.title`),
          bodyKey: k(`s${n}.body`),
        }))}
      />
    </div>
  );
}
