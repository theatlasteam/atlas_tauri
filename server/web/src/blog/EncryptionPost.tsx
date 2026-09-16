import { onCleanup, onMount } from "solid-js";
import { ArrowLeft, ArrowUpRight } from "phosphor-solid-js";
import logo from "../assets/logo.svg";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { t, type TranslationKey } from "../lib/i18n";
import { BlogFooter, blogPath } from "./BlogIndex";
import Doccy from "./Doccy";

const CIPHER_SAMPLE =
  "8f3Qm9vX2hL0pWz7aKc4dN6bRtY1uJ5oI+E/G0sHk3jF==";

/** Encryption post: a quiet light “field note” with a sticky evidence panel.
 *  No autoplay, no orbs — the contrast between plaintext and ciphertext is
 *  the whole visual. */
export default function EncryptionPost() {
  const k = (rest: string): TranslationKey => `blog.encryption.${rest}` as TranslationKey;
  const sections = [1, 2, 3, 4, 5].map((n) => ({
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

      <main class="mx-auto max-w-6xl px-6 pb-24 pt-32">
        <p class="text-[13px] font-medium uppercase tracking-[0.22em] text-accent">
          {t(k("tag"))} · {t(k("date"))} · {t("blog.minRead", { n: "6" })}
        </p>
        <h1 class="mt-4 max-w-3xl font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          {t(k("title"))}
        </h1>
        <p class="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-muted">{t(k("hero.lede"))}</p>

        <div class="mt-14 grid gap-10 lg:grid-cols-5">
          <aside class="lg:col-span-2">
            <div class="overflow-hidden rounded-2xl border border-border lg:sticky lg:top-28">
              <div class="border-b border-border bg-surface px-5 py-4">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">
                  {t(k("s5.title"))}
                </p>
              </div>
              <div class="space-y-5 p-5">
                <div>
                  <p class="mb-2 font-mono text-xs uppercase tracking-wider text-ink-subtle">Device</p>
                  <p class="rounded-xl bg-accent-soft px-4 py-3 font-mono text-sm leading-relaxed text-ink">
                    “see you at nine, don’t be late”
                  </p>
                </div>
                <div>
                  <p class="mb-2 font-mono text-xs uppercase tracking-wider text-ink-subtle">Server</p>
                  <p class="break-all rounded-xl bg-ink px-4 py-3 font-mono text-sm leading-relaxed text-bg">
                    {CIPHER_SAMPLE}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          <article class="lg:col-span-3">
            <div class="space-y-12">
              {sections.map((s) => (
                <section>
                  <p class="font-mono text-sm font-semibold text-accent">
                    {String(s.n).padStart(2, "0")}
                  </p>
                  <h2 class="mt-2 font-heading text-2xl font-semibold tracking-tight">{t(s.titleKey)}</h2>
                  <p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{t(s.bodyKey)}</p>
                </section>
              ))}
            </div>

            <div class="mt-14 rounded-2xl border border-border bg-surface p-8 text-center">
              <h2 class="font-heading text-2xl font-semibold tracking-tight">{t(k("cta.title"))}</h2>
              <p class="mx-auto mt-2 max-w-md text-[15px] text-ink-muted">{t(k("cta.body"))}</p>
              <a
                href="/app/"
                class="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-bg transition hover:opacity-85"
              >
                {t(k("cta.button"))}
                <ArrowUpRight size={15} weight="bold" />
              </a>
            </div>

            <a
              href={blogPath()}
              class="mt-8 inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition hover:text-ink"
            >
              <ArrowLeft size={15} weight="bold" />
              {t("blog.back")}
            </a>
          </article>
        </div>
      </main>

      <BlogFooter />
      <Doccy
        slug="encryption"
        faqs={[1, 2, 3, 4, 5].map((n) => ({
          titleKey: k(`s${n}.title`),
          bodyKey: k(`s${n}.body`),
        }))}
      />
    </div>
  );
}
