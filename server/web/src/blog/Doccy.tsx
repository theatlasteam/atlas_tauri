import { createSignal, For, onCleanup, Show } from "solid-js";
import { PaperPlaneRight, X } from "phosphor-solid-js";
import MascotOrb from "./MascotOrb";
import { locale, t, type TranslationKey } from "../lib/i18n";

export interface DoccyFaq {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

interface Msg {
  from: "doccy" | "you";
  text: string;
}

const STOP = new Set([
  "what", "whats", "when", "where", "which", "whos", "whose", "does",
  "have", "has", "with", "from", "that", "this", "these", "those",
  "about", "into", "your", "yours", "their", "there", "they", "them", "then",
  "than", "also", "just", "like", "such", "more", "most", "much", "many",
  "will", "would", "could", "should", "because", "while", "after", "before",
  "это", "как", "что", "для", "или", "при", "про", "так", "уже", "если",
  "есть", "было", "будет", "можно", "меня", "тебя", "себя", "такое",
  "такой", "такая", "которые", "который", "которая", "между", "через",
  "чтобы", "почему", "сколько", "расскажи", "подскажи",
]);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-zа-яё0-9]+/gi) ?? []).filter((w) => w.length > 3 && !STOP.has(w));
}

/** One Doccy turn against the real backend. Null on any failure — the
 *  caller falls back to local extractive matching, so AI outages and
 *  rate limits never surface as errors. */
async function askRemote(
  slug: string,
  faqs: { title: string; body: string }[],
  history: { role: string; content: string }[],
  question: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch("/api/blog/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, locale: locale(), question, faqs, history }),
      signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const answer =
      typeof data === "object" && data !== null && "answer" in data
        ? String((data as { answer: unknown }).answer ?? "").trim()
        : "";
    return answer || null;
  } catch {
    return null;
  }
}

/** Offline fallback: extractive Q&A over the post's own sections — the
 *  best-matching section body wins. */
