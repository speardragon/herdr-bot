import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CSSProperties, type InputEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";

import "./sand-form-primitives.css";
import { SandIcon } from "./sand-kit-primitives";

// Immutable Mac renderer: index-UbX-y3il.js, SHA-256
// ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=270241 (ui-input-group__input and InputGroup.Root contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=271497 (ui-input-group__textarea and textarea lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=189583 (ui-checkbox__box / ui-checkbox__icon)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=188841 (checkbox state/data-component contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=439095 (switch state/data-component contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2746820 (tablist/tab/aria-selected contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=355541 (Windows InputGroup contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=249014 (Windows checkbox contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=566642 (Windows switch contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=3517542 (Windows tablist/tab contract)
// Windows renderer: recovered/frontend/app/assets/index-UbX-y3il.js, SHA-256
// 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5.

export type SandFormSize = "sm" | "md" | "lg";
export type SandInputSize = "base" | "lg" | "xl";
export type SandControlVariant = "primary" | "green" | "neutral" | "monochrome";

const CHECKBOX_ICON_SIZES: Record<SandFormSize, number> = { sm: 9, md: 10, lg: 11 };

interface SandFieldProps {
  readonly id?: string;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

function fieldMessageId(id: string | undefined): string | undefined { return id == null ? undefined : `${id}-message`; }

function SandField({ id, label, description, error, required = false, disabled = false, children }: SandFieldProps): ReactNode {
  const message = error ?? description;
  const messageId = fieldMessageId(id);
  return <div data-component="field" data-disabled={disabled || undefined} data-invalid={error != null || undefined}>
    {label == null ? null : <label htmlFor={id}>{label}{required ? <span aria-hidden="true">*</span> : null}</label>}
    {children}
    {message == null ? null : <div aria-live={error == null ? undefined : "polite"} id={messageId} role={error == null ? undefined : "alert"}>{message}</div>}
  </div>;
}

export interface SandTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly size?: SandInputSize;
  readonly variant?: "default" | "elevated" | "ghost" | "unfilled";
  readonly frame?: "container" | "content";
  readonly shape?: "rounded" | "pill";
  readonly mono?: boolean;
}

export function SandTextField({ id, label, description, error, required = false, size = "base", variant = "default", frame = "container", shape = "rounded", mono = false, disabled = false, className, "aria-describedby": ariaDescribedBy, ...inputProps }: SandTextFieldProps): ReactNode {
  const messageId = fieldMessageId(id);
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(" ") || undefined;
  return <SandField disabled={disabled} description={description} error={error} id={id} label={label} required={required}>
    <div className="ui-input-group" data-disabled={disabled || undefined} data-frame={frame} data-invalid={error != null || undefined} data-shape={shape === "rounded" ? undefined : shape} data-size={size} data-variant={variant} data-mono={mono || undefined}>
      <input aria-describedby={describedBy} aria-invalid={error != null || undefined} className={`ui-input-group__input${className == null ? "" : ` ${className}`}`} disabled={disabled} id={id} required={required} {...inputProps} />
    </div>
  </SandField>;
}

export interface SandTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly size?: SandInputSize;
  readonly minRows?: number;
  readonly maxRows?: number;
  readonly autoResize?: boolean;
}

