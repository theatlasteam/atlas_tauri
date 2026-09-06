import { createSignal, onCleanup, onMount, Show } from "solid-js";
import EmberShader from "./EmberShader";

// 30 fps cap is plenty for a slow ambient effect and halves GPU load; the
// loop also pauses entirely when the hero scrolls out of view or the tab is
// hidden — before this it rendered every rAF tick no matter what.
const FRAME_MS = 1000 / 30;

export default function HeroGlass() {
  const [supported, setSupported] = createSignal<boolean | null>(null);
  let canvas: HTMLCanvasElement | undefined;

  onMount(async () => {
    if (typeof navigator === "undefined" || !("gpu" in navigator) || !canvas) {
      setSupported(false);
      return;
    }
    try {
      const { init, surface, effect, frame, uniforms } = await import("vgpu");
      const source = (await import("./hero-glass.wgsl")).default;
      const gpu = await init({ powerPreference: "high-performance" });
      // Soft glow aesthetic survives aggressive downscaling: render at
      // 50-80% of CSS pixels and let the canvas upscale.
      const canvasSurface = surface(gpu, canvas, { dpr: [0.5, 0.8] });
      const globals = uniforms(gpu, { time: 0, res: [1, 1], mouse: [0.5, 0.5] });
      const comets = effect(gpu, source, { set: { globals } });

      const start = performance.now();
      const onPointer = (event: PointerEvent) => {
        globals.set({ mouse: [event.clientX / innerWidth, event.clientY / innerHeight] });
      };
      window.addEventListener("pointermove", onPointer, { passive: true });

      let raf = 0;
      let last = 0;
      let tabVisible = document.visibilityState === "visible";
      let onScreen = true;

      const observer = new IntersectionObserver((entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
      });
      observer.observe(canvas);
      const onVisibility = () => {
        tabVisible = document.visibilityState === "visible";
      };
      document.addEventListener("visibilitychange", onVisibility);

      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (!tabVisible || !onScreen || !canvas) return;
        if (now - last < FRAME_MS) return;
        last = now;
        globals.set({
          time: (now - start) / 1000,
          res: [canvas.width, canvas.height],
        });
        frame(gpu, (current) => current.pass({ target: canvasSurface }, (pass) => pass.draw(comets)));
      };
      raf = requestAnimationFrame(tick);
      setSupported(true);

      onCleanup(() => {
        cancelAnimationFrame(raf);
        observer.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointer);
      });
    } catch {
      // No WebGPU / device lost / shader issue — the WebGL fallback carries on.
      setSupported(false);
    }
  });

  return (
    <Show when={supported() !== false} fallback={<EmberShader />}>
      <canvas ref={canvas} class="absolute inset-0 h-full w-full" aria-hidden="true" />
    </Show>
  );
}
