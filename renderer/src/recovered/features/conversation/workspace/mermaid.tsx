// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js
// @evidence src/app/dist/renderer/assets/mermaid.core-CYC_FcEu.js
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export const MERMAID_CORE_ASSET = "/upstream/assets/mermaid.core-CYC_FcEu.js";
const MERMAID_CACHE_LIMIT = 64;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.4;
const DRAG_THRESHOLD = 4;

export interface MermaidRuntime {
  initialize(config: { startOnLoad: false; securityLevel: "strict"; theme: "default" | "dark"; fontFamily: "inherit" }): void;
  parse(code: string, options: { suppressErrors: true }): boolean | Promise<boolean>;
  render(id: string, code: string): Promise<{ svg: string }>;
}

export type MermaidRuntimeLoader = () => Promise<MermaidRuntime>;

interface MermaidDiagramResult {
  kind: "ok" | "invalid";
  svg?: string;
  size?: { width: number; height: number };
}

interface MermaidRuntimeModule {
  bp?: MermaidRuntime;
  default?: MermaidRuntime;
}

export async function loadShippedMermaidRuntime(): Promise<MermaidRuntime> {
  const module = await import(/* @vite-ignore */ MERMAID_CORE_ASSET) as MermaidRuntimeModule;
  const runtime = module.bp ?? module.default;
  if (runtime == null) throw new Error("Shipped Mermaid runtime is unavailable.");
  return runtime;
}

const renderCache = new Map<string, Promise<MermaidDiagramResult>>();
let renderQueue = Promise.resolve();
let renderId = 0;

function diagramSize(svg: string): { width: number; height: number } {
  if (typeof DOMParser === "undefined") return { width: 0, height: 0 };
  const viewBox = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("svg")?.viewBox.baseVal;
  return { width: viewBox?.width ?? 0, height: viewBox?.height ?? 0 };
}

async function renderMermaid(code: string, theme: "light" | "dark", loadRuntime: MermaidRuntimeLoader): Promise<MermaidDiagramResult> {
  const cacheKey = `${theme}\0${code}`;
  const cached = renderCache.get(cacheKey);
  if (cached != null) return cached;

  const render = renderQueue.then(async () => {
    const runtime = await loadRuntime();
    runtime.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "light" ? "default" : "dark", fontFamily: "inherit" });
    if (await runtime.parse(code, { suppressErrors: true }) === false) return { kind: "invalid" } as MermaidDiagramResult;
    try {
      renderId += 1;
      const result = await runtime.render(`sand-mermaid-${renderId.toString(36)}`, code);
      return { kind: "ok", svg: result.svg, size: diagramSize(result.svg) } as MermaidDiagramResult;
    } catch {
      return { kind: "invalid" } as MermaidDiagramResult;
    }
  });
  renderQueue = render.then(() => undefined, () => undefined);
  const settled = render.catch(() => ({ kind: "invalid" } as MermaidDiagramResult));
  renderCache.set(cacheKey, settled);
  if (renderCache.size > MERMAID_CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest != null) renderCache.delete(oldest);
  }
  return settled;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const emptySize = { width: 0, height: 0 };

function fitTransform(image: { width: number; height: number }, viewport: { width: number; height: number }): Transform {
  if (image.width <= 0 || image.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { scale: Number.isFinite(scale) && scale > 0 ? Math.min(scale, 1) : MIN_ZOOM, x: 0, y: 0 };
}

function clampTransform(transform: Transform, image: { width: number; height: number }, viewport: { width: number; height: number }): Transform {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, transform.scale));
  const maxX = Math.max(0, (image.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * scale - viewport.height) / 2);
  return { scale, x: Math.min(maxX, Math.max(-maxX, transform.x)), y: Math.min(maxY, Math.max(-maxY, transform.y)) };
}

