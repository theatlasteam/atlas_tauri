import { createSignal } from "solid-js";
import type { SwitchStyle } from "./main";

const STYLES: { id: SwitchStyle; label: string; hint: string }[] = [
  { id: "default", label: "Default", hint: "The classic pill with a sliding knob." },
  { id: "checkbox", label: "Checkbox", hint: "A square that draws a checkmark when on." },
  { id: "capsule", label: "Capsule", hint: "A compact squared pill with a small dot." },
  { id: "minimal", label: "Minimal", hint: "A single line with a small knob." },
  { id: "radio", label: "Radio", hint: "A circle with a filled dot when on." },
  { id: "squircle", label: "Squircle", hint: "A rounded-square track with a square knob." },
  { id: "ios", label: "iOS", hint: "The green Apple switch with a white knob." },
];

const STYLE_IDS: SwitchStyle[] = ["default", "checkbox", "capsule", "minimal", "radio", "squircle", "ios"];

interface SettingsCtx {
  storage: { get(key: string): string | null; set(key: string, value: string): void };
}

export function SwitcherooSettings(props: {
  plugin: { id: string; name: string };
  onClose: () => void;
  ctx: SettingsCtx;
}) {
  const stored = () => props.ctx.storage.get("style");
  const [style, setStyle] = createSignal<SwitchStyle>(
    STYLE_IDS.includes(stored() as SwitchStyle) ? (stored() as SwitchStyle) : "default",
  );

  const choose = (id: SwitchStyle) => {
    setStyle(id);
    props.ctx.storage.set("style", id);
  };

  return (
    <div style={{ padding: "20px 20px 40px", "max-width": "480px", margin: "0 auto" }}>
      <p style={{ "font-size": "13px", color: "var(--color-ink-subtle)", "margin-bottom": "12px" }}>
        {props.plugin.name} — choose how every switch in Atlas looks. Applies immediately.
      </p>
      <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
        {STYLES.map((s) => {
          const active = () => style() === s.id;
          return (
            <button
              type="button"
              onClick={() => choose(s.id)}
              style={{
                display: "flex",
                "align-items": "center",
                "justify-content": "space-between",
                gap: "12px",
                padding: "14px 16px",
                "border-radius": "14px",
                border: `1px solid ${active() ? "var(--color-accent)" : "var(--color-border)"}`,
                background: active() ? "var(--color-accent-soft)" : "var(--color-surface)",
                cursor: "pointer",
                "text-align": "left",
                "font-family": "inherit",
                transition: "border-color 0.15s ease, background-color 0.15s ease",
              }}
            >
              <div style={{ "min-width": "0" }}>
                <div style={{ "font-size": "15px", "font-weight": 600, color: "var(--color-ink)" }}>
                  {s.label}
                </div>
                <div style={{ "font-size": "13px", color: "var(--color-ink-muted)", "margin-top": "2px" }}>
                  {s.hint}
                </div>
              </div>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  "border-radius": "999px",
                  "flex-shrink": "0",
                  background: active() ? "var(--color-accent)" : "var(--color-border)",
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
