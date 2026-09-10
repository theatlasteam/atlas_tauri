import { Show } from "solid-js";
import { preferences } from "../store/preferences";
import moonshotDark from "../assets/models/dark/moonshot.png";
import moonshotLight from "../assets/models/light/moonshot.png";
import glmDark from "../assets/models/dark/glm.png";
import glmLight from "../assets/models/light/glm.png";
import qwenDark from "../assets/models/dark/qwen.png";
import qwenLight from "../assets/models/light/qwen.png";
import deepseekDark from "../assets/models/dark/deepseek.png";
import deepseekLight from "../assets/models/light/deepseek.png";

type Pack = { dark: string; light: string };

/** LobeHub static PNGs (dark/light). Matched from the model id. */
const LOGOS: { test: RegExp; pack: Pack }[] = [
  { test: /qwen/i, pack: { dark: qwenDark, light: qwenLight } },
  { test: /kimi|moonshot/i, pack: { dark: moonshotDark, light: moonshotLight } },
  { test: /deepseek/i, pack: { dark: deepseekDark, light: deepseekLight } },
  { test: /glm|zhipu|zai|chatglm/i, pack: { dark: glmDark, light: glmLight } },
];

function isDarkTheme() {
  const mode = preferences.theme;
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ModelLogo(props: { name: string; size?: number; class?: string }) {
  const pack = () => LOGOS.find((l) => l.test.test(props.name))?.pack;
  const src = () => {
    const p = pack();
    if (!p) return undefined;
    return isDarkTheme() ? p.dark : p.light;
  };
  const size = () => props.size ?? 16;

  return (
    <Show when={src()}>
      {(url) => (
        <img
          src={url()}
          alt=""
          width={size()}
          height={size()}
          class={`inline-block shrink-0 object-contain${props.class ? ` ${props.class}` : ""}`}
          style={{ width: `${size()}px`, height: `${size()}px` }}
        />
      )}
    </Show>
  );
}
