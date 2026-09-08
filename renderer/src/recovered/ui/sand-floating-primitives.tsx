import { createContext, cloneElement, isValidElement, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import "./sand-floating-primitives.css";
import { DismissableLayerOwnerContext, DISMISSABLE_LAYER_OWNER_ATTRIBUTE } from "./overlay-primitives";

// Immutable Mac renderer: index-UbX-y3il.js, SHA-256
// ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=345879 (LegacyMenu.Root)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=401471 (Tooltip.Root/Popup)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=424809 (LegacyMenu.Content)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=580465 (Select popup markers)
// Windows renderer: recovered/frontend/app/assets/index-UbX-y3il.js, SHA-256
// 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5.

export type SandFloatingSide = "top" | "right" | "bottom" | "left";
export type SandFloatingAlign = "start" | "center" | "end";
export type SandFloatingPlacement = `${SandFloatingSide}` | `${SandFloatingSide}-${SandFloatingAlign}`;

export interface FloatingRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FloatingViewport {
  readonly width: number;
  readonly height: number;
  readonly padding?: number;
}

export interface FloatingPosition {
  readonly left: number;
  readonly top: number;
  readonly side: SandFloatingSide;
  readonly align: SandFloatingAlign;
}

function parsePlacement(placement: SandFloatingPlacement): { side: SandFloatingSide; align: SandFloatingAlign } {
  const [side, align = "center"] = placement.split("-") as [SandFloatingSide, SandFloatingAlign?];
  return { side, align };
}

export function resolveFloatingPosition(anchor: FloatingRect, floating: FloatingRect, placement: SandFloatingPlacement, offset: number, viewport: FloatingViewport, flip = true): FloatingPosition {
  const parsed = parsePlacement(placement);
  const padding = viewport.padding ?? 8;
  const alignOffset = parsed.align === "start" ? 0 : parsed.align === "end" ? (parsed.side === "top" || parsed.side === "bottom" ? anchor.width - floating.width : anchor.height - floating.height) : (parsed.side === "top" || parsed.side === "bottom" ? (anchor.width - floating.width) / 2 : (anchor.height - floating.height) / 2);
  const raw = (side: SandFloatingSide): { left: number; top: number } => {
    if (side === "top") return { left: anchor.x + alignOffset, top: anchor.y - floating.height - offset };
    if (side === "right") return { left: anchor.x + anchor.width + offset, top: anchor.y + alignOffset };
    if (side === "left") return { left: anchor.x - floating.width - offset, top: anchor.y + alignOffset };
    return { left: anchor.x + alignOffset, top: anchor.y + anchor.height + offset };
  };
  const fits = (side: SandFloatingSide, point: { left: number; top: number }): boolean => {
    if (side === "top") return point.top >= padding;
    if (side === "bottom") return point.top + floating.height <= viewport.height - padding;
    if (side === "left") return point.left >= padding;
    return point.left + floating.width <= viewport.width - padding;
  };
  let side = parsed.side;
  let point = raw(side);
  if (flip && !fits(side, point)) {
    const opposite: Record<SandFloatingSide, SandFloatingSide> = { top: "bottom", bottom: "top", left: "right", right: "left" };
    const candidate = opposite[side];
    const candidatePoint = raw(candidate);
    if (fits(candidate, candidatePoint)) {
      side = candidate;
      point = candidatePoint;
    }
  }
  return {
    left: Math.max(padding, Math.min(point.left, viewport.width - floating.width - padding)),
    top: Math.max(padding, Math.min(point.top, viewport.height - floating.height - padding)),
    side,
    align: parsed.align,
  };
}

interface FloatingContextValue {
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
  readonly setAnchor: (node: HTMLElement | null) => void;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly close: () => void;
  readonly placement: SandFloatingPlacement;
  readonly offset: number;
  readonly closeOnOutsidePress: boolean;
  readonly closeOnEscape: boolean;
  readonly returnFocus: boolean;
}

const FloatingContext = createContext<FloatingContextValue | null>(null);

function useFloatingContext(name: string): FloatingContextValue {
  const value = useContextValue(FloatingContext);
  if (value == null) throw new Error(`${name} must be used within its floating root`);
  return value;
}

function useContextValue<T>(context: React.Context<T>): T {
  return useContext(context);
}

function mergeRefs<T>(...refs: readonly (((node: T | null) => void) | undefined)[]): (node: T | null) => void {
  return (node) => { for (const ref of refs) ref?.(node); };
}

function cloneWithRef(element: ReactElement, ref: (node: HTMLElement | null) => void, props: Record<string, unknown>): ReactElement {
  return cloneElement(element, { ...props, ref: mergeRefs(ref, (element as ReactElement & { ref?: (node: HTMLElement | null) => void }).ref) } as never);
}

function useDismissal(context: FloatingContextValue): void {
  const { close, closeOnEscape, closeOnOutsidePress, open, returnFocus } = context;
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      const focusedSurface = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-sand-floating-surface="true"]') : null;
      if (event.key === "Escape" && closeOnEscape && !event.defaultPrevented && (focusedSurface == null || focusedSurface === context.surfaceRef.current)) {
        event.preventDefault();
        close();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!closeOnOutsidePress || !(event.target instanceof Node)) return;
      const target = event.target;
      const anchor = context.anchorRef.current;
      const popups = [...document.querySelectorAll<HTMLElement>('[data-sand-floating-surface="true"]')];
      if (anchor?.contains(target) || popups.some((popup) => popup.contains(target))) return;
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (returnFocus && restore?.isConnected) restore.focus({ preventScroll: true });
    };
  }, [close, closeOnEscape, closeOnOutsidePress, context.anchorRef, open, returnFocus]);
}

