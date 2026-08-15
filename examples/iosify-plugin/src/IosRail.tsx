import { For } from "solid-js";

// iOS-style desktop sidebar rail: translucent, frosted, with squircle
// (continuous-corner) icon tiles instead of the app's circular ones.
//
// NOTE: style objects use kebab-case keys only — the Solid transform bakes
// them into DOM template strings verbatim, and the browser's CSS parser
// ignores camelCase keys like `borderRadius`.

const TABS = [
  { id: "/", label: "Chats", glyph: "💬", match: (p: string) => p === "/" || p.startsWith("/chat") },
  { id: "/settings", label: "Settings", glyph: "⚙️", match: (p: string) => p.startsWith("/settings") },
  { id: "/profile", label: "Profile", glyph: "👤", match: (p: string) => p.startsWith("/profile") },
];

export function IosRail(props: {
  navigate: (to: string) => void;
  pathname: string;
}) {
  const activeTab = () => TABS.find((t) => t.match(props.pathname))?.id ?? null;

  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "6px",
        width: "100%",
        height: "100%",
        padding: "12px 0",
        background: "transparent",
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
              title={tab.label}
              style={{
                display: "inline-flex",
                "align-items": "center",
                "justify-content": "center",
                width: "48px",
                height: "48px",
                border: 0,
                "border-radius": "28% / 28%",
                background: active() ? "rgba(0,122,255,0.14)" : "transparent",
                color: active() ? "var(--color-accent, #007aff)" : "var(--color-ink-muted, #6b6459)",
                "font-size": "20px",
                cursor: "pointer",
                transition: "background-color 0.2s ease, color 0.2s ease",
              }}
            >
              {tab.glyph}
            </button>
          );
        }}
      </For>
    </nav>
  );
}
