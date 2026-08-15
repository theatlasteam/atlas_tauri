import type { SwitchStyle } from "./main";

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  style: SwitchStyle;
}

// NOTE: style objects must use kebab-case keys ("border-radius", "align-items").
// CamelCase keys get baked into the DOM template as-is by the Solid transform,
// which the browser's CSS parser ignores — so `borderRadius` silently breaks.
function Shell(props: {
  label?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: unknown;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      style={{
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        "min-width": "44px",
        "min-height": "44px",
        border: "0",
        padding: "0",
        cursor: "pointer",
        background: "transparent",
      }}
    >
      {props.children}
    </button>
  );
}

/** The app's classic pill — a rounded track with a sliding knob. */
function DefaultStyle(props: SwitchProps) {
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "block",
          width: "64px",
          height: "28px",
          "border-radius": "999px",
          background: props.checked ? "var(--color-accent)" : "var(--color-border)",
          transition: "background-color 0.2s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: props.checked ? "38px" : "2px",
            width: "24px",
            height: "24px",
            "border-radius": "999px",
            background: "var(--color-ink)",
            "box-shadow": "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 0.2s ease",
          }}
        />
      </span>
    </Shell>
  );
}

/** A checkbox that draws a checkmark when on. */
function CheckboxStyle(props: SwitchProps) {
  const size = 26;
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          width: `${size}px`,
          height: `${size}px`,
          "border-radius": "7px",
          border: `2px solid ${props.checked ? "var(--color-accent)" : "var(--color-border)"}`,
          background: props.checked ? "var(--color-accent)" : "transparent",
          transition: "background-color 0.15s ease, border-color 0.15s ease",
        }}
      >
        <svg
          viewBox="0 0 16 16"
          width={size * 0.55}
          height={size * 0.55}
          fill="none"
          style={{
            opacity: props.checked ? 1 : 0,
            transform: props.checked ? "scale(1)" : "scale(0.6)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
          }}
        >
          <path
            d="M3 8.2L6.5 11.7L13 4.3"
            stroke="#fff"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </Shell>
  );
}

/** A compact capsule: a narrow pill with a small dot. */
function CapsuleStyle(props: SwitchProps) {
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "block",
          width: "52px",
          height: "26px",
          "border-radius": "8px",
          background: props.checked ? "var(--color-accent)" : "var(--color-border)",
          transition: "background-color 0.15s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "4px",
            left: props.checked ? "28px" : "4px",
            width: "18px",
            height: "18px",
            "border-radius": "4px",
            background: "#fff",
            transition: "left 0.15s ease",
          }}
        />
      </span>
    </Shell>
  );
}

/** A minimal single line that lights up when on. */
function MinimalStyle(props: SwitchProps) {
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "block",
          width: "48px",
          height: "4px",
          "border-radius": "999px",
          background: props.checked ? "var(--color-accent)" : "var(--color-border)",
          transition: "background-color 0.2s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "-6px",
            left: props.checked ? "34px" : "0px",
            width: "16px",
            height: "16px",
            "border-radius": "999px",
            border: `2px solid ${props.checked ? "var(--color-accent)" : "var(--color-border)"}`,
            background: "var(--color-surface-raised)",
            transition: "left 0.2s ease",
          }}
        />
      </span>
    </Shell>
  );
}

/** A radio button: a circle with a filled dot when on. */
function RadioStyle(props: SwitchProps) {
  const size = 28;
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          width: `${size}px`,
          height: `${size}px`,
          "border-radius": "999px",
          border: `2px solid ${props.checked ? "var(--color-accent)" : "var(--color-border)"}`,
          transition: "border-color 0.15s ease",
        }}
      >
        <span
          style={{
            width: "14px",
            height: "14px",
            "border-radius": "999px",
            background: "var(--color-accent)",
            opacity: props.checked ? 1 : 0,
            transform: props.checked ? "scale(1)" : "scale(0.4)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
          }}
        />
      </span>
    </Shell>
  );
}

/** A squircle: rounded-square track with a square knob. */
function SquircleStyle(props: SwitchProps) {
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "block",
          width: "60px",
          height: "32px",
          "border-radius": "10px",
          background: props.checked ? "var(--color-accent)" : "var(--color-border)",
          transition: "background-color 0.18s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "4px",
            left: props.checked ? "32px" : "4px",
            width: "24px",
            height: "24px",
            "border-radius": "7px",
            background: "#fff",
            "box-shadow": "0 1px 3px rgba(0,0,0,0.3)",
            transition: "left 0.18s ease",
          }}
        />
      </span>
    </Shell>
  );
}

/** iOS-style: a green track with a white knob that slides. */
function IosStyle(props: SwitchProps) {
  return (
    <Shell {...props}>
      <span
        style={{
          position: "relative",
          display: "block",
          width: "52px",
          height: "31px",
          "border-radius": "999px",
          background: props.checked ? "#34c759" : "rgba(120,120,128,0.32)",
          transition: "background-color 0.2s ease",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: props.checked ? "24px" : "2px",
            width: "27px",
            height: "27px",
            "border-radius": "999px",
            background: "#fff",
            "box-shadow": "0 2px 4px rgba(0,0,0,0.2)",
            transition: "left 0.2s ease",
          }}
        />
      </span>
    </Shell>
  );
}

export function SwitcherooSwitch(props: SwitchProps) {
  switch (props.style) {
    case "checkbox":
      return <CheckboxStyle {...props} />;
    case "capsule":
      return <CapsuleStyle {...props} />;
    case "minimal":
      return <MinimalStyle {...props} />;
    case "radio":
      return <RadioStyle {...props} />;
    case "squircle":
      return <SquircleStyle {...props} />;
    case "ios":
      return <IosStyle {...props} />;
    default:
      return <DefaultStyle {...props} />;
  }
}
