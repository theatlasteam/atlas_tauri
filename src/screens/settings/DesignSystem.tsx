import { onCleanup } from "solid-js";
import { useNavigate } from "@solidjs/router";
import Catalogue from "../../../server/web/src/screens/DesignSystem";
import Appbar from "../../components/Appbar";

/** The real shared catalogue, not a second set of copied demo components. */
export default function DesignSystem() {
  const navigate = useNavigate();
  const root = document.documentElement;
  const theme = root.getAttribute("data-theme");
  const accent = root.getAttribute("data-accent");
  onCleanup(() => {
    for (const [key, value] of [["data-theme", theme], ["data-accent", accent]]) {
      if (value === null) root.removeAttribute(key!); else root.setAttribute(key!, value!);
    }
  });
  return <div class="h-full overflow-y-auto pb-24">
    <Appbar title="Atlas UI" back="/settings/dev" sticky />
    <Catalogue onOpenApp={() => navigate("/")} />
  </div>;
}
