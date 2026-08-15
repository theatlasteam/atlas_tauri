import { IosSwitch } from "./IosSwitch";
import { IosDialog } from "./IosDialog";
import { IosTabBar } from "./IosTabBar";
import { IosRail } from "./IosRail";
import { IosifySettings } from "./Settings";
import themeCss from "./theme.css?raw";

// Atlas plugin — restyles the whole app to look like iOS: system colors,
// liquid-glass gradient wallpaper, squircle avatars/cards, SF-style type,
// grouped lists without descriptions, and iOS-native switch/dialog/nav.
//
// Unlike the other example plugins, this one also injects a global <style>
// sheet (theme.css) so it can restyle parts of the app it doesn't own via CSS
// custom properties and a few targeted rules.

export function activate(ctx) {
  ctx.log("iOSify active");

  const read = (key: string, def = true) => {
    const v = ctx.storage.get(key);
    return v === null ? def : v === "1";
  };

  // Inject the theme stylesheet. Split the rules into blocks so the config
  // toggles can strip specific sections without re-injecting the whole file.
  const STYLE_ID = "atlas-iosify-theme";
  let styleEl: HTMLStyleElement | null = null;

  const inject = () => {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    const parts: string[] = [];
    if (read("colors")) parts.push("COLORS");
    if (read("gradient")) parts.push("GRADIENT");
    if (read("squircles")) parts.push("SQUIRCLES");
    if (read("nofont")) parts.push("FONT");
    if (read("nodesc")) parts.push("NODESC");
    styleEl.textContent = buildCss(parts);
  };

  // Wait for Solid to render the app root before mounting UI slots, so the
  // app's own shells (BottomNav/SideNav/Dialog/Switch) pick up our slots.
  const applyTheme = () => {
    inject();
    if (read("iosui")) {
      ctx.ui.mount("switch", (props) => (
        <IosSwitch checked={props.checked} onChange={props.onChange} label={props.label} />
      ));
      ctx.ui.mount("dialog", (props) => (
        <IosDialog title={props.title} open={props.open} onOpenChange={props.onOpenChange}>
          {props.children}
        </IosDialog>
      ));
      ctx.ui.mount("nav.bottom", (props) => (
        <IosTabBar navigate={props.navigate} pathname={props.pathname} />
      ));
      ctx.ui.mount("nav.side", (props) => (
        <IosRail navigate={props.navigate} pathname={props.pathname} />
      ));
    }
  };

  applyTheme();

  ctx.ui.configScreen(({ plugin, onClose }) => (
    <IosifySettings plugin={plugin} onClose={onClose} ctx={ctx} />
  ));
}

function buildCss(parts: string[]): string {
  const all = (key: string) => parts.includes(key);

  const css: string[] = [];

  if (all("COLORS")) {
    css.push(`
:root {
  --color-accent: #007aff;
  --color-accent-soft: #e3f0ff;
  --color-accent-ink: #ffffff;
  --color-bg: #f2f2f7;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-border: rgba(60, 60, 67, 0.16);
  --color-appbar: rgba(249, 249, 249, 0.86);
  --color-ink: #000000;
  --color-ink-muted: #3c3c43;
  --color-ink-subtle: #6c6c70;
  --color-danger: #ff3b30;
  --color-bubble-sent: #007aff;
  --color-bubble-sent-ink: #ffffff;
  --color-bubble-received: #e9e9eb;
  --color-bubble-received-ink: #000000;
}
:root[data-theme="dark"] {
  --color-accent: #0a84ff;
  --color-accent-soft: #12345c;
  --color-accent-ink: #ffffff;
  --color-bg: #000000;
  --color-surface: #1c1c1e;
  --color-surface-raised: #2c2c2e;
  --color-border: rgba(84, 84, 88, 0.5);
  --color-appbar: rgba(22, 22, 24, 0.82);
  --color-ink: #ffffff;
  --color-ink-muted: #98989f;
  --color-ink-subtle: #636366;
  --color-danger: #ff453a;
  --color-bubble-sent: #0a84ff;
  --color-bubble-received: #262628;
  --color-bubble-received-ink: #ffffff;
}
`);
  }

  if (all("GRADIENT")) {
    css.push(`
body, #root { background: transparent !important; }
#root { position: relative; }
#root::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(120% 90% at 15% 0%, rgba(0, 122, 255, 0.35) 0%, transparent 55%),
    radial-gradient(120% 90% at 100% 10%, rgba(175, 82, 222, 0.22) 0%, transparent 60%),
    radial-gradient(140% 120% at 50% 110%, rgba(0, 199, 190, 0.28) 0%, transparent 60%),
    var(--color-bg);
  pointer-events: none;
}
:root[data-theme="dark"] #root::before {
  background:
    radial-gradient(120% 90% at 15% 0%, rgba(10, 132, 255, 0.45) 0%, transparent 55%),
    radial-gradient(120% 90% at 100% 10%, rgba(191, 90, 242, 0.3) 0%, transparent 60%),
    radial-gradient(140% 120% at 50% 110%, rgba(64, 200, 224, 0.25) 0%, transparent 60%),
    var(--color-bg);
}
`);
  }

  if (all("SQUIRCLES")) {
    css.push(`
img.rounded-full,
div[style*="background-color"][class*="rounded-full"] {
  border-radius: 28% / 28% !important;
}
.h-3.w-3, .h-1\\.5.w-1\\.5, .h-5.min-w-5 {
  border-radius: 9999px !important;
}
.rounded-2xl { border-radius: 12px !important; }
.rounded-3xl { border-radius: 16px !important; }
`);
  }

  if (all("FONT")) {
    css.push(`
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  --font-heading: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  --font-size-base: 17px;
}
`);
  }

  if (all("NODESC")) {
    css.push(`
.divide-y p.text-ink-subtle { display: none; }
`);
  }

  return css.join("\n");
}
