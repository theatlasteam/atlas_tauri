import { useShaderCanvas } from "../lib/useShaderCanvas";

// A slow, warm mesh of drifting light — three soft blobs of accent color
// folded together with layered noise, plus a fine grain so it reads as
// material rather than a flat CSS gradient. The pointer nudges the warp
// field, so the surface subtly answers the cursor without ever feeling
// like a literal spotlight.
const FRAGMENT_SRC = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;

out vec4 fragColor;

vec3 palette(float t) {
  vec3 deep = vec3(0.075, 0.067, 0.059);
  vec3 amber = vec3(0.788, 0.467, 0.180);
  vec3 ember = vec3(0.992, 0.318, 0.078);
  vec3 cream = vec3(0.992, 0.827, 0.616);
  vec3 c = mix(deep, amber, smoothstep(0.0, 0.55, t));
  c = mix(c, ember, smoothstep(0.35, 0.75, t));
  c = mix(c, cream, smoothstep(0.72, 1.0, t));
  return c;
}

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
  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 mouseUv = (u_mouse * u_resolution - 0.5 * u_resolution) / u_resolution.y;
  float t = u_time * 0.045;

  vec2 warp = vec2(fbm(uv * 1.4 + t), fbm(uv * 1.4 - t + 4.2));
  float field = fbm(uv * 1.9 + warp * 1.3 + t * 0.6);

  float blobs = 0.0;
  blobs += 0.85 * exp(-6.0 * length(uv - vec2(-0.55 + 0.12 * sin(t * 1.3), -0.35 + 0.10 * cos(t)) + warp * 0.25));
  blobs += 0.75 * exp(-5.0 * length(uv - vec2(0.4 + 0.10 * cos(t * 0.9), 0.15 + 0.14 * sin(t * 1.1)) + warp * 0.2));
  blobs += 0.6 * exp(-7.0 * length(uv - vec2(0.05 * sin(t * 0.5), -0.55 + 0.08 * cos(t * 1.4)) + warp * 0.3));

  // Cursor glow: a soft, low-amplitude lift near the pointer, folded into
  // the same field rather than drawn as a separate circle.
  float cursor = 0.35 * exp(-3.5 * length(uv - mouseUv));
  blobs += cursor;

  float shade = clamp(field * 0.55 + blobs * 0.6, 0.0, 1.0);
  vec3 color = palette(shade);

  float grain = (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.035;
  color += grain;

  float vignette = smoothstep(1.15, 0.25, length(uv * vec2(1.0, 1.15)));
  color *= mix(0.55, 1.0, vignette);

  fragColor = vec4(color, 1.0);
}
`;

export default function HeroShader() {
  let canvas: HTMLCanvasElement | undefined;
  useShaderCanvas(() => canvas, FRAGMENT_SRC);
  return <canvas ref={canvas} class="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
