import { For } from "solid-js";

// Material 3-style navigation rail for desktop: a slim docked bar on the left
// edge (non-floating, full-height), with M3 active-indicator pills.

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
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        paddingTop: "max(var(--safe-top, 0px), 12px)",
        paddingBottom: "16px",
        background: "var(--color-surface-raised, #fdfbf8)",
        borderRight: "1px solid var(--color-border, rgba(0,0,0,0.08))",
        zIndex: 20,
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
                flexDirection: "column",
                alignItems: "center",
                gap: "2px",
                padding: "6px 0",
                border: 0,
                cursor: "pointer",
                background: "transparent",
                fontFamily: "inherit",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "56px",
                  height: "32px",
                  borderRadius: "999px",
                  background: active() ? "var(--color-accent-soft, rgba(201,119,46,0.2))" : "transparent",
                  color: active() ? "var(--color-accent, #c9772e)" : "var(--color-ink-subtle, #8a8378)",
                  fontSize: "18px",
                  transition: "background-color 0.2s ease, color 0.2s ease",
                }}
              >
                {tab.glyph}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: active() ? 700 : 500,
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
