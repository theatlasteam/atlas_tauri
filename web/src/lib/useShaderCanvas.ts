import { onCleanup, onMount } from "solid-js";

const VERTEX_SRC = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

/**
 * Mounts a fullscreen-triangle WebGL2 fragment shader onto a canvas ref.
 * Handles resize, animation loop (paused for prefers-reduced-motion), and
 * cleanup. Exposes u_resolution/u_time/u_mouse uniforms to every shader —
 * u_mouse is normalized [0,1] canvas-space, smoothed toward the pointer.
 */
export function mountShader(canvas: HTMLCanvasElement, fragmentSrc: string) {
  const ctx = canvas.getContext("webgl2", { antialias: false });
  if (!ctx) return;
  const gl = ctx;

  const program = gl.createProgram()!;
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);

  const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const positionLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const resolutionLoc = gl.getUniformLocation(program, "u_resolution");
  const timeLoc = gl.getUniformLocation(program, "u_time");
  const mouseLoc = gl.getUniformLocation(program, "u_mouse");

  let rafId = 0;
  const start = performance.now();
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Parked far outside [0,1] until the pointer actually moves over this
  // canvas — otherwise every shader's cursor-glow term defaults to dead
  // center and sits there as a stray bright blob until the mouse happens
  // to cross this exact canvas.
  let targetMouse = [-10, -10];
  let mouse = [-10, -10];
  const onPointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    targetMouse = [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height];
  };
  canvas.ownerDocument.addEventListener("pointermove", onPointerMove);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function frame(now: number) {
    resize();
    mouse[0] += (targetMouse[0] - mouse[0]) * 0.06;
    mouse[1] += (targetMouse[1] - mouse[1]) * 0.06;
    gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(timeLoc, reduceMotion ? 0 : (now - start) / 1000);
    if (mouseLoc) gl.uniform2f(mouseLoc, mouse[0], mouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return () => {
    cancelAnimationFrame(rafId);
    observer.disconnect();
    canvas.ownerDocument.removeEventListener("pointermove", onPointerMove);
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
  };
}

/** Solid lifecycle wrapper: mount a shader on a canvas ref, clean up automatically. */
export function useShaderCanvas(getCanvas: () => HTMLCanvasElement | undefined, fragmentSrc: string) {
  onMount(() => {
    const canvas = getCanvas();
    if (!canvas) return;
    const dispose = mountShader(canvas, fragmentSrc);
    if (dispose) onCleanup(dispose);
  });
}
