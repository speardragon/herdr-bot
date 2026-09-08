import { type KeyboardEvent, type ReactNode } from "react";

import "./sand-menu-item.css";

// Immutable Mac renderer: index-UbX-y3il.js, SHA-256
// ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=403791 (menu item left/content/right structure)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=408935 (description projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=409356 (menu row role/state contract)
// Immutable Windows renderer: recovered/frontend/app/assets/index-UbX-y3il.js, SHA-256
// 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5.
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=526459 (menu item left/content/right structure)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=533067 (description projection)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=533594 (menu row role/state contract)

export type SandMenuItemKind = "item" | "radio" | "checkbox";
export type SandMenuItemVariant = "default" | "muted";

export interface SandMenuItemProps {
  readonly children: ReactNode;
  readonly description?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly kind?: SandMenuItemKind;
  readonly checked?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly focused?: boolean;
  readonly indent?: boolean;
  readonly variant?: SandMenuItemVariant;
  readonly tabIndex?: number;
  readonly onSelect?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}

function menuItemRole(kind: SandMenuItemKind): "menuitem" | "menuitemradio" | "menuitemcheckbox" {
  if (kind === "radio") return "menuitemradio";
  if (kind === "checkbox") return "menuitemcheckbox";
  return "menuitem";
}

export function SandMenuItem({ children, description, leading, trailing, kind = "item", checked, selected = false, disabled = false, focused = false, indent = false, variant = "default", tabIndex = disabled ? -1 : 0, onSelect, onKeyDown }: SandMenuItemProps): ReactNode {
  const role = menuItemRole(kind);
  const hasDescription = description != null;
  const rootClassName = [
    "ui--default-marker", "ui-78zum5", "ui-1q0g3np", "ui-6s0dn4", "ui-9f619", "ui-bpgt9h", "ui-1kk7d6x", "ui-1k57tk5", "ui-1xgckd", "ui-9cta2o", "ui-1mv37q2", "ui-1166h4g", "ui-1w5zb4f", "ui-1ypdohk", "ui-jbqb8w",
    selected ? "ui-i07v4r" : null,
    focused ? "ui-flfp0o" : null,
    disabled ? "ui-4b2ntj ui-t0e3qv" : null,
    hasDescription ? "ui-1cy8zhl" : null,
    indent ? "ui-20x7kn" : null,
  ].filter(Boolean).join(" ");
  const leadingClassName = ["ui-2lah0s", "ui-r88yfa", "ui-3nfvp2", "ui-6s0dn4", "ui-l56j7k", "ui-1kvrb00", "ui-1gv9yxp", hasDescription ? "ui-1cy8zhl ui-uve7l6" : null].filter(Boolean).join(" ");
  const contentClassName = "ui-98rzlu ui-euugli ui-78zum5 ui-6s0dn4 ui-1qughib";
  const rightClassName = "ui-2lah0s ui-78zum5 ui-6s0dn4 ui-19aaqeu";
  const onItemKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.();
    }
  };
  return <div aria-checked={kind === "item" ? undefined : checked} aria-disabled={disabled || undefined} className={rootClassName} data-component="menu-row" data-disabled={disabled || undefined} data-focused={focused || undefined} data-has-description={hasDescription || undefined} data-indent={indent || undefined} data-selected={selected || undefined} data-variant={variant === "default" ? undefined : variant} onClick={disabled ? undefined : onSelect} onKeyDown={onItemKeyDown} role={role} tabIndex={tabIndex}>
    {leading == null ? null : <span className={leadingClassName} data-component="menu-item-left">{leading}</span>}
    <div className={contentClassName} data-component="menu-item-content">
      {description == null ? children : <><div>{children}</div><div className="ui-20ajya ui-4b2ntj" data-component="menu-item-description">{description}</div></>}
    </div>
    {trailing == null ? null : <span className={rightClassName} data-component="menu-item-right">{trailing}</span>}
  </div>;
}
