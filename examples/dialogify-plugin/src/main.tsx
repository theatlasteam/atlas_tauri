import { Show, onMount, type JSX } from "solid-js";

// Atlas plugin — forces dialogs to use a centered modal presentation on every
// viewport, including mobile.
//
// IMPORTANT: plugins are fetched at runtime, so Tailwind classes (rounded-3xl,
// opacity-0, duration-200, ...) are NOT compiled into the app's CSS. Use
// inline styles + the app's CSS variables instead. Solid still animates via
// `onMount` toggling inline transition properties.

export function activate(ctx) {
  ctx.log("Dialogify active");

  ctx.ui.mount("dialog", (props) => (
    <Dialogify
      title={props.title}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      {props.children}
    </Dialogify>
  ));
}

function Dialogify(props: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
}) {
  // Enter animation: start hidden, then flip to visible on the next frame so
  // the inline `transition` animates opacity + transform.
  let entered = false;
  onMount(() => requestAnimationFrame(() => (entered = true)));

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
          padding: "16px",
        }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
            opacity: entered ? 1 : 0,
            transition: "opacity 200ms ease-out",
          }}
          onClick={() => props.onOpenChange(false)}
        />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            maxWidth: "24rem",
            overflow: "hidden",
            background: "var(--color-surface-raised, #fff)",
            border: "1px solid var(--color-border, rgba(0,0,0,0.1))",
            borderRadius: "24px",
            boxShadow: "0 8px 30px -6px rgba(0,0,0,0.35)",
            padding: "20px",
            opacity: entered ? 1 : 0,
            transform: entered ? "scale(1) translateY(0)" : "scale(0.95) translateY(8px)",
            transition: "opacity 200ms ease-out, transform 200ms ease-out",
          }}
        >
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "var(--color-ink)",
            }}
          >
            {props.title}
          </h2>
          {props.children}
        </div>
      </div>
    </Show>
  );
}