function FloatingSurface({
  children,
  ariaLabel,
  className,
  dataComponent,
  role,
  style,
  trapFocus = false,
}: {
  readonly children: ReactNode;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly dataComponent?: string;
  readonly role?: string;
  readonly style?: CSSProperties;
  readonly trapFocus?: boolean;
}): ReactNode {
  const context = useFloatingContext("FloatingSurface");
  const owner = useContext(DismissableLayerOwnerContext);
  const surfaceRef = context.surfaceRef;
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const update = useCallback(() => {
    const anchor = context.anchorRef.current;
    const surface = surfaceRef.current;
    if (anchor == null || surface == null || typeof window === "undefined") return;
    const anchorRect = anchor.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    setPosition(resolveFloatingPosition(
      { x: anchorRect.left, y: anchorRect.top, width: anchorRect.width, height: anchorRect.height },
      { x: 0, y: 0, width: surfaceRect.width, height: surfaceRect.height },
      context.placement,
      context.offset,
      { width: window.innerWidth, height: window.innerHeight, padding: 8 },
      true,
    ));
  }, [context.anchorRef, context.offset, context.placement]);
  useLayoutEffect(() => {
    if (!context.open) return;
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [context.open, update]);
  useEffect(() => { if (!context.open || !trapFocus || surfaceRef.current == null) return; surfaceRef.current.focus({ preventScroll: true }); }, [context.open, trapFocus]);
  if (!context.open) return null;
  const surface = <div
    aria-label={ariaLabel}
    className={className}
    data-component={dataComponent}
    data-sand-floating-surface="true"
    {...(owner == null ? {} : { [DISMISSABLE_LAYER_OWNER_ATTRIBUTE]: owner })}
    ref={surfaceRef}
    role={role}
    style={{
      left: position?.left ?? 8,
      maxWidth: "calc(100vw - 16px)",
      position: "fixed",
      top: position?.top ?? 8,
      zIndex: 4000,
      ...style,
    }}
    tabIndex={trapFocus ? -1 : undefined}
  >{children}</div>;
  if (typeof document === "undefined" || document.body == null) return surface;
  return createPortal(surface, document.body);
}

function FloatingBackdrop({ onPointerDown }: { readonly onPointerDown: () => void }): ReactNode {
  const context = useFloatingContext("FloatingBackdrop");
  const owner = useContext(DismissableLayerOwnerContext);
  if (!context.open) return null;
  const backdrop = <div aria-hidden="true" className="ui-menu__backdrop" data-component="select-backdrop" {...(owner == null ? {} : { [DISMISSABLE_LAYER_OWNER_ATTRIBUTE]: owner })} onPointerDown={onPointerDown} />;
  if (typeof document === "undefined" || document.body == null) return backdrop;
  return createPortal(backdrop, document.body);
}

interface FloatingRootProps {
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly placement?: SandFloatingPlacement;
  readonly offset?: number;
  readonly closeOnOutsidePress?: boolean;
  readonly closeOnEscape?: boolean;
  readonly returnFocus?: boolean;
}

function FloatingRoot({ children, open: controlledOpen, defaultOpen = false, onOpenChange, placement = "bottom-start", offset = 4, closeOnOutsidePress = true, closeOnEscape = true, returnFocus = true }: FloatingRootProps): ReactNode {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const anchorRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const setOpen = useCallback((next: boolean) => { if (controlledOpen == null) setUncontrolledOpen(next); onOpenChange?.(next); }, [controlledOpen, onOpenChange]);
  const context = useMemo<FloatingContextValue>(() => ({ anchorRef, close: () => setOpen(false), closeOnEscape, closeOnOutsidePress, open, offset, placement, returnFocus, setAnchor: (node) => { anchorRef.current = node; }, setOpen, surfaceRef }), [closeOnEscape, closeOnOutsidePress, offset, open, placement, returnFocus, setOpen]);
  useDismissal(context);
  return <FloatingContext.Provider value={context}>{children}</FloatingContext.Provider>;
}

export interface SandPopoverProps extends FloatingRootProps {
  readonly children: ReactNode;
  readonly content: ReactNode;
  readonly ariaLabel?: string;
  readonly role?: "dialog" | "region";
  readonly contentStyle?: CSSProperties;
}

export function SandPopover({ children, content, ariaLabel, role = "dialog", contentStyle, ...rootProps }: SandPopoverProps): ReactNode {
  return <FloatingRoot {...rootProps}><SandFloatingTrigger popupRole="dialog">{children}</SandFloatingTrigger><FloatingSurface ariaLabel={ariaLabel} role={role} style={contentStyle}>{content}</FloatingSurface></FloatingRoot>;
}

function SandFloatingTrigger({ children, popupRole }: { readonly children: ReactNode; readonly popupRole?: "dialog" | "listbox" }): ReactNode {
  const context = useFloatingContext("SandFloatingTrigger");
  if (!isValidElement(children)) return children;
  return cloneWithRef(children, context.setAnchor, { "aria-expanded": context.open, "aria-haspopup": popupRole, onClick: (event: ReactMouseEvent) => { (children.props as { onClick?: (event: ReactMouseEvent) => void }).onClick?.(event); if (!event.defaultPrevented) context.setOpen(!context.open); } });
}

export interface SandTooltipProps {
  readonly children: ReactElement;
  readonly content: ReactNode;
  readonly placement?: SandFloatingPlacement;
  readonly offset?: number;
  readonly openDelay?: number;
  readonly closeDelay?: number;
  readonly disabled?: boolean;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly ariaLabel?: string;
  readonly width?: number | string;
  readonly minWidth?: number | string;
  readonly maxWidth?: number | string;
  readonly sameAxisOnly?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function SandTooltip({ children, content, placement = "top", offset = 8, openDelay = 30, closeDelay = 300, disabled = false, defaultOpen = false, open: controlledOpen, ariaLabel, width, minWidth, maxWidth, onOpenChange }: SandTooltipProps): ReactNode {
  const [hoverOpen, setHoverOpen] = useState(defaultOpen);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = controlledOpen ?? hoverOpen;
  const setOpen = (next: boolean) => { if (controlledOpen == null) setHoverOpen(next); onOpenChange?.(next); };
  const schedule = (next: boolean, delay: number) => { if (timerRef.current != null) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => setOpen(next), delay); };
  useEffect(() => () => { if (timerRef.current != null) clearTimeout(timerRef.current); }, []);
  const trigger = cloneElement(children, {
    "data-base-ui-tooltip-trigger": disabled ? undefined : "",
    onFocus: (event: FocusEvent) => { (children.props as { onFocus?: (event: FocusEvent) => void }).onFocus?.(event); if (!disabled) schedule(true, openDelay); },
    onMouseEnter: (event: MouseEvent) => { (children.props as { onMouseEnter?: (event: MouseEvent) => void }).onMouseEnter?.(event); if (!disabled) schedule(true, openDelay); },
    onMouseLeave: (event: MouseEvent) => { (children.props as { onMouseLeave?: (event: MouseEvent) => void }).onMouseLeave?.(event); if (!disabled) schedule(false, closeDelay); },
  } as never);
  return <FloatingRoot open={open} onOpenChange={setOpen} placement={placement} offset={offset} closeOnOutsidePress={false} closeOnEscape={false} returnFocus={false}>
    <SandFloatingTrigger>{trigger}</SandFloatingTrigger>
    <FloatingSurface ariaLabel={ariaLabel} className="ui-menu__tooltip" dataComponent="tooltip-popup" role="tooltip" style={{ width, minWidth, maxWidth }}>{content}</FloatingSurface>
  </FloatingRoot>;
}

export interface SandMenuRootProps extends FloatingRootProps {
  readonly children: ReactNode;
  readonly activeIndex?: number | null;
  readonly onActiveIndexChange?: (index: number | null) => void;
  readonly closeOnSelect?: boolean;
  readonly focusItemOnOpen?: boolean;
  readonly virtualFocus?: boolean;
  readonly flip?: boolean;
}

interface MenuContextValue extends FloatingContextValue {
  readonly activeIndex: number | null;
  readonly closeOnSelect: boolean;
  readonly focusItemOnOpen: boolean;
  readonly virtualFocus: boolean;
  readonly setActiveIndex: (index: number | null) => void;
  readonly registerItem: (index: number, node: HTMLElement | null) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);
function useMenuContext(name: string): MenuContextValue { const value = useContextValue(MenuContext); if (value == null) throw new Error(`${name} must be used within LegacyMenu`); return value; }

export function SandMenuRoot({ children, activeIndex: controlledActiveIndex, onActiveIndexChange, closeOnSelect = true, focusItemOnOpen = false, virtualFocus = false, ...rootProps }: SandMenuRootProps): ReactNode {
  const [activeIndex, setUncontrolledActiveIndex] = useState<number | null>(null);
  const itemRefs = useRef(new Map<number, HTMLElement>());
  const floating = useFloatingContextValue(rootProps);
  const currentActiveIndex = controlledActiveIndex ?? activeIndex;
  const setActiveIndex = (next: number | null) => { if (controlledActiveIndex == null) setUncontrolledActiveIndex(next); onActiveIndexChange?.(next); };
  const menu = useMemo<MenuContextValue>(() => ({ ...floating, activeIndex: currentActiveIndex, closeOnSelect, focusItemOnOpen, registerItem: (index, node) => { if (node == null) itemRefs.current.delete(index); else itemRefs.current.set(index, node); }, setActiveIndex, virtualFocus }), [closeOnSelect, currentActiveIndex, floating, focusItemOnOpen, virtualFocus]);
  useEffect(() => { if (floating.open && focusItemOnOpen && currentActiveIndex != null) itemRefs.current.get(currentActiveIndex)?.focus({ preventScroll: true }); }, [currentActiveIndex, floating.open, focusItemOnOpen]);
  useDismissal(floating);
  return <MenuContext.Provider value={menu}><FloatingContext.Provider value={floating}>{children}</FloatingContext.Provider></MenuContext.Provider>;
}

function useFloatingContextValue(rootProps: Omit<FloatingRootProps, "children">): FloatingContextValue {
  const [open, setOpen] = useState(rootProps.open ?? rootProps.defaultOpen ?? false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const controlled = rootProps.open !== undefined;
  const currentOpen = controlled ? rootProps.open === true : open;
  const set = useCallback((next: boolean) => { if (!controlled) setOpen(next); rootProps.onOpenChange?.(next); }, [controlled, rootProps.onOpenChange]);
  return useMemo(() => ({ anchorRef, close: () => set(false), closeOnEscape: rootProps.closeOnEscape ?? true, closeOnOutsidePress: rootProps.closeOnOutsidePress ?? true, open: currentOpen, offset: rootProps.offset ?? 4, placement: rootProps.placement ?? "bottom-start", returnFocus: rootProps.returnFocus ?? true, setAnchor: (node) => { anchorRef.current = node; }, setOpen: set, surfaceRef }), [currentOpen, rootProps.closeOnEscape, rootProps.closeOnOutsidePress, rootProps.offset, rootProps.placement, rootProps.returnFocus, set]);
}

export function SandMenuTrigger({ children }: { readonly children: ReactElement }): ReactNode {
  const context = useMenuContext("SandMenuTrigger");
  return cloneWithRef(children, context.setAnchor, { "aria-expanded": context.open, "aria-haspopup": "menu", onClick: (event: ReactMouseEvent) => { (children.props as { onClick?: (event: ReactMouseEvent) => void }).onClick?.(event); if (!event.defaultPrevented) context.setOpen(!context.open); } });
}

export function SandMenuContent({ children, ariaLabel = "Menu", className, style }: { readonly children: ReactNode; readonly ariaLabel?: string; readonly className?: string; readonly style?: CSSProperties }): ReactNode {
  const context = useMenuContext("SandMenuContent");
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-component="menu-row"]')].filter((item) => item.getAttribute("aria-disabled") !== "true");
    if (items.length === 0) return;
    const current = document.activeElement instanceof HTMLElement ? items.indexOf(document.activeElement) : -1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const direction = event.key === "ArrowDown" ? 1 : -1; const next = (current + direction + items.length) % items.length; context.setActiveIndex(next); if (!context.virtualFocus) items[next]?.focus({ preventScroll: true }); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); const next = event.key === "Home" ? 0 : items.length - 1; context.setActiveIndex(next); if (!context.virtualFocus) items[next]?.focus({ preventScroll: true }); }
    else if (event.key === "Escape") { event.preventDefault(); context.close(); context.anchorRef.current?.focus({ preventScroll: true }); }
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) { const index = items.findIndex((item) => (item.textContent ?? "").trim().toLowerCase().startsWith(event.key.toLowerCase())); if (index >= 0) { context.setActiveIndex(index); if (!context.virtualFocus) items[index]?.focus({ preventScroll: true }); } }
  };
  return <FloatingSurface ariaLabel={ariaLabel} className={`ui-menu__content${className == null ? "" : ` ${className}`}`} dataComponent="menu-popup" role="menu" style={style}><div className="ui-menu__list" data-component="menu-list" onKeyDown={onKeyDown}>{children}</div></FloatingSurface>;
}