function findAnswer(q: string, faqs: { title: string; body: string }[]): string | null {
  const question = [...new Set(tokens(q))];
  if (question.length === 0) return null;
  let best = -1;
  let bestScore = 0;
  faqs.forEach((f, i) => {
    const hay = new Set(tokens(`${f.title} ${f.body}`));
    let score = 0;
    for (const w of question) {
      for (const h of hay) {
        if (h.includes(w) || w.includes(h)) {
          score += 1;
          break;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return bestScore >= 1 && best >= 0 ? faqs[best].body : null;
}

/** Doccy, the docs Mind: peeks around the bottom-right corner of every blog
 *  page. Clicking him opens a small panel where readers can quiz him on the
 *  post they are reading. Answers come from the real inference backend
 *  (POST /api/blog/ask, same gateway and kimi-k3 model as Minds); the local
 *  extractive matcher below is only the offline fallback. One gentle bob,
 *  no other motion. */
export default function Doccy(props: { slug: string; faqs: DoccyFaq[] }) {
  const [open, setOpen] = createSignal(false);
  const [msgs, setMsgs] = createSignal<Msg[]>([{ from: "doccy", text: t("doccy.greeting") }]);
  const [draft, setDraft] = createSignal("");
  const [thinking, setThinking] = createSignal(false);
  let scrollBox: HTMLDivElement | undefined;
  let inflight: AbortController | undefined;
  let alive = true;
  onCleanup(() => {
    alive = false;
    inflight?.abort();
  });

  const scrollDown = () => {
    window.setTimeout(() => {
      if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
    }, 0);
  };

  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q || thinking()) return;
    const prior = msgs()
      .slice(-6)
      .map((m) => ({ role: m.from === "you" ? "user" : "assistant", content: m.text }));
    setMsgs((m) => [...m, { from: "you", text: q }]);
    setDraft("");
    setThinking(true);
    scrollDown();
    void reply(q, prior);
  };

  const reply = async (q: string, history: { role: string; content: string }[]) => {
    const faqs = props.faqs.map((f) => ({ title: t(f.titleKey), body: t(f.bodyKey) }));
    inflight?.abort();
    const ctrl = new AbortController();
    inflight = ctrl;
    const timer = window.setTimeout(() => ctrl.abort(), 60_000);
    let remote: string | null = null;
    try {
      remote = await askRemote(props.slug, faqs, history, q, ctrl.signal);
    } finally {
      window.clearTimeout(timer);
      if (inflight === ctrl) inflight = undefined;
    }
    if (!alive) return;
    const text =
      remote ?? findAnswer(q, faqs) ?? `${t("doccy.fallback")} ${faqs.map((f) => f.title).join(" · ")}`;
    setThinking(false);
    setMsgs((m) => [...m, { from: "doccy", text }]);
    scrollDown();
  };

  onCleanup(() => window.clearTimeout(replyTimer));

  const chips = () => props.faqs.slice(0, 3).map((f) => t(f.titleKey));

  return (
    <>
      {/* The peek: tucked behind the viewport corner — roughly half the orb
        *  is clipped by the screen edge until hovered or opened. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open() ? t("doccy.close") : t("doccy.teaser")}
        aria-expanded={open()}
        class="fixed bottom-0 right-0 z-50"
      >
        <span
          class="doccy-bob relative block transition-transform duration-300"
          classList={{
            "translate-x-[45%] translate-y-[45%] hover:translate-x-[20%] hover:translate-y-[20%]": !open(),
          }}
        >
          <Show when={!open()}>
            <span class="absolute -left-44 top-2 hidden whitespace-nowrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-left text-[13px] text-bg shadow-xl sm:block">
              {t("doccy.teaser")}
            </span>
          </Show>
          <span class="block drop-shadow-[-10px_-10px_18px_rgba(0,0,0,0.55)]">
            <MascotOrb state={open() ? "happy" : thinking() ? "thinking" : "idle"} size={88} />
          </span>
        </span>
      </button>

      {/* The chat panel. */}
      <Show when={open()}>
        <section
          aria-label={t("doccy.name")}
          class="fixed bottom-24 right-3 z-50 flex max-h-[70vh] w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:right-5"
        >
          <header class="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <MascotOrb state="happy" size={34} />
            <p class="flex-1 text-[15px] font-semibold">{t("doccy.name")}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("doccy.close")}
              class="rounded-full p-1.5 text-ink-muted transition hover:bg-border hover:text-ink"
            >
              <X size={16} />
            </button>
          </header>

          <div ref={scrollBox} class="max-h-80 space-y-3 overflow-y-auto p-4">
            <For each={msgs()}>
              {(m) => (
                <p
                  classList={{
                    "mr-auto rounded-bl-md bg-border/60 text-ink": m.from === "doccy",
                    "ml-auto rounded-br-md bg-accent text-white": m.from === "you",
                  }}
                  class="w-fit max-w-[90%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed"
                >
                  {m.text}
                </p>
              )}
            </For>
            <Show when={thinking()}>
              <p class="w-fit rounded-2xl rounded-bl-md bg-border/60 px-3.5 py-2 text-sm text-ink-muted">
                <span class="animate-pulse">{t("doccy.typing")}</span>
              </p>
            </Show>
          </div>

          <div class="flex gap-2 overflow-x-auto px-4 pb-1">
            <For each={chips()}>
              {(c) => (
                <button
                  type="button"
                  onClick={() => ask(c)}
                  class="shrink-0 truncate rounded-full border border-border px-3 py-1.5 text-xs text-ink-muted transition hover:border-accent hover:text-ink"
                >
                  {c}
                </button>
              )}
            </For>
          </div>

          <form
            class="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft());
            }}
          >
            <input
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              placeholder={t("doccy.placeholder")}
              aria-label={t("doccy.placeholder")}
              class="min-w-0 flex-1 rounded-full border border-border bg-bg px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent"
            />
            <button
              type="submit"
              aria-label={t("doccy.send")}
              class="rounded-full bg-ink p-2.5 text-bg transition hover:opacity-85"
            >
              <PaperPlaneRight size={16} />
            </button>
          </form>

          <a
            href="/app/"
            class="border-t border-border px-4 py-2.5 text-center text-xs font-medium text-accent transition hover:opacity-80"
          >
            {t("doccy.app")}
          </a>
        </section>
      </Show>
    </>
  );
}
