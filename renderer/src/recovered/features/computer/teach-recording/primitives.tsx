import type { ButtonHTMLAttributes, ReactNode } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2192181 (Qs; exact kit-button contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=2787234 (Qs; Windows kit-button contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#sha256=ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa#byteOffset=2172121 (fr; exact icon-button contract)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#sha256=80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5#byteOffset=2762087 (fr; Windows icon-button contract)

const KIT_BUTTON_BASE = "sand-kit-button sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-1jnr06f sand-2lah0s sand-9f619 sand-c342km sand-ng3xce sand-jbqb8w sand-uxw1ft sand-1ypdohk sand-tgyt42 sand-s2xxs2 sand-gdialr sand-9lcvmn sand-1k57tk5 sand-784prv sand-1t137rt sand-9v5kkp sand-4sht9k sand-1y3gkto";
const KIT_BUTTON_SM = `${KIT_BUTTON_BASE} sand-fifm61 sand-1d3mw78 sand-12oo3zp sand-1iorvi4 sand-1ug7bdz sand-jkvuk6 sand-11iknt3 sand-1kogg8i`;
const KIT_BUTTON_PRIMARY = `${KIT_BUTTON_SM} sand-1wclgxm sand-1e15362 sand-1gzh0bn sand-xcaa6e sand-g7klql`;
const KIT_BUTTON_SECONDARY = `${KIT_BUTTON_SM} sand-1tiofj7 sand-ex9vrg sand-wj1584 sand-tyxrsu sand-g7klql`;
const ICON_BUTTON_SM = "sand-kit-icon-button sand-1n2onr6 sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-9f619 sand-exx8yu sand-1xpa7k sand-18d9i69 sand-1uhho1l sand-c342km sand-ng3xce sand-jbqb8w sand-1ypdohk sand-tgyt42 sand-s2xxs2 sand-gdialr sand-9lcvmn sand-1k57tk5 sand-784prv sand-1t137rt sand-9v5kkp sand-4sht9k sand-1y3gkto sand-vy4d1p sand-xk0z11 sand-1kogg8i sand-1r8pydn sand-1o0liin sand-1fx2joi sand-7n8uir sand-99e291 sand-1v0sr2s";

const ICON_CODE_POINTS = {
  "arrows-contract-simple": 0xf2cd,
  close: 0xed82,
  square: 0xf3f7
} as const;

export type TeachIconName = keyof typeof ICON_CODE_POINTS;

export function TeachIcon({ name, size = "sm" }: { name: TeachIconName; size?: "sm" | "md" }): ReactNode {
  return <span aria-hidden="true" data-icon-name={name} data-size={size} style={{ fontFamily: "cursor-icons" }}>{String.fromCodePoint(ICON_CODE_POINTS[name])}</span>;
}

export function TeachRecordingMark(): ReactNode {
  return <svg aria-hidden="true" className="sand-1lliihq sand-2lah0s sand-1heor9g" fill="none" height="18" viewBox="0 0 18 18" width="18">
    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="9" cy="9" fill="currentColor" r="3.2" />
  </svg>;
}

export interface TeachButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  leadingIcon?: TeachIconName;
  variant?: "primary" | "secondary";
  size?: "sm";
  shape?: "rectangular" | "pill";
}

export function TeachButton({
  children,
  className = "",
  disabled = false,
  leadingIcon,
  pending = false,
  shape = "rectangular",
  size = "sm",
  variant = "primary",
  ...props
}: TeachButtonProps): ReactNode {
  const variantClass = variant === "primary" ? KIT_BUTTON_PRIMARY : KIT_BUTTON_SECONDARY;
  return <button
    {...props}
    aria-busy={pending || undefined}
    className={`${variantClass}${shape === "pill" ? " sand-1i4c3av sand-12ffz05" : ""}${className.length === 0 ? "" : ` ${className}`}`}
    data-sentiment="neutral"
    data-shape={shape}
    data-size={size}
    data-variant={variant}
    disabled={disabled || pending}
    type={props.type ?? "button"}
  >{leadingIcon == null ? null : <TeachIcon name={leadingIcon} />}{children}</button>;
}

export interface TeachIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: TeachIconName;
  label: string;
}

export function TeachIconButton({ className = "", icon, label, ...props }: TeachIconButtonProps): ReactNode {
  return <button
    {...props}
    aria-label={label}
    className={`${ICON_BUTTON_SM}${className.length === 0 ? "" : ` ${className}`}`}
    data-size="sm"
    data-variant="ghost"
    title={props.title ?? label}
    type={props.type ?? "button"}
  ><TeachIcon name={icon} /></button>;
}
