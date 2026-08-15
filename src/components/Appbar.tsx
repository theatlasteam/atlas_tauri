import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { A } from "@solidjs/router";
import { BackIcon } from "../icons";
import { slotComponent } from "../plugins/ui-slots";

interface AppbarProps {
  /** Title next to the leading content. */
  title?: string;
  /** Left content (avatar, search, ...). Overrides the `back` button. */
  leading?: JSX.Element;
  /** Right content (actions, buttons, ...). */
  actions?: JSX.Element;
  /** When set, shows a back button that navigates to this path. */
  back?: string;
  /** Stick to the top of the scroll container. Also turns the bar into the
   *  "transparent until you scroll" appbar: it starts clear, then gains a
   *  background, a bottom border and a slimmer height once you scroll. */
  sticky?: boolean;
  /** Optional click handler on the title (SettingsHome's hidden dev entry). */
  onTitleClick?: () => void;
  class?: string;
}

/**
 * Shared app bar chrome: safe-area top padding, a background/border that
 * appears once you scroll (when `sticky`), and leading/title/actions slots.
 * Pass `back` for a back button, or `leading` to override it.
 */
export default function Appbar(props: AppbarProps) {
  const [scrolled, setScrolled] = createSignal(false);
  let headerRef: HTMLElement | undefined;

  const backButton = () =>
    props.back ? (
      <A
        href={props.back}
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
        aria-label="Back"
      >
        <BackIcon size={22} />
      </A>
    ) : undefined;

  onMount(() => {
    // Find the nearest scroll container to watch (walk up from the bar).
    let el = headerRef?.parentElement;
    let container: HTMLElement | null = null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === "auto" || oy === "scroll") {
        container = el;
        break;
      }
      el = el.parentElement;
    }
    if (!container) return;
    const onScroll = () => setScrolled(container!.scrollTop > 8);
    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    onCleanup(() => container!.removeEventListener("scroll", onScroll));
  });

  return (
    <header
      ref={headerRef}
      class={`flex shrink-0 items-center gap-3 border-b px-4 transition-[background-color,border-color,padding] duration-200 ease-out${
        props.sticky ? " sticky top-0 z-20" : ""
      }${props.class ? ` ${props.class}` : ""}`}
      style={{
        // Transparent until scrolled, then a solid appbar bg + border.
        background: scrolled() || !props.sticky ? "var(--color-appbar)" : "transparent",
        "border-color": scrolled() || !props.sticky ? "var(--color-border)" : "transparent",
        // Minimize the bar once scrolling starts.
        "padding-top": `max(var(--safe-top), ${props.sticky && !scrolled() ? "1.5rem" : "0.75rem"})`,
        "padding-bottom": props.sticky && !scrolled() ? "0.75rem" : "0.5rem",
      }}
    >
      <Show when={props.leading ?? backButton()}>{props.leading ?? backButton()}</Show>
      <Show when={props.title}>
        <h1
          class="select-none font-heading text-xl font-bold transition-[font-size] duration-200"
          style={{ "font-size": props.sticky && !scrolled() ? "1.25rem" : "1.05rem" }}
          onClick={props.onTitleClick}
        >
          {props.title}
        </h1>
      </Show>
      <Show when={props.actions}>
        <div class="ml-auto flex shrink-0 items-center gap-1">{props.actions}</div>
      </Show>
      <Show when={slotComponent("header.actions")}>
        <div class="ml-auto flex shrink-0 items-center gap-1">
          {slotComponent("header.actions")?.({})}
        </div>
      </Show>
    </header>
  );
}
