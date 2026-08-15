import { Show } from "solid-js";

// iOS alert dialog: a centered card with large continuous-corner radius
// (squircle ~ 21px), a blue "OK"/dismiss button and iOS system blur backdrop.
// Unlike the app's default bottom sheet, iOS dialogs are always centered and
// fairly small.
//
// NOTE: style objects use kebab-case keys only — the Solid transform bakes
// them into DOM template strings verbatim, and the browser's CSS parser
// ignores camelCase keys like `borderRadius`.

export function IosDialog(props: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: any;
}) {
  return (
    <Show when={props.open}>
      <div
        style={{
          position: "fixed",
          inset: "0",
          "z-index": 50,
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
          padding: "24px",
        }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            background: "rgba(0,0,0,0.4)",
            "backdrop-filter": "blur(20px) saturate(180%)",
            "-webkit-backdrop-filter": "blur(20px) saturate(180%)",
          }}
          onClick={() => props.onOpenChange(false)}
        />

        {/* Alert card */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          style={{
            position: "relative",
            "z-index": 10,
            width: "100%",
            "max-width": "270px",
            overflow: "hidden",
            background: "var(--color-surface-raised, #f9f9f9)",
            "border-radius": "21px",
            "box-shadow": "0 20px 60px -12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ padding: "20px 16px 8px", "text-align": "center" }}>
            <h2
              style={{
                margin: "0 0 8px",
                "font-size": "17px",
                "font-weight": 600,
                color: "var(--color-ink, #000)",
              }}
            >
              {props.title}
            </h2>
            <div style={{ "font-size": "13px", "line-height": "1.45", color: "var(--color-ink-muted, #3c3c43)" }}>
              {props.children}
            </div>
          </div>

          {/* Button row */}
          <div
            style={{
              display: "flex",
              "margin-top": "12px",
              "border-top": "1px solid var(--color-border, rgba(60,60,67,0.16))",
            }}
          >
            <button
              type="button"
              onClick={() => props.onOpenChange(false)}
              style={{
                flex: "1",
                padding: "11px 0",
                border: 0,
                background: "transparent",
                "font-size": "17px",
                "font-weight": 600,
                color: "var(--color-accent, #007aff)",
                cursor: "pointer",
                "font-family": "inherit",
              }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
