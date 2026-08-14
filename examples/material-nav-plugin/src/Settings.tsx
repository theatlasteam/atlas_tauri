import { createSignal } from "solid-js";

// Material Nav configuration screen. It's registered from activate(ctx), so
// `ctx` here is the plugin SDK (storage persists across restarts).
export function MaterialNavSettings(props: {
  plugin: { id: string; name: string };
  onClose: () => void;
  ctx: {
    storage: {
      get(key: string): string | null;
      set(key: string, value: string): void;
    };
  };
}) {
  const stored = () => props.ctx.storage.get("showPill");
  const [showPill, setShowPill] = createSignal(stored() === null ? true : stored() === "1");

  const toggle = () => {
    const next = !showPill();
    setShowPill(next);
    props.ctx.storage.set("showPill", next ? "1" : "0");
  };

  const row = (label: string, hint: string, value: boolean, onToggle: () => void) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        padding: "14px 0",
        borderBottom: "1px solid var(--color-border, rgba(0,0,0,0.08))",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-ink)" }}>{label}</div>
        <div style={{ fontSize: "13px", color: "var(--color-ink-muted)", marginTop: "2px" }}>{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={onToggle}
        style={{
          width: "52px",
          height: "30px",
          borderRadius: "999px",
          border: "0",
          cursor: "pointer",
          flexShrink: 0,
          background: value ? "var(--color-accent, #c9772e)" : "var(--color-border, rgba(0,0,0,0.15))",
          transition: "background-color 150ms ease",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "3px",
            left: value ? "25px" : "3px",
            width: "24px",
            height: "24px",
            borderRadius: "999px",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 150ms ease",
          }}
        />
      </button>
    </div>
  );

  return (
    <div style={{ padding: "20px 20px 40px", maxWidth: "480px", margin: "0 auto" }}>
      <p style={{ fontSize: "13px", color: "var(--color-ink-subtle)", marginBottom: "8px" }}>
        {props.plugin.name} — changes apply immediately.
      </p>
      {row(
        "Active pill indicator",
        "Highlight the active tab with a filled pill.",
        showPill(),
        toggle,
      )}
    </div>
  );
}
