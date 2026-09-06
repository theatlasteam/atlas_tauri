import { Show } from "solid-js";
import glm from "../assets/models/glm.svg";
import kimi from "../assets/models/kimi.svg";
import deepseek from "../assets/models/deepseek.svg";
import qwen from "../assets/models/qwen.svg";

/** Monochrome LobeHub logos, picked from the model id (qwen → Qwen, glm → Zhipu/GLM, …). */
const LOGOS: { test: RegExp; src: string }[] = [
  { test: /qwen/i, src: qwen },
  { test: /kimi/i, src: kimi },
  { test: /deepseek/i, src: deepseek },
  { test: /glm|zhipu|chatglm/i, src: glm },
];

export default function ModelLogo(props: { name: string; size?: number; class?: string }) {
  const src = () => LOGOS.find((l) => l.test.test(props.name))?.src;
  const size = () => props.size ?? 16;
  return (
    <Show when={src()}>
      {(url) => (
        <span
          role="img"
          aria-hidden
          class={`inline-block shrink-0 bg-current${props.class ? ` ${props.class}` : ""}`}
          style={{
            width: `${size()}px`,
            height: `${size()}px`,
            "mask-image": `url(${url()})`,
            "mask-size": "contain",
            "mask-repeat": "no-repeat",
            "mask-position": "center",
            "-webkit-mask-image": `url(${url()})`,
            "-webkit-mask-size": "contain",
            "-webkit-mask-repeat": "no-repeat",
            "-webkit-mask-position": "center",
          }}
        />
      )}
    </Show>
  );
}