export function SandMenuItem({ children, index = 0, disabled = false, selected = false, onSelect, role = "menuitem" }: { readonly children: ReactNode; readonly index?: number; readonly disabled?: boolean; readonly selected?: boolean; readonly onSelect?: () => void; readonly role?: "menuitem" | "menuitemcheckbox" | "menuitemradio" }): ReactNode {
  const context = useMenuContext("SandMenuItem");
  const ref = useCallback((node: HTMLElement | null) => context.registerItem(index, node), [context, index]);
  return <div
    aria-checked={role === "menuitemcheckbox" || role === "menuitemradio" ? selected : undefined}
    aria-disabled={disabled || undefined}
    className="ui-menu__row"
    data-component="menu-row"
    data-disabled={disabled || undefined}
    data-focused={context.activeIndex === index || undefined}
    data-selected={selected || undefined}
    onClick={() => { if (!disabled) { onSelect?.(); if (context.closeOnSelect) context.close(); } }}
    onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect?.(); if (context.closeOnSelect) context.close(); } }}
    ref={ref}
    role={role}
    style={selected ? { background: "var(--cursor-bg-selected)" } : undefined}
    tabIndex={disabled || context.virtualFocus ? -1 : context.activeIndex === index ? 0 : -1}
  >{children}</div>;
}

