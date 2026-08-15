import { Show, createSignal, onMount, type JSX } from "solid-js";

// Atlas plugin — forces dialogs to use a centered modal presentation on every
// viewport, including mobile.
//
// IMPORTANT (kebab-case): plugins are fetched at runtime, so Tailwind classes
// are NOT compiled into the app's CSS — use inline styles + the app's CSS
// variables. Style objects must use kebab-case keys ("border-radius",
// "align-items"): the Solid transform bakes static style objects into DOM
// strings verbatim, and the browser's CSS parser ignores camelCase keys.
//
// Also, animation state must be a signal: Solid bakes `opacity: entered ? 1 : 0`
// into the style at render time, so a plain `let` flipped in a rAF would leave
// the dialog permanently invisible.

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
  const [entered, setEntered] = createSignal(false);
  onMount(() => requestAnimationFrame(() => setEntered(true)));

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
          padding: "16px",
        }}
      >
        {/* Backdrop */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            background: "rgba(0,0,0,0.4)",
            "backdrop-filter": "blur(2px)",
            opacity: entered() ? 1 : 0,
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
            "z-index": 10,
            width: "100%",
            "max-width": "24rem",
            overflow: "hidden",
            background: "var(--color-surface-raised, #fff)",
            border: "1px solid var(--color-border, rgba(0,0,0,0.1))",
            "border-radius": "24px",
            "box-shadow": "0 8px 30px -6px rgba(0,0,0,0.35)",
            padding: "20px",
            opacity: entered() ? 1 : 0,
            transform: entered() ? "scale(1) translateY(0)" : "scale(0.95) translateY(8px)",
            transition: "opacity 200ms ease-out, transform 200ms ease-out",
          }}
        >
          <h2
            style={{
              margin: "0 0 16px",
              "font-size": "1.125rem",
              "font-weight": 600,
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
