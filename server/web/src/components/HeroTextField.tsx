import { onCleanup, onMount } from "solid-js";

const PHRASES = [
  "привет", "как дела", "увидимся завтра", "не забудь про встречу",
  "hello", "see you soon", "отправила файлы", "созвон вечером?",
  "good morning", "спокойной ночи", "посмотри мем", "call me later",
  "это только между нами", "remember the keys", "зашифровано", "end to end",
];
const CIPHER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const FONT_SIZE = 17;
const LINE_HEIGHT = 25;
const RADIUS = 135;
const FADE = 95;

function hash01(x: number, y: number, salt: number) {
  let n = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791);
  n = Math.abs(n);
  return (n % 100000) / 100000;
}

/** Static 2D text field with a stable ASCII encryption lens. */
export default function HeroTextField() {
  let canvas: HTMLCanvasElement | undefined;

  onMount(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let cellW = FONT_SIZE * 0.6;
    let rows: string[] = [];
    const mouse = { x: -9999, y: -9999, active: false };

    function rebuild() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${FONT_SIZE}px "Geist Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";
      cellW = ctx.measureText("0").width;
      rows = [];
      const count = Math.ceil(h / LINE_HEIGHT) + 1;
      const length = Math.ceil(w / cellW) + 2;
      for (let y = 0; y < count; y++) {
        let row = "";
        let i = y * 5;
        while (row.length < length) {
          row += PHRASES[i % PHRASES.length] + " ";
          i++;
        }
        rows.push(row.slice(0, length));
      }
      draw();
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${FONT_SIZE}px "Geist Mono", ui-monospace, monospace`;
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(242, 222, 190, 0.14)";

      // Plain text is drawn once per cell. The displacement is only a subtle
      // depression in the ring around the cipher area, not a full vortex.
      for (let cy = 0; cy < rows.length; cy++) {
        const row = rows[cy];
        for (let cx = 0; cx < row.length; cx++) {
          const ch = row[cx];
          if (!ch) continue;
          const x = cx * cellW;
          const y = cy * LINE_HEIGHT;
          let dx = 0;
          let dy = 0;
          if (mouse.active) {
            const px = x + cellW / 2;
            const py = y + LINE_HEIGHT / 2;
            const distance = Math.hypot(px - mouse.x, py - mouse.y);
            const ring = Math.max(0, 1 - Math.abs(distance - RADIUS) / FADE);
            dy = ring * 5;
            dx = ((px - mouse.x) / Math.max(distance, 1)) * ring * 2;
          }
          ctx.fillText(ch, x + dx, y + dy);
        }
      }

      if (!mouse.active) return;
      ctx.fillStyle = "rgba(245, 201, 138, 0.92)";
      for (let cy = 0; cy < rows.length; cy++) {
        const row = rows[cy];
        for (let cx = 0; cx < row.length; cx++) {
          const ch = row[cx];
          if (!ch || ch === " ") continue;
          const x = cx * cellW + cellW / 2;
          const y = cy * LINE_HEIGHT + LINE_HEIGHT / 2;
          const distance = Math.hypot(x - mouse.x, y - mouse.y);
          if (distance > RADIUS + FADE) continue;
          const strength = distance <= RADIUS ? 1 : Math.pow(1 - (distance - RADIUS) / FADE, 1.6);
          if (hash01(cx, cy, 1) > strength) continue;
          ctx.fillStyle = "rgba(14, 12, 10, 0.96)";
          ctx.fillRect(cx * cellW, cy * LINE_HEIGHT, cellW + 1, LINE_HEIGHT);
          ctx.fillStyle = "rgba(245, 201, 138, 0.92)";
          const glyph = CIPHER[Math.floor(hash01(cx, cy, 2) * CIPHER.length)];
          ctx.fillText(glyph, cx * cellW, cy * LINE_HEIGHT);
        }
      }
    }

    function move(e: PointerEvent) {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.active = mouse.y >= 0 && mouse.y <= r.height;
      draw();
    }
    function leave() {
      mouse.active = false;
      draw();
    }

    rebuild();
    window.addEventListener("resize", rebuild);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerleave", leave);
    onCleanup(() => {
      window.removeEventListener("resize", rebuild);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    });
  });

  return <canvas ref={canvas} class="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