export interface SandContextMenuProps {
  readonly children: ReactElement;
  readonly content: ReactNode;
  readonly ariaLabel?: string;
  readonly open?: { readonly x: number; readonly y: number } | null;
  readonly onOpenChange?: (open: { readonly x: number; readonly y: number } | null) => void;
  readonly closeOnSelect?: boolean;
  readonly virtualFocus?: boolean;
}

export function SandContextMenu({ children, content, ariaLabel = "Menu", open, onOpenChange, closeOnSelect = true, virtualFocus = false }: SandContextMenuProps): ReactNode {
  const [point, setPoint] = useState(open ?? null);
  const currentPoint = open === undefined ? point : open;
  const set = (next: { readonly x: number; readonly y: number } | null) => { if (open === undefined) setPoint(next); onOpenChange?.(next); };
  const anchorRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const context = useMemo<FloatingContextValue>(() => ({ anchorRef, close: () => set(null), closeOnEscape: true, closeOnOutsidePress: true, open: currentPoint != null, offset: 0, placement: "bottom-start", returnFocus: true, setAnchor: (node) => { anchorRef.current = node; }, setOpen: (next) => { if (!next) set(null); }, surfaceRef }), [currentPoint, onOpenChange]);
  useDismissal(context);
  const trigger = cloneWithRef(children, (node) => { anchorRef.current = node; }, {
    onContextMenu: (event: ReactMouseEvent) => { (children.props as { onContextMenu?: (event: ReactMouseEvent) => void }).onContextMenu?.(event); if (!event.defaultPrevented) { event.preventDefault(); set({ x: event.clientX, y: event.clientY }); } },
    onKeyDown: (event: ReactKeyboardEvent) => { (children.props as { onKeyDown?: (event: ReactKeyboardEvent) => void }).onKeyDown?.(event); if (!event.defaultPrevented && event.shiftKey && event.key === "F10") { event.preventDefault(); const rect = (event.currentTarget as HTMLElement).getBoundingClientRect(); set({ x: rect.left, y: rect.bottom }); } },
  } as never);
  return <FloatingContext.Provider value={context}><div data-context-menu-trigger="true">{trigger}</div><FloatingSurface ariaLabel={ariaLabel} className="ui-menu__content" dataComponent="menu-popup" role="menu" style={{ left: currentPoint?.x ?? 8, top: currentPoint?.y ?? 8 }}>{content}</FloatingSurface></FloatingContext.Provider>;
}

