// Light silk hero — a few slow warm bands of light drifting over dark ink.
// Cheap by design: two small fbm evaluations per pixel, no loops over
// objects, no raymarching. Looks premium, runs anywhere.
struct Globals {
  time: f32,
  res: vec2f,
  mouse: vec2f,
}
@group(0) @binding(0) var<uniform> globals: Globals;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash(i);
  let b = hash(i + vec2f(1.0, 0.0));
  let c = hash(i + vec2f(0.0, 1.0));
  let d = hash(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

fn fbm3(p0: vec2f) -> f32 {
  var p = p0;
  var v = 0.0;
  var a = 0.55;
  for (var i = 0; i < 3; i = i + 1) {
    v = v + a * noise(p);
    p = p * 2.03 + vec2f(11.3, 7.9);
    a = a * 0.5;
  }
  return v;
}

@fragment fn fs_main(@location(0) uv01: vec2f) -> @location(0) vec4f {
  let aspect = globals.res.x / max(globals.res.y, 1.0);
  let uv = (uv01 - 0.5) * vec2f(aspect, 1.0) * 2.0;
  let t = globals.time * 0.045;

  // One gentle warp, then the band field — that's the whole trick.
  let warp = fbm3(uv * 1.1 + vec2f(t, -t * 0.7)) * 0.9;
  let bands = fbm3(vec2f(uv.x * 0.7 + t * 0.6, uv.y * 1.6) + warp);

  let ink = vec3f(0.041, 0.035, 0.032);
  let umber = vec3f(0.26, 0.13, 0.05);
  let amber = vec3f(0.79, 0.40, 0.12);
  let cream = vec3f(0.99, 0.80, 0.50);

  var color = ink;
  color = mix(color, umber, smoothstep(0.30, 0.55, bands));
  color = mix(color, amber, smoothstep(0.50, 0.75, bands));
  color = mix(color, cream, smoothstep(0.72, 0.95, bands) * 0.7);

  // Faint warm glow trailing the cursor — present, not a spotlight.
  let m = (globals.mouse - 0.5) * vec2f(aspect, 1.0) * vec2f(1.0, -1.0);
  color += amber * exp(-2.8 * length(uv - m)) * 0.07;

  // Calmer in the center where the headline sits, richer at the edges.
  let center = smoothstep(0.1, 1.05, length(uv * vec2f(0.85, 1.15)));
  color = mix(ink + (color - ink) * 0.6, color, center);

  color += (hash(uv01 * globals.res + fract(globals.time)) - 0.5) * 0.02;
  let vignette = smoothstep(1.5, 0.4, length(uv * vec2f(0.95, 1.05)));
  color = color * mix(0.65, 1.0, vignette);

  return vec4f(color, 1.0);
}
