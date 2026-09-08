import { createPortal } from "react-dom";
import { createContext, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

// The shared modal lifecycle is recovered from the shipped JVn app-alert host:
// backdrop marker, dialog root marker, focus restoration, Escape and outside
// dismissal are preserved here as one reusable leaf for non-root consumers.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5743352
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7222969

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[role='button']:not([aria-disabled='true'])",
  "[role='menuitem']:not([aria-disabled='true'])",
  "[role='option']:not([aria-disabled='true'])",
  "[role='tab']:not([aria-disabled='true'])"
].join(", ");

export const DISMISSABLE_LAYER_OWNER_ATTRIBUTE = "data-sand-floating-owner" as const;
export const DismissableLayerOwnerContext = createContext<string | null>(null);
let dismissableLayerSequence = 0;

export function createDismissableLayerOwner(): string {
  dismissableLayerSequence += 1;
  return `sand-overlay-${dismissableLayerSequence}`;
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (typeof Element === "undefined") return null;
  if (target instanceof Element) return target;
  if (typeof Node !== "undefined" && target instanceof Node) return target.parentElement;
  return null;
}

export function dismissableLayerSelector(owner: string): string {
  return `[${DISMISSABLE_LAYER_OWNER_ATTRIBUTE}="${owner}"]`;
}

export function isOwnedDismissableLayerTarget(target: EventTarget | null, owner: string): boolean {
  return eventTargetElement(target)?.closest(dismissableLayerSelector(owner)) != null;
}

export function hasOwnedDismissableLayer(owner: string): boolean {
  return typeof document !== "undefined" && document.querySelector(dismissableLayerSelector(owner)) != null;
}

export function shouldOverlayHandleEscape(childLayerOpen: boolean, closeOnEscape: boolean, defaultPrevented: boolean): boolean {
  return !childLayerOpen && closeOnEscape && !defaultPrevented;
}

export function shouldOverlayDismissPointer(insidePanel: boolean, ownedChildLayer: boolean, closeOnBackdrop: boolean, defaultPrevented: boolean, ctrlKey: boolean): boolean {
  return closeOnBackdrop && !defaultPrevented && !ctrlKey && !insidePanel && !ownedChildLayer;
}

export function shouldOverlayContainFocus(insidePanel: boolean, ownedChildLayer: boolean, trapFocus: boolean): boolean {
  return trapFocus && !insidePanel && !ownedChildLayer;
}

export type OverlayDialogStatus = "open" | "close" | "unmounted";
export type OverlayDialogAnimationPhase = "idle" | "expanding" | "expanded" | "collapsing";

export interface OverlayDialogMarkers {
  readonly "data-status": OverlayDialogStatus;
  readonly "data-animation-phase"?: OverlayDialogAnimationPhase;
  readonly "data-expanded"?: true;
}

/**
 * Projects the shipped dialog state markers without manufacturing a transition
 * for the compact dialog used by recovered consumers. The immutable dialog
 * emits animation-phase/expanded only for its fullscreen state.
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=480017
 * @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=7222969
 */
export function projectOverlayDialogMarkers(input: {
  readonly status: OverlayDialogStatus;
  readonly fullscreen?: boolean;
  readonly animationPhase?: OverlayDialogAnimationPhase;
  readonly expanded?: boolean;
}): OverlayDialogMarkers {
  return {
    "data-status": input.status,
    ...(input.fullscreen && input.animationPhase != null ? { "data-animation-phase": input.animationPhase } : {}),
    ...(input.fullscreen && input.expanded === true ? { "data-expanded": true as const } : {})
  };
}

type OverlayScrollLockRelease = () => void;
interface OverlayScrollLockSnapshot {
  readonly overflow: string;
  readonly paddingLeft: string;
  readonly paddingRight: string;
  readonly position: string;
  readonly top: string;
  readonly left: string;
  readonly right: string;
  readonly scrollbarWidth: string;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly fixedViewport: boolean;
}

let overlayScrollLockCount = 0;
let overlayScrollLockSnapshot: OverlayScrollLockSnapshot | null = null;
let overlayScrollLockRelease: OverlayScrollLockRelease = () => {};

function isMobileSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return /iP(hone|ad|od)|iOS/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Exact modal scroll-lock boundary from the shipped Ukt portal: nested modal
 * layers share one body lock, scrollbar compensation is explicit, and the
 * original inline styles/scroll position are restored on the final release.
 * @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=238317
 * @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=384211
 */
