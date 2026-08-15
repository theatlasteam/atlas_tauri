import { createSignal } from "solid-js";

// Quotes — a one-sided plugin that runs entirely on this device (no shared
// state, so it works fine on just one end):
//
//   * "inspire me" (case-insensitive) anywhere in a message you send triggers
//     an onSent hook that fetches a random quote from a public API and sends
//     it back into the chat.
//   * Fires a system notification when the quote lands.
//   * A command (run from the Plugins screen) shows the last-fetched quote.
//
// Requires "messages.send", "messages.read", "notifications". (The external
// quote API is fetched with the page's global fetch — ctx.api is rooted at
// the Atlas API and is for server endpoints.)

const QUOTE_API = "https://api.quotable.io/random";

const BUILTIN_QUOTES = [
  "The best way out is always through. — Robert Frost",
  "Simplicity is the ultimate sophistication. — Leonardo da Vinci",
  "It does not matter how slowly you go as long as you do not stop. — Confucius",
];

export function activate(ctx) {
  ctx.log("Quotes active");

  let lastQuote = ctx.storage.get("lastQuote") ?? "";

  const fetchQuote = async (): Promise<string> => {
    try {
      const res = await fetch(QUOTE_API);
      if (!res.ok) throw new Error(`quote API ${res.status}`);
      const data = (await res.json()) as { content?: string; author?: string };
      if (data?.content) return `“${data.content}” — ${data.author ?? "Anonymous"}`;
    } catch (e) {
      ctx.log("quote fetch failed, using builtin", e);
    }
    return BUILTIN_QUOTES[Math.floor(Math.random() * BUILTIN_QUOTES.length)];
  };

  ctx.onSent(async (message) => {
    if (!/inspire me/i.test(message.text)) return;
    try {
      const quote = await fetchQuote();
      lastQuote = quote;
      ctx.storage.set("lastQuote", quote);
      await ctx.sendMessage(message.chatId, `✨ ${quote}`);
      ctx.notify({ title: "Quote delivered", body: quote.slice(0, 80) });
    } catch (e) {
      ctx.toast("Couldn't fetch a quote right now");
      ctx.log(e);
    }
  });

  ctx.registerCommand({
    id: "quotes.show",
    label: "Show last quote",
    description: "Display the most recently fetched quote",
    run: () => {
      if (lastQuote) ctx.toast(lastQuote);
      else ctx.toast("No quote fetched yet — send a message containing “inspire me”.");
    },
  });

  // Simple config screen so the plugin row has somewhere to show state.
  const [quote, setQuote] = createSignal(lastQuote);
  ctx.ui.configScreen(({ plugin, onClose }) => (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      <p style={{ margin: "0", "font-size": "13px", color: "var(--color-ink-subtle)" }}>
        Send a message containing “inspire me” and Quotes replies with a random quote.
      </p>
      <div
        style={{
          padding: "14px 16px",
          "border-radius": "14px",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          "font-size": "14px",
          color: "var(--color-ink)",
        }}
      >
        {quote() ? (
          <span>{quote()}</span>
        ) : (
          <span style={{ color: "var(--color-ink-subtle)" }}>No quote yet.</span>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          padding: "10px 0",
          border: 0,
          "border-radius": "14px",
          background: "var(--color-accent-soft)",
          color: "var(--color-accent)",
          "font-size": "15px",
          "font-weight": 600,
          cursor: "pointer",
          "font-family": "inherit",
        }}
      >
        Done
      </button>
    </div>
  ));
}