function MermaidViewer({ svg, size, onClose }: { svg: string; size: { width: number; height: number }; onClose: () => void }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const imageSize = useRef(size);
  const viewportSize = useRef(emptySize);
  const transformRef = useRef<Transform>({ scale: 1, x: 0, y: 0 });
  const pointerRef = useRef<{ id: number | null; startX: number; startY: number; originX: number; originY: number; moved: boolean }>({ id: null, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const [transform, setTransform] = useState<Transform>(() => fitTransform(size, emptySize));
  const [viewport, setViewport] = useState(emptySize);
  const [dragging, setDragging] = useState(false);

  const updateTransform = (next: Transform) => {
    const clamped = clampTransform(next, imageSize.current, viewportSize.current);
    transformRef.current = clamped;
    setTransform(clamped);
  };

  const fit = () => updateTransform(fitTransform(imageSize.current, viewportSize.current));
  const zoom = (factor: number, point?: { x: number; y: number }) => {
    const current = transformRef.current;
    const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor));
    if (nextScale === current.scale) return;
    const center = point ?? { x: viewportSize.current.width / 2, y: viewportSize.current.height / 2 };
    const ratio = 1 - nextScale / current.scale;
    updateTransform({ scale: nextScale, x: current.x + (center.x - viewportSize.current.width / 2 - current.x) * ratio, y: current.y + (center.y - viewportSize.current.height / 2 - current.y) * ratio });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return undefined;
    const resize = () => {
      const next = { width: canvas.clientWidth, height: canvas.clientHeight };
      viewportSize.current = next;
      setViewport(next);
      updateTransform(transformRef.current);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      zoom(Math.exp(-event.deltaY * multiplier * (event.ctrlKey || event.metaKey ? 0.01 : 0.002)), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(ZOOM_STEP); }
      else if (event.key === "-" || event.key === "_") { event.preventDefault(); zoom(1 / ZOOM_STEP); }
      else if (event.key === "0" || event.key === "f" || event.key === "F") { event.preventDefault(); fit(); }
    };
    const previousOverflow = document.body.style.overflow;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", resize);
    document.body.style.overflow = "hidden";
    resize();
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", resize);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button") != null)) return;
    const current = transformRef.current;
    pointerRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, originX: current.x, originY: current.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.startX;
    const y = event.clientY - pointer.startY;
    if (!pointer.moved && Math.hypot(x, y) > DRAG_THRESHOLD) { pointer.moved = true; setDragging(true); }
    if (pointer.moved) updateTransform({ ...transformRef.current, x: pointer.originX + x, y: pointer.originY + y });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pointer = pointerRef.current;
    if (pointer.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointer.id = null;
    setDragging(false);
  };

  if (typeof document === "undefined") return null;
  const scaled = { transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, visibility: viewport.width > 0 && viewport.height > 0 ? "visible" : "hidden", cursor: dragging ? "grabbing" : "grab" } as const;
  return createPortal(
    <div aria-label="Diagram preview" aria-modal="true" className="sand-mermaid-viewer" onClick={(event) => event.stopPropagation()} onPointerCancel={onPointerUp} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} role="dialog">
      <div className="sand-mermaid-viewer__content" onDoubleClick={fit} ref={canvasRef}>
        <div className="sand-mermaid-viewer__canvas" dangerouslySetInnerHTML={{ __html: svg }} style={{ ...scaled, width: size.width, height: size.height }} />
      </div>
      <button aria-label="Close diagram preview" className="sand-mermaid-viewer__close" data-icon-name="close" onClick={onClose} type="button"><span aria-hidden="true">×</span></button>
      <div className="sand-mermaid-viewer__toolbar" onClick={(event) => event.stopPropagation()}>
        <button aria-label="Zoom out" className="sand-mermaid-viewer__zoom-out" data-icon-name="zoom-out" onClick={() => zoom(1 / ZOOM_STEP)} type="button"><span aria-hidden="true">−</span></button>
        <button aria-label="Zoom in" className="sand-mermaid-viewer__zoom-in" data-icon-name="zoom-in" onClick={() => zoom(ZOOM_STEP)} type="button"><span aria-hidden="true">+</span></button>
        <button aria-label="Fit to screen" className="sand-mermaid-viewer__fit" data-icon-name="corners-in" onClick={fit} type="button"><span aria-hidden="true">⛶</span></button>
      </div>
    </div>,
    document.body,
  );
}

export function MermaidDiagramFigure({ svg, size, onOpen }: { svg: string; size: { width: number; height: number }; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const openViewer = useCallback(() => setOpen(true), []);
  const show = onOpen ?? openViewer;
  const closeViewer = useCallback(() => setOpen(false), []);
  return <div className="sand-mermaid-figure">
    <div aria-label="Open diagram full screen" className="sand-mermaid" dangerouslySetInnerHTML={{ __html: svg }} onClick={show} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(); } }} role="button" tabIndex={0} />
    <button aria-label="Open diagram full screen" className="sand-mermaid-expand" data-icon-name="corners-out" onClick={show} type="button"><span aria-hidden="true">⛶</span></button>
    {open ? <MermaidViewer onClose={closeViewer} size={size} svg={svg} /> : null}
  </div>;
}

export function MermaidDiagram({ code, fallback, theme, loadRuntime = loadShippedMermaidRuntime }: { code: string; fallback: ReactNode; theme?: "light" | "dark"; loadRuntime?: MermaidRuntimeLoader }) {
  const [result, setResult] = useState<MermaidDiagramResult | null>(null);
  const resolvedTheme = theme ?? (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
  useEffect(() => {
    let active = true;
    setResult(null);
    void renderMermaid(code, resolvedTheme, loadRuntime).then((next) => { if (active) setResult(next); });
    return () => { active = false; };
  }, [code, loadRuntime, resolvedTheme]);
  if (result == null || result.kind === "invalid" || result.svg == null || result.size == null) {
    return result?.kind === "invalid" ? <><div className="sand-mermaid-error" role="note">Couldn't render this diagram.</div>{fallback}</> : fallback;
  }
  return <MermaidDiagramFigure size={result.size} svg={result.svg} />;
}