export function acquireOverlayScrollLock(): OverlayScrollLockRelease {
  if (typeof document === "undefined" || document.body == null) return () => {};
  if (overlayScrollLockCount > 0) {
    overlayScrollLockCount += 1;
    return () => {
      if (overlayScrollLockCount === 0) return;
      overlayScrollLockCount -= 1;
      if (overlayScrollLockCount === 0) overlayScrollLockRelease();
    };
  }

  const body = document.body;
  const root = document.documentElement;
  const style = body.style;
  const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
  const fixedViewport = isMobileSafari();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const paddingSide = root.getBoundingClientRect().left + root.scrollLeft ? "paddingLeft" : "paddingRight";
  overlayScrollLockSnapshot = {
    overflow: style.overflow,
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    position: style.position,
    top: style.top,
    left: style.left,
    right: style.right,
    scrollbarWidth: style.getPropertyValue("--floating-ui-scrollbar-width"),
    scrollX,
    scrollY,
    fixedViewport
  };

  style.overflow = "hidden";
  style.setProperty("--floating-ui-scrollbar-width", `${scrollbarWidth}px`);
  if (scrollbarWidth > 0) style[paddingSide] = `${scrollbarWidth}px`;
  if (fixedViewport) {
    const viewport = window.visualViewport;
    const offsetLeft = viewport?.offsetLeft ?? 0;
    const offsetTop = viewport?.offsetTop ?? 0;
    Object.assign(style, { position: "fixed", top: `${-(scrollY - Math.floor(offsetTop))}px`, left: `${-(scrollX - Math.floor(offsetLeft))}px`, right: "0" });
  }

  overlayScrollLockCount = 1;
  overlayScrollLockRelease = () => {
    const snapshot = overlayScrollLockSnapshot;
    if (snapshot == null) return;
    Object.assign(style, { overflow: snapshot.overflow, paddingLeft: snapshot.paddingLeft, paddingRight: snapshot.paddingRight, position: snapshot.position, top: snapshot.top, left: snapshot.left, right: snapshot.right });
    if (snapshot.scrollbarWidth === "") style.removeProperty("--floating-ui-scrollbar-width");
    else style.setProperty("--floating-ui-scrollbar-width", snapshot.scrollbarWidth);
    if (snapshot.fixedViewport) window.scrollTo(snapshot.scrollX, snapshot.scrollY);
    overlayScrollLockSnapshot = null;
    overlayScrollLockRelease = () => {};
  };

  return () => {
    if (overlayScrollLockCount === 0) return;
    overlayScrollLockCount -= 1;
    if (overlayScrollLockCount === 0) overlayScrollLockRelease();
  };
}

export interface OverlayDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly label?: string;
  readonly role?: "dialog" | "alertdialog";
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly closeOnBackdrop?: boolean;
  readonly closeOnEscape?: boolean;
  readonly trapFocus?: boolean;
  /** Matches the shipped modal portal default; nested dialogs share one lock. */
  readonly lockScroll?: boolean;
  readonly className?: string;
  readonly dataPresentation?: string;
  readonly panelStyle?: CSSProperties;
  readonly zIndex?: number;
}

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.getAttribute("aria-hidden") !== "true");
}

export function OverlayDialog({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  label,
  role = "dialog",
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  trapFocus = true,
  lockScroll = true,
  className,
  dataPresentation,
  panelStyle,
  zIndex = 3200
}: OverlayDialogProps) {
  const ownerRef = useRef<string | null>(null);
  if (ownerRef.current == null) ownerRef.current = createDismissableLayerOwner();
  const owner = ownerRef.current;
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !lockScroll) return;
    return acquireOverlayScrollLock();
  }, [lockScroll, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusTarget = initialFocusRef?.current ?? focusableElements(panel ?? document.body)[0] ?? panel;
    focusTarget?.focus({ preventScroll: true });
    return () => {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore?.isConnected) restore.focus({ preventScroll: true });
    };
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent): void => {
      const panel = panelRef.current;
      if (panel == null) return;
      // @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=479490
      // Portaled SandSelect/Menu descendants own the first dismissal layer;
      // let their listener consume Escape before this modal does.
      if (event.key === "Escape") {
        if (!shouldOverlayHandleEscape(hasOwnedDismissableLayer(owner), closeOnEscape, event.defaultPrevented)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (!trapFocus || event.key !== "Tab") return;
      const focusable = focusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const handlePointerDown = (event: PointerEvent): void => {
      const panel = panelRef.current;
      if (panel == null) return;
      const insidePanel = typeof Node !== "undefined" && event.target instanceof Node && panel.contains(event.target);
      const ownedChildLayer = isOwnedDismissableLayerTarget(event.target, owner);
      if (shouldOverlayDismissPointer(insidePanel, ownedChildLayer, closeOnBackdrop, event.defaultPrevented, event.ctrlKey)) onCloseRef.current();
    };
    const handleFocusIn = (event: FocusEvent): void => {
      const panel = panelRef.current;
      if (panel == null) return;
      const insidePanel = typeof Node !== "undefined" && event.target instanceof Node && panel.contains(event.target);
      if (!shouldOverlayContainFocus(insidePanel, isOwnedDismissableLayerTarget(event.target, owner), trapFocus)) return;
      panel.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, [closeOnBackdrop, closeOnEscape, open, owner, trapFocus]);

  if (!open) return null;
  const markers = projectOverlayDialogMarkers({ status: "open" });
  // @evidence src/app/dist/renderer/assets/index-lCyB53CO.css#byteOffset=80768
  const tree = (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", zIndex }}>
      <div aria-hidden="true" className="sand-dialog__scrim ui-dialog-backdrop" data-ui-dialog-backdrop {...markers} style={{ position: "fixed", inset: 0, pointerEvents: "auto", background: "#00000080" }} />
      <div
        aria-describedby={describedBy}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={className}
        {...markers}
        data-presentation={dataPresentation}
        data-ui-dialog-root
        ref={panelRef}
        role={role}
        style={{ position: "relative", zIndex: 1, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 32px)", outline: "none", pointerEvents: "auto", ...panelStyle }}
        tabIndex={-1}
      >
        <DismissableLayerOwnerContext.Provider value={owner}>{children}</DismissableLayerOwnerContext.Provider>
      </div>
    </div>
  );
  if (typeof document === "undefined" || document.body == null) return tree;
  return createPortal(tree, document.body);
}

export interface OverlayIconProps {
  readonly name: string;
  readonly label?: string;
  readonly children?: ReactNode;
}

export function OverlayIcon({ name, label, children }: OverlayIconProps) {
  return <span aria-hidden={label == null ? "true" : undefined} aria-label={label} data-icon-name={name} style={{ fontFamily: "cursor-icons" }}>{children}</span>;
}
