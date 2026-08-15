import { For } from "solid-js";

// Material 3-style navigation rail for desktop: a slim docked bar on the left
// edge (non-floating, full-height), with M3 active-indicator pills.
//
// NOTE: style objects use kebab-case keys only — the Solid transform bakes
// them into DOM template strings verbatim, and the browser's CSS parser
// ignores camelCase keys like `flexDirection`.

const TABS = [
  { id: "/", label: "Chats", glyph: "💬" },
  { id: "/settings", label: "Settings", glyph: "⚙️" },
  { id: "/profile", label: "Profile", glyph: "👤" },
];

export function MaterialRail(props: {
  navigate: (to: string) => void;
  pathname: string;
}) {
  const activeTab = () => {
    const p = props.pathname;
    if (p === "/" || p.startsWith("/chat")) return "/";
    if (p.startsWith("/settings")) return "/settings";
    if (p.startsWith("/profile")) return "/profile";
    return null;
  };

  return (
    <div
      role="navigation"
      aria-label="Primary"
      style={{
        position: "fixed",
        inset: "0 auto 0 0",
        width: "80px",
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "12px",
        "padding-top": "max(var(--safe-top, 0px), 12px)",
        "padding-bottom": "16px",
        background: "var(--color-surface-raised, #fdfbf8)",
        "border-right": "1px solid var(--color-border, rgba(0,0,0,0.08))",
        "z-index": 20,
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
                width: "56px",
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: "2px",
                padding: "6px 0",
                border: 0,
                cursor: "pointer",
                background: "transparent",
                "font-family": "inherit",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  "justify-content": "center",
                  width: "56px",
                  height: "32px",
                  "border-radius": "999px",
                  background: active() ? "var(--color-accent-soft, rgba(201,119,46,0.2))" : "transparent",
                  color: active() ? "var(--color-accent, #c9772e)" : "var(--color-ink-subtle, #8a8378)",
                  "font-size": "18px",
                  transition: "background-color 0.2s ease, color 0.2s ease",
                }}
              >
                {tab.glyph}
              </span>
              <span
                style={{
                  "font-size": "11px",
                  "font-weight": active() ? 700 : 500,
                  color: active() ? "var(--color-accent, #c9772e)" : "var(--color-ink-muted, #6b6459)",
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