export interface SandSelectOption<T extends string | number = string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly labelMeta?: ReactNode;
  readonly disabled?: boolean;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
}

export interface SandSelectProps<T extends string | number = string> {
  readonly value?: T;
  readonly defaultValue?: T;
  readonly onValueChange?: (value: T) => void;
  readonly options: readonly SandSelectOption<T>[];
  readonly placeholder?: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly placement?: SandFloatingPlacement;
  readonly offset?: number;
  readonly menuSize?: "sm" | "md";
  readonly contentWidth?: number | string;
  readonly matchAnchorWidth?: boolean;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function SandSelect<T extends string | number = string>({ value: controlledValue, defaultValue, onValueChange, options, placeholder, open, defaultOpen = false, onOpenChange, placement = "bottom-start", offset = 4, menuSize = "sm", contentWidth, matchAnchorWidth = false, disabled = false, ariaLabel = "Select an option", className }: SandSelectProps<T>): ReactNode {
  const [value, setValue] = useState<T | undefined>(controlledValue ?? defaultValue);
  const [isOpen, setIsOpen] = useState(open ?? defaultOpen);
  const selected = options.find((option) => option.value === (controlledValue ?? value));
  const actualOpen = open ?? isOpen;
  const updateOpen = (next: boolean) => { if (open === undefined) setIsOpen(next); onOpenChange?.(next); };
  const select = (next: T) => { if (controlledValue === undefined) setValue(next); onValueChange?.(next); updateOpen(false); };
  return <FloatingRoot open={actualOpen} onOpenChange={updateOpen} placement={placement} offset={offset}>
    <SandFloatingTrigger popupRole="listbox"><button aria-expanded={actualOpen} aria-haspopup="listbox" aria-label={ariaLabel} className={className} disabled={disabled} type="button">{selected?.label ?? placeholder}</button></SandFloatingTrigger>
    <FloatingBackdrop onPointerDown={() => updateOpen(false)} />
    <FloatingSurface className="ui-menu__content" dataComponent="select-popup" role="listbox" ariaLabel={ariaLabel} style={{ minWidth: matchAnchorWidth ? "var(--anchor-width)" : contentWidth ?? 200 }}>
      <div className="ui-menu__layout" data-component="select-positioner" data-size={menuSize}>
        {options.map((option, index) => <div aria-disabled={option.disabled || undefined} aria-selected={option.value === selected?.value} className="ui-menu__row" data-component="select-item" data-index={index} key={String(option.value)} onClick={() => { if (!option.disabled) select(option.value); }} onKeyDown={(event) => { if (!option.disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); select(option.value); } }} role="option" tabIndex={option.disabled ? -1 : 0}>{option.leading}{option.label}{option.labelMeta}{option.trailing}{option.value === selected?.value ? <span aria-hidden="true" data-component="select-item-indicator">✓</span> : null}</div>)}
      </div>
    </FloatingSurface>
  </FloatingRoot>;
}
