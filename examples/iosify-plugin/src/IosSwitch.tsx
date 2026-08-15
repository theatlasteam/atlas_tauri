import { Show } from "solid-js";

// The iOS toggle: a green track (SF system green) with a white knob that
// slides. Slightly narrower than the built-in pill and with the iOS
// translucent border around the knob.

export function IosSwitch(props: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "51px",
        height: "31px",
        flexShrink: 0,
        padding: 0,
        border: 0,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          position: "relative",
          display: "block",
          width: "51px",
          height: "31px",
          borderRadius: "999px",
          background: props.checked ? "#34c759" : "rgba(120,120,128,0.32)",
          transition: "background-color 0.2s ease",
          boxShadow: props.checked
            ? "inset 0 0 0 0.5px rgba(0,0,0,0.04)"
            : "inset 0 0 0 0.5px rgba(0,0,0,0.04)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "2px",
            left: props.checked ? "24px" : "2px",
            width: "27px",
            height: "27px",
            borderRadius: "999px",
            background: "#ffffff",
            boxShadow: "0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)",
            transition: "left 0.2s ease",
          }}
        />
      </span>
    </button>
  );
}