export function SandTextarea({ id, label, description, error, required = false, size = "base", minRows = 1, maxRows, autoResize = true, disabled = false, className, "aria-describedby": ariaDescribedBy, onInput, rows, ...textareaProps }: SandTextareaProps): ReactNode {
  const messageId = fieldMessageId(id);
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(" ") || undefined;
  const resolvedRows = rows ?? minRows;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => {
    if (!autoResize) return;
    const textarea = textareaRef.current;
    if (textarea == null || typeof window === "undefined") return;
    const minimumRows = Math.max(1, minRows);
    const maximumRows = maxRows == null ? undefined : Math.max(minimumRows, maxRows);
    if (maximumRows === minimumRows && (rows === undefined || rows === minimumRows)) {
      textarea.style.height = "";
      textarea.style.overflowY = "auto";
      return;
    }
    textarea.style.height = "auto";
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight);
    const padding = (Number.parseFloat(computed.paddingTop) || 0) + (Number.parseFloat(computed.paddingBottom) || 0);
    const border = (Number.parseFloat(computed.borderTopWidth) || 0) + (Number.parseFloat(computed.borderBottomWidth) || 0);
    const extra = padding + border;
    const minimumHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? extra + lineHeight * minimumRows : 0;
    const maximumHeight = maximumRows !== undefined && Number.isFinite(lineHeight) && lineHeight > 0 ? extra + lineHeight * maximumRows : undefined;
    const height = Math.max(textarea.scrollHeight, minimumHeight);
    textarea.style.height = `${maximumHeight === undefined ? height : Math.min(height, maximumHeight)}px`;
    textarea.style.overflowY = maximumHeight !== undefined && textarea.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, [autoResize, maxRows, minRows, rows]);
  useLayoutEffect(() => { resize(); }, [resize, textareaProps.value]);
  const handleInput = (event: InputEvent<HTMLTextAreaElement>) => { onInput?.(event); if (!event.defaultPrevented) resize(); };
  return <SandField disabled={disabled} description={description} error={error} id={id} label={label} required={required}>
    <div className="ui-input-group" data-disabled={disabled || undefined} data-invalid={error != null || undefined} data-layout="textarea" data-size={size}>
      <textarea {...textareaProps} aria-describedby={describedBy} aria-invalid={error != null || undefined} className={`ui-input-group__textarea${className == null ? "" : ` ${className}`}`} disabled={disabled} id={id} data-max-rows={maxRows ?? undefined} data-auto-resize={autoResize || undefined} onInput={handleInput} ref={textareaRef} rows={resolvedRows} />
    </div>
  </SandField>;
}

export interface SandCheckboxProps {
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  readonly indeterminate?: boolean;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly label?: ReactNode;
  readonly size?: SandFormSize;
  readonly variant?: Exclude<SandControlVariant, "monochrome">;
  readonly name?: string;
  readonly value?: string;
  readonly id?: string;
}

export function SandCheckbox({ checked: controlledChecked, defaultChecked = false, onCheckedChange, indeterminate = false, disabled = false, required = false, label, size = "md", variant = "primary", name, value, id }: SandCheckboxProps): ReactNode {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isControlled = controlledChecked !== undefined;
  const isChecked = isControlled ? controlledChecked : uncontrolledChecked;
  useEffect(() => { if (inputRef.current != null) inputRef.current.indeterminate = indeterminate; }, [indeterminate]);
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setUncontrolledChecked(event.currentTarget.checked);
    onCheckedChange?.(event.currentTarget.checked, event);
  };
  return <label data-disabled={disabled || undefined}>
    <input aria-checked={isChecked} checked={isControlled ? isChecked : undefined} defaultChecked={isControlled ? undefined : defaultChecked} disabled={disabled} id={id} name={name} onChange={onChange} ref={inputRef} required={required} style={{ blockSize: 1, clipPath: "inset(50%)", clip: "rect(0 0 0 0)", inlineSize: 1, overflow: "hidden", position: "absolute", whiteSpace: "nowrap" }} type="checkbox" value={value} />
    <span aria-hidden="true" className="ui-checkbox" data-checked={isChecked || undefined} data-component="checkbox" data-disabled={disabled || undefined} data-indeterminate={indeterminate || undefined} data-size={size} data-variant={variant}>
      <span className="ui-checkbox__box" style={{ background: isChecked || indeterminate ? "var(--cursor-bg-accent)" : "var(--cursor-bg-input)", borderColor: isChecked || indeterminate ? "var(--cursor-bg-accent)" : "var(--cursor-stroke-secondary)" }}><span className="ui-checkbox__icon">{indeterminate || isChecked ? <SandIcon name={indeterminate ? "minus" : "check"} size={CHECKBOX_ICON_SIZES[size]} style={{ "--icon-weight": "700" } as CSSProperties} /> : null}</span></span>
    </span>
    {label == null ? null : <span>{label}</span>}
  </label>;
}

