import { type CSSProperties, type ReactNode } from "react";

import "./sand-status-primitives.css";

// Immutable Mac renderer: index-UbX-y3il.js, SHA-256
// ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=535311 (progress ring track/fill and size contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=537709 (menu loading contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=423483 (legacy menu empty contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=516206 (menu separator contract)
// Immutable Windows renderer: recovered/frontend/app/assets/index-UbX-y3il.js, SHA-256
// 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5.
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=689034 (progress ring track/fill and size contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=691935 (menu loading contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=551449 (legacy menu empty contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=665929 (menu separator contract)

export type SandSpinnerSize = "xs" | "sm" | "md" | "lg" | number;

const spinnerDimensions: Record<Exclude<SandSpinnerSize, number>, number> = { xs: 11, sm: 14, md: 18, lg: 24 };

export interface SandSpinnerProps {
  readonly size?: SandSpinnerSize;
  readonly value?: number;
  readonly indeterminate?: boolean;
  readonly paused?: boolean;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

function resolveSpinnerSize(size: SandSpinnerSize): number {
  if (typeof size === "number") return Number.isFinite(size) ? Math.max(1, size) : spinnerDimensions.sm;
  return spinnerDimensions[size];
}

export function SandSpinner({ size = "sm", value = 0, indeterminate = true, paused = false, ariaLabel, className, style }: SandSpinnerProps): ReactNode {
  const dimension = resolveSpinnerSize(size);
  const normalized = Math.min(1, Math.max(0, value));
  const circumference = 2 * Math.PI * 6;
  const dash = circumference * (indeterminate ? 0.16 : normalized);
  const rootClassName = ["ui-progress", "ui-progress-ring", indeterminate ? "ui-progress-indeterminate" : null, paused ? "ui-progress-paused" : null, className].filter(Boolean).join(" ");
  return <div aria-busy={indeterminate || undefined} aria-label={ariaLabel} aria-valuemax={indeterminate ? undefined : 100} aria-valuemin={indeterminate ? undefined : 0} aria-valuenow={indeterminate ? undefined : Math.round(normalized * 100)} role={ariaLabel == null ? undefined : "progressbar"} className={rootClassName} style={{ ...style, width: dimension, height: dimension }}>
    <svg aria-hidden="true" fill="none" height={dimension + 2} viewBox="0 0 16 16" width={dimension + 2}>
      <circle className="ui-progress-ring-track" cx="8" cy="8" fill="none" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle className="ui-progress-ring-fill" cx="8" cy="8" fill="none" r="6" stroke="currentColor" strokeDasharray={`${dash} ${circumference - dash}`} strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  </div>;
}

export interface SandMenuLoadingProps {
  readonly children?: ReactNode;
}

export function SandMenuLoading({ children = "Loading…" }: SandMenuLoadingProps): ReactNode {
  return <div aria-busy="true" aria-live="polite" data-component="menu-loading" role="status" className="ui-t0e3qv ui-4b2ntj ui-47corl">
    <SandSpinner indeterminate size="sm" />
    <span>{children}</span>
  </div>;
}

export interface SandMenuEmptyStateProps {
  readonly children?: ReactNode;
  readonly indent?: boolean;
}

export function SandMenuEmptyState({ children, indent = false }: SandMenuEmptyStateProps): ReactNode {
  return <div data-component="menu-empty" data-indent={indent || undefined} className="ui-t0e3qv ui-4b2ntj ui-47corl">{children}</div>;
}

export interface SandMenuSeparatorProps {
  readonly orientation?: "horizontal";
}

export function SandMenuSeparator({ orientation = "horizontal" }: SandMenuSeparatorProps): ReactNode {
  return <div aria-orientation={orientation} data-component="menu-separator" role="separator" className="ui-19kq4p1 ui-13fuv20 ui-5dbky9 ui-1rgg60y ui-qzfxv1 ui-105vx2c ui-1buce8w ui-47corl ui-2lah0s" />;
}
