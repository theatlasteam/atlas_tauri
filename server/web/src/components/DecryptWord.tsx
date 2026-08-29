import { onCleanup, onMount } from "solid-js";

const CIPHER = "abcdefghijklmnopqrstuvwxyz0123456789";
const RADIUS = 58;
const FADE = 28;

export default function DecryptWord(props: { text: string }) {
  let canvas: HTMLCanvasElement | undefined;

  onMount(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.ceil(rect.width));
    const h = Math.max(1, Math.ceil(rect.height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.font = getComputedStyle(canvas).font;
    ctx.textBaseline = "alphabetic";

    let x = -9999;
    let y = -9999;
    let active = false;
    const glyphs = [...props.text].map((_, i) => CIPHER[(i * 17 + 9) % CIPHER.length]);

    function draw() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#c9772e";
      ctx.fillText(props.text, 0, h * 0.78);
      if (!active) return;
      for (let i = 0; i < props.text.length; i++) {
        if (props.text[i] === " ") continue;
        const before = ctx.measureText(props.text.slice(0, i)).width;
        const width = ctx.measureText(props.text[i]).width;
        const cx = before + width / 2;
        const cy = h * 0.52;
        const d = Math.hypot(cx - x, cy - y);
        if (d > RADIUS + FADE) continue;
        const strength = d <= RADIUS ? 1 : Math.pow(1 - (d - RADIUS) / FADE, 1.5);
        if (((i * 31 + 7) % 100) / 100 > strength) continue;
        // Erase the plain letter first (same punch-out as the hero field),
        // otherwise the cipher glyph overlaps it into an unreadable blob.
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillRect(before, 0, width, h);
        ctx.restore();
        ctx.fillStyle = "#f5c98a";
        ctx.fillText(glyphs[i], before, h * 0.78);
      }
    }

    function move(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      x = e.clientX - r.left;
      y = e.clientY - r.top;
      active = x >= 0 && x <= r.width && y >= 0 && y <= r.height;
      draw();
    }
    function leave() { active = false; draw(); }
    canvas.addEventListener("pointermove", move, { passive: true });
    canvas.addEventListener("pointerleave", leave, { passive: true });
    draw();
    onCleanup(() => {
      canvas?.removeEventListener("pointermove", move);
      canvas?.removeEventListener("pointerleave", leave);
    });
  });

  return (
    <span class="relative inline-block align-baseline text-accent">
      <span class="invisible whitespace-nowrap">{props.text}</span>
      <canvas
        ref={canvas}
        class="absolute inset-0 h-full w-full"
        style={{ font: "inherit", color: "inherit", "pointer-events": "auto" }}
        aria-label={props.text}
      />
    </span>
  );
}
