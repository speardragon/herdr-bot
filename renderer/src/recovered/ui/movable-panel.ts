import { useEffect, useMemo } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2181468-2184585 (qCe/Ilt movable panel lifecycle)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=2774004-2778020 (qCe/Ilt movable panel lifecycle)

const DEFAULT_MARGIN_PX = 8;

export interface MovablePanelOptions {
  readonly marginPx?: number;
  readonly cursor?: string;
}

export interface MovablePanelBindings {
  readonly attachPanel: (panel: HTMLElement | null) => void;
  readonly onHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface PanelPosition {
  readonly left: number;
  readonly top: number;
}

interface MovablePanelPointerEvent extends globalThis.PointerEvent {
  readonly currentTarget: HTMLElement;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clampPanelPosition(panel: HTMLElement, left: number, top: number, marginPx: number): PanelPosition {
  const rect = panel.getBoundingClientRect();
  return {
    left: clamp(left, marginPx, Math.max(marginPx, window.innerWidth - rect.width - marginPx)),
    top: clamp(top, marginPx, Math.max(marginPx, window.innerHeight - rect.height - marginPx)),
  };
}

function applyPanelPosition(panel: HTMLElement, position: PanelPosition): void {
  panel.style.left = `${position.left}px`;
  panel.style.top = `${position.top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

export interface MovablePanelController extends MovablePanelBindings {
  readonly dispose: () => void;
}

export function createMovablePanelController(options: MovablePanelOptions = {}): MovablePanelController {
  const marginPx = options.marginPx ?? DEFAULT_MARGIN_PX;
  const cursor = options.cursor ?? "grabbing";
  let panel: HTMLElement | null = null;
  let position: PanelPosition | null = null;
  let drag: { readonly pointerId: number; readonly pointerX: number; readonly pointerY: number; readonly startLeft: number; readonly startTop: number } | null = null;
  let stopDrag: (() => void) | null = null;
  let stopPanel: (() => void) | null = null;

  const reposition = (): void => {
    if (drag != null || panel == null || position == null) return;
    position = clampPanelPosition(panel, position.left, position.top, marginPx);
    applyPanelPosition(panel, position);
  };

  const onPointerDown = (event: MovablePanelPointerEvent): void => {
    if (stopDrag != null || panel == null || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button") != null) return;
    event.preventDefault();
    const captureTarget = event.currentTarget;
    const currentPanel = panel;
    const rect = currentPanel.getBoundingClientRect();
    captureTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = cursor;
    document.body.style.userSelect = "none";
    currentPanel.style.animation = "none";
    currentPanel.style.transform = "none";
    position = { left: rect.left, top: rect.top };
    applyPanelPosition(currentPanel, position);
    drag = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, startLeft: rect.left, startTop: rect.top };

    const onPointerMove = (moveEvent: globalThis.PointerEvent): void => {
      if (moveEvent.pointerId !== event.pointerId || panel == null || drag == null) return;
      position = clampPanelPosition(panel, drag.startLeft + (moveEvent.clientX - drag.pointerX), drag.startTop + (moveEvent.clientY - drag.pointerY), marginPx);
      applyPanelPosition(panel, position);
    };
    const onKeyDown = (keyEvent: globalThis.KeyboardEvent): void => {
      if (keyEvent.key === "Escape") stop();
    };
    const stop = (): void => {
      if (stopDrag !== stop) return;
      stopDrag = null;
      drag = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      window.removeEventListener("keydown", onKeyDown);
      captureTarget.removeEventListener("lostpointercapture", stop);
      if (captureTarget.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    stopDrag = stop;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("keydown", onKeyDown);
    captureTarget.addEventListener("lostpointercapture", stop);
  };

  const attachPanel = (nextPanel: HTMLElement | null): void => {
    stopPanel?.();
    stopPanel = null;
    panel = nextPanel;
    if (nextPanel == null) return;
    const releaseDrag = (): void => stopDrag?.();
    const onResize = (): void => reposition();
    window.addEventListener("resize", onResize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    observer?.observe(nextPanel);
    stopPanel = (): void => {
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      releaseDrag();
      panel = null;
    };
  };

  return {
    attachPanel,
    onHeaderPointerDown: (event) => onPointerDown(event as unknown as MovablePanelPointerEvent),
    dispose: () => {
      stopPanel?.();
      stopPanel = null;
      panel = null;
      position = null;
      stopDrag?.();
      stopDrag = null;
    },
  };
}

export function useMovablePanel(options: MovablePanelOptions = {}): MovablePanelBindings {
  const controller = useMemo(() => createMovablePanelController(options), [options.cursor, options.marginPx]);
  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}
