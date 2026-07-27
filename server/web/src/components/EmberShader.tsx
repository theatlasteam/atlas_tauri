import { useShaderCanvas } from "../lib/useShaderCanvas";

// Slow embers drifting upward through a dark field, each with its own size,
// speed and gentle sideways sway — calm and atmospheric rather than busy,
// a quiet contrast to the hero's flowing light. The cursor nudges nearby
// embers aside instead of glowing at them directly.
const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

out vec4 fragColor;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

// One layer of drifting embers at a given cell density. Returns additive glow.
float emberLayer(vec2 uv, float cellSize, float speed, float t, vec2 mouseUv) {
  vec2 grid = uv / cellSize;
  vec2 cellId = floor(grid);
  float glow = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = cellId + vec2(float(x), float(y));
      vec2 rnd = hash2(neighbor);

      // Base position within the cell, drifting up and gently swaying.
      float rise = fract(t * speed + rnd.y);
      vec2 pos = neighbor + vec2(0.5 + 0.35 * sin(t * 0.6 + rnd.x * 6.2831), 1.0 - rise);
      pos *= cellSize;

      vec2 toEmber = uv - pos;
      // Cursor gently pushes nearby embers away.
      float mouseDist = length(uv - mouseUv);
      toEmber += normalize(toEmber + 0.0001) * smoothstep(0.35, 0.0, mouseDist) * 0.06;

      float size = mix(0.006, 0.016, rnd.x) * smoothstep(0.0, 0.15, rise) * smoothstep(1.0, 0.75, rise);
      float d = length(toEmber);
      glow += size / (d * d + size * 0.5) * 0.02;
    }
  }
  return glow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 uv01 = uv + 0.5;
  vec2 mouseUv = u_mouse * vec2(u_resolution.x / u_resolution.y, 1.0);

  vec3 inkBg = vec3(0.051, 0.043, 0.039);
  vec3 emberHot = vec3(0.992, 0.588, 0.208);
  vec3 emberCool = vec3(0.788, 0.318, 0.098);

  float g1 = emberLayer(uv01, 0.22, 0.05, u_time, mouseUv);
  float g2 = emberLayer(uv01 * 1.7 + 3.1, 0.16, 0.035, u_time * 0.8, mouseUv * 1.7);

  vec3 color = inkBg;
  color += mix(emberCool, emberHot, 0.5) * g1;
  color += emberCool * g2 * 0.7;

  // Darker toward the center, where the readable text/code block sits —
  // the texture should recede behind content, not compete with it.
  float centerDark = smoothstep(0.0, 0.9, length(uv));
  color *= mix(0.4, 1.0, centerDark);

  float vignette = smoothstep(1.3, 0.15, length(uv * vec2(1.0, 1.15)));
  color *= mix(0.45, 1.0, vignette);

  fragColor = vec4(color, 1.0);
}
`;

export default function EmberShader() {
  let canvas: HTMLCanvasElement | undefined;
  useShaderCanvas(() => canvas, FRAGMENT_SRC);
  return <canvas ref={canvas} class="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