export interface SandSwitchProps {
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly label?: ReactNode;
  readonly size?: "sm" | "regular" | "md" | "lg";
  readonly variant?: SandControlVariant;
  readonly id?: string;
}

export function SandSwitch({ checked: controlledChecked, defaultChecked = false, onCheckedChange, disabled = false, label, size = "md", variant = "green", id }: SandSwitchProps): ReactNode {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(defaultChecked);
  const isControlled = controlledChecked !== undefined;
  const isChecked = isControlled ? controlledChecked : uncontrolledChecked;
  const toggle = () => { const next = !isChecked; if (!isControlled) setUncontrolledChecked(next); onCheckedChange?.(next); };
  return <label htmlFor={id} data-disabled={disabled || undefined}>
    <button aria-checked={isChecked} disabled={disabled} id={id} onClick={toggle} role="switch" type="button">
      <span aria-hidden="true" data-checked={isChecked || undefined} data-component="switch" data-disabled={disabled || undefined} data-size={size} data-variant={variant} style={{ background: isChecked ? "var(--cursor-bg-accent)" : "var(--cursor-bg-tertiary)" }}><span style={{ transform: isChecked ? "translateX(16px)" : "translateX(0)" }} /></span>
    </button>
    {label == null ? null : <span>{label}</span>}
  </label>;
}

export interface SandTabItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export interface SandTabsProps {
  readonly items: readonly SandTabItem[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly ariaLabel?: string;
  readonly orientation?: "horizontal" | "vertical";
}

export function resolveSandTabNavigation(items: readonly SandTabItem[], index: number, key: string, orientation: "horizontal" | "vertical" = "horizontal"): string | null {
  if (items.length === 0) return null;
  if (key === "Home") return items.find((item) => !item.disabled)?.id ?? null;
  if (key === "End") return [...items].reverse().find((item) => !item.disabled)?.id ?? null;
  const forward = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  const backward = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  const direction = key === forward ? 1 : key === backward ? -1 : 0;
  if (direction === 0) return null;
  for (let step = 1; step <= items.length; step += 1) {
    const next = (index + direction * step + items.length) % items.length;
    if (!items[next]?.disabled) return items[next].id;
  }
  return null;
}

export function SandTabs({ items, value: controlledValue, defaultValue, onValueChange, ariaLabel = "Tabs", orientation = "horizontal" }: SandTabsProps): ReactNode {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? items.find((item) => !item.disabled)?.id ?? items[0]?.id ?? "");
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const value = controlledValue ?? uncontrolledValue;
  const select = (next: string) => { if (controlledValue === undefined) setUncontrolledValue(next); onValueChange?.(next); };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const backward = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    if (event.key === forward || event.key === backward || event.key === "Home" || event.key === "End") { event.preventDefault(); const next = resolveSandTabNavigation(items, index, event.key, orientation); if (next != null) { select(next); tabRefs.current.get(next)?.focus({ preventScroll: true }); } }
  };
  return <div aria-label={ariaLabel} aria-orientation={orientation} role="tablist">
    {items.map((item, index) => <button aria-selected={item.id === value} disabled={item.disabled} onClick={() => select(item.id)} onKeyDown={(event) => onKeyDown(event, index)} ref={(node) => { if (node == null) tabRefs.current.delete(item.id); else tabRefs.current.set(item.id, node); }} role="tab" tabIndex={item.id === value ? 0 : -1} type="button" key={item.id}>{item.label}</button>)}
  </div>;
}

export interface SandTabPanelProps { readonly id: string; readonly tabId: string; readonly active: boolean; readonly children: ReactNode; readonly style?: CSSProperties; }

export function SandTabPanel({ id, tabId, active, children, style }: SandTabPanelProps): ReactNode {
  return <div aria-hidden={!active || undefined} aria-labelledby={tabId} hidden={!active} id={id} role="tabpanel" style={style}>{children}</div>;
}
