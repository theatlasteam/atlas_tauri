import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { api, getToken } from "../data/api";
import { session } from "../store/session";
import { serverConfig } from "../store/serverConfig";
import { isMobilePlatform } from "../lib/platform";
import { canvasShareUrl } from "../lib/canvasShare";
import { t } from "../lib/i18n";
import { CloseIcon, EditIcon, EraserIcon, TrashIcon } from "../icons";

type Peer = { id: string; name: string; color: string; handle?: string | null; guest?: boolean };
type Pt = { x: number; y: number };
type Stroke = { points: Pt[]; color: string; width: number; tool?: string; from?: string };

export default function CanvasBoard(props: { id: string; onClose?: () => void }) {
  const [peers, setPeers] = createSignal<Peer[]>([]);
  const [self, setSelf] = createSignal<Peer | null>(null);
  const [cursors, setCursors] = createSignal<Record<string, { x: number; y: number; name: string; color: string }>>({});
  const [tool, setTool] = createSignal<"pen" | "eraser">("pen");
  const [ink, setInk] = createSignal("#1a1a1a");
  const [width, setWidth] = createSignal(4);
  let canvas: HTMLCanvasElement | undefined;
  let wrap: HTMLDivElement | undefined;
  let ws: WebSocket | undefined;
  let strokes: Stroke[] = [];
  let current: Stroke | null = null;
  const desktop = !isMobilePlatform();

  const redraw = () => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const theme = getComputedStyle(document.documentElement);
    ctx.fillStyle = theme.getPropertyValue("--color-bg").trim() || "#131110";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = theme.getPropertyValue("--color-border").trim() || "rgba(255,255,255,.08)";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    const step = 32;
    ctx.beginPath();
    for (let x = 0; x <= w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const s of strokes) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = s.width;
      ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = s.color;
      ctx.moveTo(s.points[0]!.x * w, s.points[0]!.y * h);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i]!.x * w, s.points[i]!.y * h);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const pos = (e: PointerEvent): Pt | null => {
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const send = (obj: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  onMount(() => {
    void api.getCanvas(props.id).catch(() => {});
    const url = `${serverConfig.wsUrl()}/canvas/${props.id}`;
    ws = new WebSocket(url);
    ws.onopen = () => {
      send({ type: "join", token: getToken() ?? undefined, name: session.user()?.name });
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        type: string;
        self?: Peer;
        peers?: Peer[];
        strokes?: Stroke[];
        stroke?: Stroke;
        from?: string;
        name?: string;
        color?: string;
        x?: number;
        y?: number;
      };
      if (msg.type === "ready") {
        if (msg.self) setSelf(msg.self);
        if (msg.peers) setPeers(msg.peers);
        strokes = msg.strokes ?? [];
        redraw();
      } else if (msg.type === "presence" && msg.peers) {
        setPeers(msg.peers);
      } else if (msg.type === "stroke" && msg.stroke) {
        if (msg.stroke.from && msg.stroke.from === self()?.id) return;
        strokes.push(msg.stroke);
        redraw();
      } else if (msg.type === "clear") {
        strokes = [];
        redraw();
      } else if (msg.type === "cursor" && msg.from && msg.from !== self()?.id) {
        setCursors((c) => ({
          ...c,
          [msg.from!]: { x: msg.x ?? 0, y: msg.y ?? 0, name: msg.name ?? "", color: msg.color ?? "#888" },
        }));
      }
    };
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });
  onCleanup(() => ws?.close());

  const down = (e: PointerEvent) => {
    canvas?.setPointerCapture(e.pointerId);
    const p = pos(e);
    if (!p) return;
    current = {
      points: [p],
      color: tool() === "eraser" ? "#111111" : ink(),
      width: tool() === "eraser" ? Math.max(width() * 4, 16) : width(),
      tool: tool(),
    };
  };
  const move = (e: PointerEvent) => {
    const p = pos(e);
    if (!p) return;
    send({ type: "cursor", x: p.x, y: p.y });
    if (!current) return;
    current.points.push(p);
    strokes = [...strokes.filter((s) => s !== current), current];
    redraw();
  };
  const up = () => {
    if (!current || current.points.length < 2) {
      current = null;
      return;
    }
    send({ type: "stroke", stroke: current });
    current = null;
  };

  const swatches = ["#f4f0ea", "#111111", "#e24b4a", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];

  return (
    <div class="flex h-full min-h-0 flex-col bg-bg text-ink">
      <header class="flex shrink-0 items-center gap-2 border-b border-border bg-appbar px-3 py-2">
        <Show when={props.onClose}>
          <button type="button" class="atlas-focus grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink" onClick={props.onClose}>
            <CloseIcon size={20} />
          </button>
        </Show>
        <p class="font-heading text-sm font-semibold">{t("canvas.title")}</p>
        <div class="ml-3 flex min-w-0 flex-1 items-center pl-1">
          <For each={peers()}>
            {(p, i) => (
              <span
                class="relative grid h-8 w-8 place-items-center rounded-full border-2 border-bg text-[11px] font-bold text-white"
                style={{ background: p.color, "margin-left": i() === 0 ? "0" : "-8px", "z-index": String(20 - i()) }}
                title={p.name}
              >
                {(p.name[0] ?? "?").toUpperCase()}
              </span>
            )}
          </For>
        </div>
        <a
          href={canvasShareUrl(props.id)}
          target="_blank"
          rel="noreferrer"
          class="hidden h-11 items-center rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-surface hover:text-ink sm:flex"
        >
          {t("canvas.browser")}
        </a>
      </header>
      <div
        ref={wrap}
        class="relative min-h-0 flex-1 overflow-hidden"
        classList={{ "atlas-canvas-host": desktop }}
      >
        <canvas
          ref={canvas}
          class="h-full w-full touch-none"
          classList={{ "cursor-none": desktop }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <For each={Object.values(cursors())}>
          {(c) => (
            <div
              class="pointer-events-none absolute z-10"
              style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, transform: "translate(-2px, -2px)" }}
            >
              <CursorMark color={c.color} name={c.name} />
            </div>
          )}
        </For>
        <Show when={desktop && self()}>
          {(me) => (
            <LocalCursor color={me().color} name={me().name} host={() => wrap} />
          )}
        </Show>
        <div class="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-surface/95 p-1 shadow-floating backdrop-blur">
          <button
            type="button"
            class="atlas-focus grid h-11 w-11 place-items-center rounded-full"
            classList={{ "bg-accent text-accent-ink": tool() === "pen", "text-ink-muted hover:bg-bg": tool() !== "pen" }}
            onClick={() => setTool("pen")}
            title={t("canvas.pen")}
          >
            <EditIcon size={18} />
          </button>
          <button
            type="button"
            class="atlas-focus grid h-11 w-11 place-items-center rounded-full"
            classList={{ "bg-accent text-accent-ink": tool() === "eraser", "text-ink-muted hover:bg-bg": tool() !== "eraser" }}
            onClick={() => setTool("eraser")}
            title={t("canvas.eraser")}
          >
            <EraserIcon size={18} />
          </button>
          <span class="mx-1 h-6 w-px bg-border" />
          <For each={swatches}>
            {(c) => (
              <button
                type="button"
                class="atlas-focus h-7 w-7 rounded-full border border-black/20"
                classList={{ "ring-2 ring-accent ring-offset-2 ring-offset-surface": ink() === c }}
                style={{ background: c }}
                onClick={() => { setInk(c); setTool("pen"); }}
              />
            )}
          </For>
          <span class="mx-1 h-6 w-px bg-border" />
          <input
            type="range"
            min="2"
            max="16"
            value={width()}
            onInput={(e) => setWidth(Number(e.currentTarget.value))}
            class="w-20 accent-[var(--color-accent)]"
          />
          <button
            type="button"
            class="atlas-focus grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-bg hover:text-danger"
            onClick={() => send({ type: "clear" })}
            title={t("canvas.clear")}
          >
            <TrashIcon size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CursorMark(props: { color: string; name: string }) {
  return (
    <div class="flex items-start drop-shadow-[0_2px_8px_rgba(0,0,0,.28)]">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <path
          d="M4 2.8 L4 18.2 L8.2 14.4 L11.4 20.6 L14.4 19.2 L11.1 12.8 L18.2 12.8 Z"
          fill={props.color}
          stroke="#fff"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
      </svg>
      <span
        class="mt-[14px] ml-0.5 rounded-md px-1.5 py-[2px] text-[11px] font-medium leading-none text-white"
        style={{ background: props.color }}
      >
        {props.name}
      </span>
    </div>
  );
}

function LocalCursor(props: { color: string; name: string; host: () => HTMLDivElement | undefined }) {
  const [pt, setPt] = createSignal<{ x: number; y: number } | null>(null);
  onMount(() => {
    const move = (e: PointerEvent) => {
      const el = props.host();
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPt({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    window.addEventListener("pointermove", move);
    onCleanup(() => window.removeEventListener("pointermove", move));
  });
  return (
    <Show when={pt()}>
      {(p) => (
        <div class="pointer-events-none absolute z-20" style={{ left: `${p().x}px`, top: `${p().y}px`, transform: "translate(-2px, -2px)" }}>
          <CursorMark color={props.color} name={props.name} />
        </div>
      )}
    </Show>
  );
}
