import { MaterialNavBar } from "./MaterialNavBar";
import { MaterialRail } from "./MaterialRail";
import { MaterialNavSettings } from "./Settings";

// Atlas plugin — replaces Atlas's floating/rail navigation with Material 3
// bars that stay docked: a full-width bottom bar on mobile (nav.bottom) and
// a compact rail on desktop (nav.side). Both are plain, non-floating.
export function activate(ctx) {
  ctx.log("Material Nav active");

  const showPill = () => {
    const v = ctx.storage.get("showPill");
    return v === null ? true : v === "1";
  };

  ctx.ui.mount("nav.bottom", (props) => (
    <MaterialNavBar navigate={props.navigate} pathname={props.pathname} showPill={showPill()} />
  ));
  ctx.ui.mount("nav.side", (props) => (
    <MaterialRail navigate={props.navigate} pathname={props.pathname} showPill={showPill()} />
  ));

  // Configuration screen, opened from the sliders button on this plugin's
  // row in the app's Plugins screen.
  ctx.ui.configScreen(({ plugin, onClose }) => (
    <MaterialNavSettings plugin={plugin} onClose={onClose} ctx={ctx} />
  ));
}
