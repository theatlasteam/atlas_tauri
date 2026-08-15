import { createSignal } from "solid-js";

// iOSify configuration screen — toggles which parts of the iOS treatment the
// plugin applies. Settings persist in the plugin's own storage.

const FEATURES = [
  { key: "colors", label: "iOS colors", hint: "System blue accent, iOS grays" },
  { key: "gradient", label: "Gradient background", hint: "Liquid-glass gradient wallpaper" },
  { key: "squircles", label: "Squircles", hint: "Continuous-corner avatars & cards" },
  { key: "nofont", label: "SF-style font", hint: "System font stack" },
  { key: "nodesc", label: "No list descriptions", hint: "Grouped lists show one line" },
  { key: "iosui", label: "iOS components", hint: "Switch, dialog, tab bar, rail" },
];

export function IosifySettings(props: {
  plugin: { id: string; name: string };
  onClose: () => void;
  ctx: { storage: { get(key: string): string | null; set(key: string, value: string): void } };
}) {
  const read = (key: string, def = true) => {
    const v = props.ctx.storage.get(key);
    return v === null ? def : v === "1";
  };

  const [toggles, setToggles] = createSignal<Record<string, boolean>>(
    Object.fromEntries(FEATURES.map((f) => [f.key, read(f.key)])),
  );

  const set = (key: string, on: boolean) => {
    setToggles({ ...toggles(), [key]: on });
    props.ctx.storage.set(key, on ? "1" : "0");
  };

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "12px" }}>
      <p style={{ margin: "0", "font-size": "13px", color: "var(--color-ink-subtle)" }}>
        Makes the app look like iOS. Toggle each treatment on or off.
      </p>

      <div style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
        {FEATURES.map((f) => (
          <div
            key={f.key}
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "12px",
              padding: "10px 4px",
              "border-bottom": "1px solid var(--color-border)",
            }}
          >
            <div style={{ "min-width": "0" }}>
              <p style={{ margin: "0", "font-size": "14px", "font-weight": 500, color: "var(--color-ink)" }}>
                {f.label}
              </p>
              <p style={{ margin: "2px 0 0", "font-size": "12px", color: "var(--color-ink-subtle)" }}>
                {f.hint}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={toggles()[f.key]}
              onClick={() => set(f.key, !toggles()[f.key])}
              style={{
                flexShrink: 0,
                position: "relative",
                width: "51px",
                height: "31px",
                border: 0,
                padding: 0,
                borderRadius: "999px",
                background: toggles()[f.key] ? "#34c759" : "rgba(120,120,128,0.32)",
                cursor: "pointer",
                transition: "background-color 0.2s ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "2px",
                  left: toggles()[f.key] ? "24px" : "2px",
                  width: "27px",
                  height: "27px",
                  borderRadius: "999px",
                  background: "#fff",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.15)",
                  transition: "left 0.2s ease",
                }}
              />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={props.onClose}
        style={{
          padding: "10px 0",
          border: 0,
          borderRadius: "14px",
          background: "var(--color-accent-soft)",
          color: "var(--color-accent)",
          "font-size": "15px",
          "font-weight": 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Done
      </button>
    </div>
  );
}
