import { useShaderCanvas } from "../lib/useShaderCanvas";

// A calm, atmospheric horizon scene: near-black ground falling away from a
// single soft band of warm light sitting low in the frame, wrapped in a slow
// drifting haze. Deliberately restrained — the glow carries the whole mood,
// the noise only breathes. The pointer gently leans the light, like shifting
// your head, never a spotlight.
const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.03;

  // The horizon sits low, slightly off-center; the cursor leans it a touch.
  vec2 sunPos = vec2(
    -0.15 + (u_mouse.x - 0.5) * 0.18,
    -0.32 + (u_mouse.y - 0.5) * 0.10
  );

  vec2 d = uv - sunPos;
  float dist = length(d * vec2(1.0, 1.9)); // vertically squashed -> wide glow

  // Core glow: tight bright heart falling off into a broad warm halo.
  float core = exp(-5.5 * dist);
  float halo = exp(-1.8 * dist);

  // Slow haze drifting across the light — keeps it alive without busyness.
  float haze = fbm(uv * 1.6 + vec2(t, -t * 0.7));
  float haze2 = fbm(uv * 3.4 - vec2(t * 0.6, t * 0.4));
  float breathe = 0.9 + 0.1 * sin(u_time * 0.35);

  // Palette: deep umber ground, amber light, cream heart.
  vec3 deep  = vec3(0.055, 0.048, 0.042);
  vec3 amber = vec3(0.60, 0.34, 0.13);
  vec3 cream = vec3(0.98, 0.80, 0.58);

  float glow = (core * 1.1 + halo * 0.55) * breathe;
  glow *= 0.85 + 0.3 * haze;

  vec3 color = deep;
  color = mix(color, amber, clamp(halo * (0.55 + 0.35 * haze), 0.0, 1.0));
  color = mix(color, cream, clamp(core * (0.8 + 0.3 * haze2), 0.0, 1.0));

  // Faint ambient lift everywhere so the black never reads as a hole.
  color += deep * 0.6 * haze2;

  // Grain + gentle vignette to settle the edges.
  float grain = (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.03;
  color += grain;
  float vignette = smoothstep(1.25, 0.35, length(uv * vec2(0.9, 1.05)));
  color *= mix(0.6, 1.0, vignette);

  fragColor = vec4(color, 1.0);
}
`;

export default function HeroShader() {
  let canvas: HTMLCanvasElement | undefined;
  useShaderCanvas(() => canvas, FRAGMENT_SRC);
  return <canvas ref={canvas} class="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
