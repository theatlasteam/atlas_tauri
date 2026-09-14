import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { api, getToken } from "../data/api";
import { session } from "../store/session";
import { serverConfig } from "../store/serverConfig";
import { isMobilePlatform } from "../lib/platform";
import { canvasShareUrl } from "../lib/canvasShare";
import { t } from "../lib/i18n";
import { CloseIcon, TrashIcon } from "../icons";

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
    ctx.fillStyle = "#f7f4ef";
    ctx.fillRect(0, 0, w, h);
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

  return (
    <div class="flex h-full min-h-0 flex-col bg-[#efeae2] text-ink">
      <header class="flex shrink-0 items-center gap-2 border-b border-black/10 px-3 py-2">
        <Show when={props.onClose}>
          <button type="button" class="atlas-focus grid h-11 w-11 place-items-center rounded-full hover:bg-black/5" onClick={props.onClose}>
            <CloseIcon size={20} />
          </button>
        </Show>
        <p class="font-heading text-sm font-semibold">{t("canvas.title")}</p>
        <div class="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <For each={peers()}>
            {(p) => (
              <span class="flex shrink-0 items-center gap-1 rounded-full bg-white/70 py-0.5 pl-0.5 pr-2 text-[11px] font-medium">
                <span class="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: p.color }}>
                  {(p.name[0] ?? "?").toUpperCase()}
                </span>
                <span class="max-w-[7rem] truncate">{p.guest ? p.name : p.name}</span>
              </span>
            )}
          </For>
        </div>
        <a
          href={canvasShareUrl(props.id)}
          target="_blank"
          rel="noreferrer"
          class="hidden h-11 items-center rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-black/5 sm:flex"
        >
          {t("canvas.browser")}
        </a>
        <button
          type="button"
          class="atlas-focus grid h-11 w-11 place-items-center rounded-full hover:bg-black/5"
          onClick={() => send({ type: "clear" })}
          title={t("canvas.clear")}
        >
          <TrashIcon size={18} />
        </button>
      </header>
      <div class="flex shrink-0 items-center gap-2 px-3 py-2">
        <button
          type="button"
          class="atlas-focus min-h-9 rounded-full px-3 text-[13px] font-medium"
          classList={{ "bg-ink text-white": tool() === "pen", "bg-white/70": tool() !== "pen" }}
          onClick={() => setTool("pen")}
        >
          {t("canvas.pen")}
        </button>
        <button
          type="button"
          class="atlas-focus min-h-9 rounded-full px-3 text-[13px] font-medium"
          classList={{ "bg-ink text-white": tool() === "eraser", "bg-white/70": tool() !== "eraser" }}
          onClick={() => setTool("eraser")}
        >
          {t("canvas.eraser")}
        </button>
        <input type="color" value={ink()} onInput={(e) => setInk(e.currentTarget.value)} class="h-9 w-9 cursor-pointer rounded-full border-0 bg-transparent" />
        <input type="range" min="2" max="16" value={width()} onInput={(e) => setWidth(Number(e.currentTarget.value))} class="w-24" />
      </div>
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
      </div>
    </div>
  );
}

function CursorMark(props: { color: string; name: string }) {
  return (
    <div class="flex items-start">
      <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden>
        <path d="M1 1 L1 18 L6 13 L11 21 L14 19 L9 12 L16 12 Z" fill={props.color} stroke="#fff" stroke-width="1.2" />
      </svg>
      <span class="mt-3 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm" style={{ background: props.color }}>
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
