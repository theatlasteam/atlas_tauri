import { onCleanup, onMount } from "solid-js";
import { ArrowLeft, ArrowUpRight } from "phosphor-solid-js";
import logo from "../assets/logo.svg";
import { Navbar, NavbarBrand, NavbarLink, NavbarLinks } from "@atlas/ui";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { t, type TranslationKey } from "../lib/i18n";
import { BlogFooter, blogPath } from "./BlogIndex";
import Doccy from "./Doccy";

const MANIFEST = `{
  "id": "shrug",
  "name": "Shrug",
  "version": "1.0.0",
  "main": "index.js",
  "permissions": ["commands", "messages.send"]
}`;

const COMMAND = `import { atlas } from "atlas";

atlas.command("shrug", (ctx) => {
  ctx.sendMessage(ctx.chat.id, "¯\\_(ツ)_/¯");
});`;

/** Plugins post: a dark static “developer sheet”. The code is the hero —
 *  fixed, readable, and replay-free. */
export default function PluginsPost() {
  const k = (rest: string): TranslationKey => `blog.plugins.${rest}` as TranslationKey;
  const sections = [1, 2, 3, 4, 5].map((n) => ({
    n,
    titleKey: k(`s${n}.title`),
    bodyKey: k(`s${n}.body`),
  }));

  onMount(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = "dark";
    const prevTitle = document.title;
    document.title = `${t(k("title"))} — Atlas`;
    onCleanup(() => {
      if (prev) root.dataset.theme = prev;
      else delete root.dataset.theme;
      document.title = prevTitle;
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
          <NavbarLink href="/docs" class="text-white/60 hover:text-white">
            {t("footer.docs")}
          </NavbarLink>
          <NavbarLink href={blogPath()} class="text-white/60 hover:text-white">
            {t("nav.blog")}
          </NavbarLink>
          <NavbarLink href="/plugins" class="text-white/60 hover:text-white">
            {t("nav.plugins")}
          </NavbarLink>
        </NavbarLinks>
        <div class="mx-1 h-4 w-px bg-white/10" />
        <LanguageSwitcher compact />
        <a
          href="/plugins"
          class="ml-1 flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-black transition hover:bg-white/85"
        >
          {t(k("cta.button"))}
          <ArrowUpRight size={13} weight="bold" />
        </a>
      </Navbar>

      <main class="mx-auto max-w-6xl px-6 pb-24 pt-32">
        <div class="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <p class="text-[13px] font-medium uppercase tracking-[0.22em] text-white/50">
              {t(k("tag"))} · {t(k("date"))} · {t("blog.minRead", { n: "5" })}
            </p>
            <h1 class="mt-4 font-heading text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              {t(k("title"))}
            </h1>
            <p class="mt-5 max-w-xl text-[16px] leading-relaxed text-white/60">{t(k("hero.lede"))}</p>
            <div class="mt-7 flex flex-wrap gap-3">
              <a
                href="/plugins"
                class="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-white/85"
              >
                {t(k("cta.button"))}
              </a>
              <a
                href="/docs"
                class="rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
              >
                {t("footer.docs")}
              </a>
            </div>
          </div>

          <div class="overflow-hidden rounded-2xl border border-white/10 bg-[#111]">
            <p class="border-b border-white/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-white/45">
              manifest.json
            </p>
            <pre class="overflow-x-auto p-5 font-mono text-[13px] leading-[1.7] text-white/85">{MANIFEST}</pre>
            <p class="border-y border-white/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.18em] text-white/45">
              index.js
            </p>
            <pre class="overflow-x-auto p-5 font-mono text-[13px] leading-[1.7] text-white/85">{COMMAND}</pre>
          </div>
        </div>

        <dl class="mx-auto mt-16 grid max-w-5xl gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
          {sections.map((s) => (
            <div class="bg-[#0e0e0e] p-7">
              <dt class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                {String(s.n).padStart(2, "0")}
              </dt>
              <dd class="mt-2 text-base font-medium">{t(s.titleKey)}</dd>
              <dd class="mt-2 text-[14px] leading-relaxed text-white/60">{t(s.bodyKey)}</dd>
            </div>
          ))}
        </dl>

        <div class="mx-auto mt-14 max-w-2xl text-center">
          <h2 class="font-heading text-3xl font-medium tracking-tight">{t(k("cta.title"))}</h2>
          <p class="mx-auto mt-3 max-w-md text-[15px] text-white/55">{t(k("cta.body"))}</p>
          <a
            href={blogPath()}
            class="mt-8 inline-flex items-center gap-2 text-sm font-medium text-white/45 transition hover:text-white"
          >
            <ArrowLeft size={15} weight="bold" />
            {t("blog.back")}
          </a>
        </div>
      </main>

      <div>
        <BlogFooter />
      </div>
      <Doccy
        slug="plugins"
        faqs={[1, 2, 3, 4, 5].map((n) => ({
          titleKey: k(`s${n}.title`),
          bodyKey: k(`s${n}.body`),
        }))}
      />
    </div>
  );
}
