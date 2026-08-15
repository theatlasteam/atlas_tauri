import { For } from "solid-js";

// Material 3-style bottom app bar. Key difference from Atlas's built-in nav:
// it's docked to the bottom edge (fixed, inset:0, full-width, no floating
// pill, no padding gap, no separate search FAB) with a M3 color surface.
//
// Uses app CSS variables where they exist so it stays in the app's theme;
// the "material" look comes from the solid container + active pill.
//
// NOTE: style objects use kebab-case keys only — the Solid transform bakes
// them into DOM template strings verbatim, and the browser's CSS parser
// ignores camelCase keys like `flexDirection`.

const TABS = [
  { id: "/", label: "Chats", glyph: "💬" },
  { id: "/settings", label: "Settings", glyph: "⚙️" },
  { id: "/profile", label: "Profile", glyph: "👤" },
];

export function MaterialNavBar(props: {
  navigate: (to: string) => void;
  pathname: string;
  showPill?: boolean;
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
        inset: "auto 0 0 0",
        display: "flex",
        "align-items": "stretch",
        // M3 "surface-container": lifted tinted surface, no floating shadow.
        background: "var(--color-surface-raised, #fdfbf8)",
        "border-top": "1px solid var(--color-border, rgba(0,0,0,0.08))",
        // High enough to sit above chat content but below dialogs.
        "z-index": 20,
        // Let the app's status-bar safe inset space us correctly.
        "padding-bottom": "max(var(--safe-bottom, 0px), 0px)",
        "padding-top": "8px",
        height: "auto",
        "box-shadow": "0 -1px 0 rgba(0,0,0,0.03)",
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
                gap: "2px",
                padding: "10px 0 8px",
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
                  // M3 active indicator: a filled "secondary-container" pill
                  // around the icon, inactive icons are plain and muted.
                  width: "56px",
                  height: "32px",
                  "border-radius": "999px",
                  background:
                    active() && props.showPill !== false
                      ? "var(--color-accent-soft, rgba(201,119,46,0.2))"
                      : "transparent",
                  color: active() ? "var(--color-accent, #c9772e)" : "var(--color-ink-subtle, #8a8378)",
                  "font-size": "18px",
                  transition: "background-color 0.2s ease, color 0.2s ease",
                }}
              >
                {tab.glyph}
              </span>
              <span
                style={{
                  "font-size": "12px",
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
