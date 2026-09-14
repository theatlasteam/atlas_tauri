import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { api, getToken } from "../data/api";
import { session } from "../store/session";
import { serverConfig } from "../store/serverConfig";
import { isMobilePlatform } from "../lib/platform";
import { canvasShareUrl } from "../lib/canvasShare";
import { t } from "../lib/i18n";
import {
  ArrowIcon,
  CircleIcon,
  CloseIcon,
  EditIcon,
  EraserIcon,
  LineIcon,
  SettingsIcon,
  FillIcon,
  HighlightIcon,
  SquareIcon,
  TextIcon,
  TrashIcon,
  TriangleIcon,
} from "../icons";

type Peer = { id: string; name: string; color: string; handle?: string | null; guest?: boolean };
type Pt = { x: number; y: number };
type Kind = "pen" | "eraser" | "highlight" | "line" | "rect" | "ellipse" | "arrow" | "triangle" | "text";
type Stroke = { points: Pt[]; color: string; width: number; kind?: Kind; tool?: string; text?: string; filled?: boolean; from?: string };
type Settings = { bg: string; grid: boolean };

const DEFAULTS: Settings = { bg: "#131110", grid: true };

export default function CanvasBoard(props: { id: string; onClose?: () => void }) {
  const [peers, setPeers] = createSignal<Peer[]>([]);
  const [self, setSelf] = createSignal<Peer | null>(null);
  const [cursors, setCursors] = createSignal<Record<string, { x: number; y: number; name: string; color: string }>>({});
  const [tool, setTool] = createSignal<Kind>("pen");
  const [ink, setInk] = createSignal("#f4f0ea");
  const [width, setWidth] = createSignal(4);
  const [filled, setFilled] = createSignal(false);
  const [settings, setSettings] = createSignal<Settings>(DEFAULTS);
  const [panel, setPanel] = createSignal(false);
  const [textDraft, setTextDraft] = createSignal<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = createSignal("");
  let canvas: HTMLCanvasElement | undefined;
  let inkLayer: HTMLCanvasElement | undefined;
  let wrap: HTMLDivElement | undefined;
  let ws: WebSocket | undefined;
  let strokes: Stroke[] = [];
  let current: Stroke | null = null;
  const desktop = !isMobilePlatform();

  const kindOf = (s: Stroke): Kind => s.kind ?? (s.tool === "eraser" ? "eraser" : "pen");

  const sizeInk = (w: number, h: number, dpr: number) => {
    if (!inkLayer) {
      inkLayer = document.createElement("canvas");
    }
    if (inkLayer.width !== Math.floor(w * dpr) || inkLayer.height !== Math.floor(h * dpr)) {
      inkLayer.width = Math.floor(w * dpr);
      inkLayer.height = Math.floor(h * dpr);
    }
    return inkLayer.getContext("2d")!;
  };

  const paintStroke = (ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) => {
    const pts = s.points;
    if (!pts.length) return;
    const kind = kindOf(s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.width;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    const x = (p: Pt) => p.x * w;
    const y = (p: Pt) => p.y * h;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (kind === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(x(a), y(a));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(x(pts[i]!), y(pts[i]!));
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    if (kind === "text" && s.text) {
      ctx.font = `${Math.max(16, s.width * 6)}px Manrope, Inter, sans-serif`;
      ctx.fillText(s.text, x(a), y(a));
      return;
    }
    if (kind === "highlight") {
      ctx.globalAlpha = 0.35;
      if (pts.length < 2) {
        ctx.globalAlpha = 1;
        return;
      }
      ctx.beginPath();
      ctx.moveTo(x(a), y(a));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(x(pts[i]!), y(pts[i]!));
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    if (kind === "rect") {
      const rw = x(b) - x(a);
      const rh = y(b) - y(a);
      if (s.filled) ctx.fillRect(x(a), y(a), rw, rh);
      ctx.strokeRect(x(a), y(a), rw, rh);
      return;
    }
    if (kind === "ellipse") {
      ctx.beginPath();
      ctx.ellipse((x(a) + x(b)) / 2, (y(a) + y(b)) / 2, Math.abs(x(b) - x(a)) / 2, Math.abs(y(b) - y(a)) / 2, 0, 0, Math.PI * 2);
      if (s.filled) ctx.fill();
      ctx.stroke();
      return;
    }
    if (kind === "triangle") {
      ctx.beginPath();
      ctx.moveTo((x(a) + x(b)) / 2, y(a));
      ctx.lineTo(x(a), y(b));
      ctx.lineTo(x(b), y(b));
      ctx.closePath();
      if (s.filled) ctx.fill();
      ctx.stroke();
      return;
    }
    if (kind === "line" || kind === "arrow") {
      ctx.beginPath();
      ctx.moveTo(x(a), y(a));
      ctx.lineTo(x(b), y(b));
      ctx.stroke();
      if (kind === "arrow") {
        const ang = Math.atan2(y(b) - y(a), x(b) - x(a));
        const len = 12 + s.width;
        ctx.beginPath();
        ctx.moveTo(x(b), y(b));
        ctx.lineTo(x(b) - len * Math.cos(ang - 0.4), y(b) - len * Math.sin(ang - 0.4));
        ctx.moveTo(x(b), y(b));
        ctx.lineTo(x(b) - len * Math.cos(ang + 0.4), y(b) - len * Math.sin(ang + 0.4));
        ctx.stroke();
      }
      return;
    }
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(x(a), y(a));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(x(pts[i]!), y(pts[i]!));
    ctx.stroke();
  };

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
    const ink = sizeInk(w, h, dpr);
    ink.setTransform(dpr, 0, 0, dpr, 0, 0);
    ink.clearRect(0, 0, w, h);
    for (const s of strokes) paintStroke(ink, s, w, h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = settings().bg;
    ctx.fillRect(0, 0, w, h);
    if (settings().grid) {
      ctx.strokeStyle = settings().bg === "#f4f0ea" || settings().bg === "#ffffff" ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 32) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += 32) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
    ctx.drawImage(inkLayer!, 0, 0, w, h);
  };

  const pos = (e: PointerEvent): Pt | null => {
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const constrain = (a: Pt, b: Pt, kind: Kind, shift: boolean): Pt => {
    if (!shift || !canvas) return b;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (kind === "rect" || kind === "ellipse" || kind === "triangle") {
      const side = Math.max(Math.abs(dx) * cw, Math.abs(dy) * ch);
      return { x: a.x + Math.sign(dx || 1) * (side / cw), y: a.y + Math.sign(dy || 1) * (side / ch) };
    }
    if (kind === "line" || kind === "arrow") {
      const ang = Math.atan2(dy * ch, dx * cw);
      const snap = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx * cw, dy * ch);
      return { x: a.x + (Math.cos(snap) * len) / cw, y: a.y + (Math.sin(snap) * len) / ch };
    }
    return b;
  };

  const send = (obj: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  const applySettings = (next: Settings) => {
    setSettings(next);
    send({ type: "settings", settings: next });
    redraw();
  };

  onMount(() => {
    void api.getCanvas(props.id).catch(() => {});
    ws = new WebSocket(`${serverConfig.wsUrl()}/canvas/${props.id}`);
    ws.onopen = () => send({ type: "join", token: getToken() ?? undefined, name: session.user()?.name });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        type: string;
        self?: Peer;
        peers?: Peer[];
        strokes?: Stroke[];
        stroke?: Stroke;
        settings?: Settings;
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
        if (msg.settings && typeof msg.settings === "object") {
          setSettings({ ...DEFAULTS, ...msg.settings });
        }
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
      } else if (msg.type === "settings" && msg.settings) {
        setSettings({ ...DEFAULTS, ...msg.settings });
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

  const commit = (s: Stroke) => {
    strokes.push(s);
    send({ type: "stroke", stroke: s });
    redraw();
  };

  const down = (e: PointerEvent) => {
    const p = pos(e);
    if (!p) return;
    if (tool() === "text") {
      setTextDraft({ x: e.clientX, y: e.clientY });
      setTextValue("");
      return;
    }
    canvas?.setPointerCapture(e.pointerId);
    current = {
      points: [p],
      color: ink(),
      width: tool() === "eraser" ? Math.max(width() * 4, 18) : tool() === "highlight" ? Math.max(width() * 3, 12) : width(),
      kind: tool(),
      tool: tool(),
      filled: filled() && (tool() === "rect" || tool() === "ellipse" || tool() === "triangle"),
    };
  };
  const move = (e: PointerEvent) => {
    const p0 = pos(e);
    if (!p0) return;
    send({ type: "cursor", x: p0.x, y: p0.y });
    if (!current) return;
    const kind = kindOf(current);
    const p = constrain(current.points[0]!, p0, kind, e.shiftKey);
    if (kind === "pen" || kind === "eraser" || kind === "highlight") current.points.push(p0);
    else current.points = [current.points[0]!, p];
    const live = current;
    strokes = strokes.filter((s) => s !== live);
    strokes.push(live);
    redraw();
  };
  const up = () => {
    if (!current) return;
    const done = current;
    current = null;
    strokes = strokes.filter((s) => s !== done);
    if (done.points.length < 2 && kindOf(done) !== "text") return;
    commit(done);
  };

  const placeText = () => {
    const at = textDraft();
    const value = textValue().trim();
    setTextDraft(null);
    if (!at || !value || !canvas) return;
    const r = canvas.getBoundingClientRect();
    commit({
      points: [{ x: (at.x - r.left) / r.width, y: (at.y - r.top) / r.height }],
      color: ink(),
      width: width(),
      kind: "text",
      text: value,
    });
    setTool("pen");
  };

  const swatches = ["#f4f0ea", "#111111", "#e24b4a", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];
  const bgs = ["#131110", "#1c1917", "#f4f0ea", "#ffffff", "#0b1220"];
  const tools: { id: Kind; icon: typeof EditIcon; label: string }[] = [
    { id: "pen", icon: EditIcon, label: t("canvas.pen") },
    { id: "highlight", icon: HighlightIcon, label: t("canvas.highlight") },
    { id: "eraser", icon: EraserIcon, label: t("canvas.eraser") },
    { id: "line", icon: LineIcon, label: t("canvas.line") },
    { id: "arrow", icon: ArrowIcon, label: t("canvas.arrow") },
    { id: "rect", icon: SquareIcon, label: t("canvas.rect") },
    { id: "ellipse", icon: CircleIcon, label: t("canvas.ellipse") },
    { id: "triangle", icon: TriangleIcon, label: t("canvas.triangle") },
    { id: "text", icon: TextIcon, label: t("canvas.text") },
  ];

  return (
    <div class="flex h-full min-h-0 flex-col bg-bg text-ink">
      <header class="flex shrink-0 items-center gap-2 border-b border-border bg-appbar px-3 py-2">
        <Show when={props.onClose}>
          <button type="button" class="atlas-focus grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink" onClick={props.onClose}>
            <CloseIcon size={20} />
          </button>
        </Show>
        <p class="font-heading text-sm font-semibold">{t("canvas.title")}</p>
        <div class="ml-3 flex min-w-0 flex-1 items-center">
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
        <a href={canvasShareUrl(props.id)} target="_blank" rel="noreferrer" class="hidden h-11 items-center rounded-full px-3 text-sm font-medium text-ink-muted hover:bg-surface hover:text-ink sm:flex">
          {t("canvas.browser")}
        </a>
        <button type="button" class="atlas-focus grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-ink" onClick={() => setPanel((v) => !v)} title={t("canvas.settings")}>
          <SettingsIcon size={18} />
        </button>
      </header>
      <div ref={wrap} class="relative min-h-0 flex-1 overflow-hidden" classList={{ "atlas-canvas-host": desktop }}>
        <canvas
          ref={canvas}
          class="h-full w-full touch-none"
          classList={{ "cursor-none": desktop && tool() !== "text" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <For each={Object.values(cursors())}>
          {(c) => (
            <div class="pointer-events-none absolute z-10" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, transform: "translate(-2px, -2px)" }}>
              <CursorMark color={c.color} name={c.name} />
            </div>
          )}
        </For>
        <Show when={desktop && tool() !== "text" && self()}>
          {(me) => <LocalCursor color={me().color} name={me().name} host={() => wrap} />}
        </Show>
        <Show when={textDraft()}>
          {(at) => (
            <input
              type="text"
              autofocus
              value={textValue()}
              class="atlas-focus absolute z-40 min-w-[8rem] rounded-md border border-border bg-surface px-2 py-1 text-sm text-ink shadow-floating"
              style={{ left: `${at().x}px`, top: `${at().y}px` }}
              onInput={(e) => setTextValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") placeText();
                if (e.key === "Escape") setTextDraft(null);
              }}
              onBlur={() => placeText()}
            />
          )}
        </Show>
        <Show when={panel()}>
          <div class="absolute right-3 top-3 z-30 w-56 rounded-2xl border border-border bg-surface p-3 shadow-floating">
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{t("canvas.background")}</p>
            <div class="mb-3 flex flex-wrap gap-1.5">
              <For each={bgs}>
                {(c) => (
                  <button
                    type="button"
                    class="h-8 w-8 rounded-full border border-border"
                    classList={{ "ring-2 ring-accent ring-offset-2 ring-offset-surface": settings().bg === c }}
                    style={{ background: c }}
                    onClick={() => applySettings({ ...settings(), bg: c })}
                  />
                )}
              </For>
            </div>
            <label class="flex min-h-11 items-center justify-between gap-2 text-sm">
              <span>{t("canvas.grid")}</span>
              <input type="checkbox" checked={settings().grid} onChange={(e) => applySettings({ ...settings(), grid: e.currentTarget.checked })} />
            </label>
          </div>
        </Show>
        <div class="pointer-events-auto absolute bottom-4 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface/95 p-1 shadow-floating backdrop-blur">
          <For each={tools}>
            {(item) => (
              <button
                type="button"
                class="atlas-focus grid h-11 w-11 shrink-0 place-items-center rounded-full"
                classList={{ "bg-accent text-accent-ink": tool() === item.id, "text-ink-muted hover:bg-bg": tool() !== item.id }}
                onClick={() => setTool(item.id)}
                title={item.label}
              >
                <item.icon size={18} />
              </button>
            )}
          </For>
          <span class="mx-1 h-6 w-px shrink-0 bg-border" />
          <For each={swatches}>
            {(c) => (
              <button
                type="button"
                class="atlas-focus h-7 w-7 shrink-0 rounded-full border border-black/20"
                classList={{ "ring-2 ring-accent ring-offset-2 ring-offset-surface": ink() === c }}
                style={{ background: c }}
                onClick={() => setInk(c)}
              />
            )}
          </For>
          <span class="mx-1 h-6 w-px shrink-0 bg-border" />
          <button
            type="button"
            class="atlas-focus grid h-11 w-11 shrink-0 place-items-center rounded-full"
            classList={{ "bg-accent text-accent-ink": filled(), "text-ink-muted hover:bg-bg": !filled() }}
            onClick={() => setFilled((v) => !v)}
            title={t("canvas.fill")}
          >
            <FillIcon size={18} />
          </button>
          <input type="range" min="1" max="64" value={width()} onInput={(e) => setWidth(Number(e.currentTarget.value))} class="w-24 shrink-0 accent-[var(--color-accent)]" title={String(width())} />
          <button type="button" class="atlas-focus grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-bg hover:text-danger" onClick={() => send({ type: "clear" })} title={t("canvas.clear")}>
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
        <path d="M4 2.8 L4 18.2 L8.2 14.4 L11.4 20.6 L14.4 19.2 L11.1 12.8 L18.2 12.8 Z" fill={props.color} stroke="#fff" stroke-width="1.4" stroke-linejoin="round" />
      </svg>
      <span class="mt-[14px] ml-0.5 rounded-md px-1.5 py-[2px] text-[11px] font-medium leading-none text-white" style={{ background: props.color }}>
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
