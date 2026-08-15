import { Show } from "solid-js";

// iOS alert dialog: a centered card with large continuous-corner radius
// (squircle ~ 21px), a blue "OK"/dismiss button and iOS system blur backdrop.
// Unlike the app's default bottom sheet, iOS dialogs are always centered and
// fairly small.

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
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
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
            zIndex: 10,
            width: "100%",
            maxWidth: "270px",
            overflow: "hidden",
            background: "var(--color-surface-raised, #f9f9f9)",
            borderRadius: "21px",
            boxShadow: "0 20px 60px -12px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ padding: "20px 16px 8px", textAlign: "center" }}>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--color-ink, #000)",
              }}
            >
              {props.title}
            </h2>
            <div style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--color-ink-muted, #3c3c43)" }}>
              {props.children}
            </div>
          </div>

          {/* Button row */}
          <div
            style={{
              display: "flex",
              marginTop: "12px",
              borderTop: "1px solid var(--color-border, rgba(60,60,67,0.16))",
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
                fontSize: "17px",
                fontWeight: 600,
                color: "var(--color-accent, #007aff)",
                cursor: "pointer",
                fontFamily: "inherit",
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
