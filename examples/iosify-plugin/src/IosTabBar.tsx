import { For } from "solid-js";

// iOS tab bar: a translucent frosted bar docked to the bottom edge, with
// centered icon + label per tab, the active tab in system blue. Uses SF
// Symbol-ish glyphs (we can't ship the SF font, so these are simple unicode
// approximations) and the app's safe-area inset for the home indicator.
//
// NOTE: style objects use kebab-case keys only — the Solid transform bakes
// them into DOM template strings verbatim, and the browser's CSS parser
// ignores camelCase keys like `justifyContent`.

const TABS = [
  { id: "/", label: "Chats", glyph: "💬", match: (p: string) => p === "/" || p.startsWith("/chat") },
  { id: "/settings", label: "Settings", glyph: "⚙️", match: (p: string) => p.startsWith("/settings") },
  { id: "/profile", label: "Profile", glyph: "👤", match: (p: string) => p.startsWith("/profile") },
];

export function IosTabBar(props: {
  navigate: (to: string) => void;
  pathname: string;
}) {
  const activeTab = () => TABS.find((t) => t.match(props.pathname))?.id ?? null;

  return (
    <div
      role="navigation"
      aria-label="Primary"
      style={{
        position: "fixed",
        inset: "auto 0 0 0",
        "z-index": 30,
        display: "flex",
        "align-items": "stretch",
        background: "rgba(246,246,246,0.78)",
        "backdrop-filter": "blur(20px) saturate(180%)",
        "-webkit-backdrop-filter": "blur(20px) saturate(180%)",
        "border-top": "0.5px solid rgba(0,0,0,0.12)",
        "padding-top": "8px",
        "padding-bottom": "max(var(--safe-bottom, 0px), 0px)",
        "box-shadow": "0 -0.5px 0 rgba(0,0,0,0.02)",
      }}
    >
      <For each={TABS}>
        {(tab) => {
          const active = () => activeTab() === tab.id;
          return (
            <button
              type="button"
              onClick={() => props.navigate(tab.id)}
              aria-current={active() ? "page" : undefined}
              style={{
                flex: 1,
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                "justify-content": "center",
                gap: "3px",
                padding: "4px 0 6px",
                border: 0,
                background: "transparent",
                cursor: "pointer",
                "font-family": "inherit",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  "justify-content": "center",
                  width: "44px",
                  height: "29px",
                  "border-radius": "999px",
                  background: active() ? "rgba(0,122,255,0.14)" : "transparent",
                  color: active() ? "var(--color-accent, #007aff)" : "var(--color-ink-muted, #6b6459)",
                  "font-size": "18px",
                  transition: "background-color 0.2s ease, color 0.2s ease",
                }}
              >
                {tab.glyph}
              </span>
              <span
                style={{
                  "font-size": "10px",
                  "font-weight": active() ? 600 : 500,
                  color: active() ? "var(--color-accent, #007aff)" : "var(--color-ink-muted, #6b6459)",
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
