import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import "./sand-kit-primitives.css";
import { sandIconGlyph, sandIconStyle } from "./sand-icon-registry";
import type { SandIconColor, SandIconName, SandIconPlatform, SandIconSize, SandIconVariant } from "./sand-icon-registry";

export { SAND_ICON_OUTLINE_CODE_POINTS as SAND_ICON_CODE_POINTS } from "./sand-icon-registry";
export type { SandIconColor, SandIconName, SandIconPlatform, SandIconSize, SandIconVariant } from "./sand-icon-registry";

// Immutable Mac renderer: index-UbX-y3il.js, SHA-256
// ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2173060 (sand-kit-icon-button contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2193087 (sand-kit-button contract)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2174833 (pill/chip contract)
// Windows equivalents: 2763354, 2788460, and 2765629 in recovered/frontend/app/assets/index-UbX-y3il.js.

const KIT_BUTTON_BASE = "sand-kit-button sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-1jnr06f sand-2lah0s sand-9f619 sand-c342km sand-ng3xce sand-jbqb8w sand-uxw1ft sand-1ypdohk sand-tgyt42 sand-s2xxs2 sand-gdialr sand-9lcvmn sand-1k57tk5 sand-784prv sand-1t137rt sand-9v5kkp sand-4sht9k sand-1y3gkto";
const KIT_BUTTON_SM = "sand-fifm61 sand-1d3mw78 sand-12oo3zp sand-1iorvi4 sand-1ug7bdz sand-jkvuk6 sand-11iknt3 sand-1kogg8i";
const ICON_BUTTON_BASE = "sand-kit-icon-button sand-1n2onr6 sand-3nfvp2 sand-6s0dn4 sand-l56j7k sand-2lah0s sand-9f619 sand-exx8yu sand-1xpa7k sand-18d9i69 sand-1uhho1l sand-c342km sand-ng3xce sand-jbqb8w sand-1ypdohk sand-tgyt42 sand-s2xxs2 sand-gdialr sand-9lcvmn sand-1k57tk5 sand-784prv sand-1t137rt sand-9v5kkp sand-4sht9k sand-1y3gkto sand-vy4d1p sand-xk0z11 sand-1kogg8i sand-1r8pydn sand-1o0liin sand-1fx2joi sand-7n8uir sand-99e291 sand-1v0sr2s";
const INSERTED_CHIP = "sand-inserted-chip";
const PILL_LABEL = "sand-1lliihq sand-b3r6kr sand-uxw1ft sand-3d5spo sand-1kpknzs sand-18qloa2 sand-pzgpc2 sand-gdialr sand-9lcvmn";
const BUTTON_SIZE_CLASSES = { sm: "sand-1iorvi4", md: "sand-1yrsyyn" } as const;
const BUTTON_SHAPE_CLASSES = { rectangular: undefined, pill: "sand-163pfp" } as const;
const BUTTON_SENTIMENT_CLASSES = {
  neutral: {
    primary: "sand-1wclgxm sand-1e15362 sand-1gzh0bn sand-xcaa6e sand-g7klql",
    secondary: "sand-1tiofj7 sand-ex9vrg sand-wj1584 sand-tyxrsu sand-g7klql",
  },
  accent: {
    primary: "sand-2uzfp6 sand-1p9r4uo sand-vygott sand-18ti0zn sand-1ksgq55",
    secondary: "sand-ctg3rd sand-dpopdx sand-1fuijle sand-n3e42v sand-1ksgq55",
  },
  danger: {
    primary: "sand-18he5m sand-io7yh0 sand-1kjf8sd sand-18ti0zn sand-1ww89vb",
    secondary: "sand-6y9aml sand-tly4hf sand-1yeru7p sand-6rl5ky sand-1ww89vb",
  },
} as const;
const ICON_SIZE_CLASSES = { sm: "sand-vy4d1p sand-xk0z11", md: "sand-gd8bvy", lg: "sand-exx8yu sand-18d9i69" } as const;
const ICON_SHAPE_CLASSES = { square: "sand-1kogg8i", circle: "sand-149ho13" } as const;
const ICON_VARIANT_CLASSES = { default: "sand-jbqb8w", ghost: "sand-jbqb8w sand-1r8pydn sand-7n8uir" } as const;
const SELECTED_CLASSES = "sand-ri19xs sand-eazifr";
const CHIP_VARIANT_CLASSES = { primary: "sand-luhinc sand-1q6ojev", secondary: undefined, ghost: "sand-1r8pydn" } as const;
const CHIP_SENTIMENT_CLASSES = { neutral: undefined, accent: "sand-2uzfp6", danger: "sand-18he5m" } as const;

export type SandButtonVariant = "primary" | "secondary";
export type SandButtonSize = "sm" | "md";
export type SandButtonShape = "rectangular" | "pill";
export type SandSentiment = "neutral" | "accent" | "danger";
export type SandIconButtonVariant = "default" | "ghost";
export type SandIconButtonSize = "sm" | "md" | "lg";
export type SandIconButtonShape = "square" | "circle";
export type SandPrimitiveVariant = "primary" | "secondary" | "ghost";

export interface SandIconProps {
  readonly name: SandIconName;
  readonly color?: SandIconColor;
  readonly className?: string;
  readonly platform?: SandIconPlatform;
  readonly size?: SandIconSize;
  readonly style?: CSSProperties;
  readonly title?: string;
  readonly variant?: SandIconVariant;
}

export function SandIcon({ className, color, name, platform, size = "sm", style, title, variant = "outline" }: SandIconProps): ReactNode {
  return <span
    aria-hidden={title == null ? "true" : undefined}
    className={joinClasses("ui-icon", className)}
    data-color={color}
    data-icon-name={name}
    data-size={typeof size === "number" ? undefined : size}
    data-variant={variant}
    style={{ ...sandIconStyle(size, color), ...style }}
    title={title}
  >{sandIconGlyph(name, variant, platform)}</span>;
}

function joinClasses(...classes: readonly (string | undefined)[]): string {
  return classes.filter((value): value is string => value != null && value.length > 0).join(" ");
}

export interface SandButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
  readonly children?: ReactNode;
  readonly pending?: boolean;
  readonly leadingIcon?: SandIconName;
  readonly trailingIcon?: SandIconName;
  readonly variant?: SandButtonVariant;
  readonly size?: SandButtonSize;
  readonly shape?: SandButtonShape;
  readonly sentiment?: SandSentiment;
}

export const SandButton = forwardRef<HTMLButtonElement, SandButtonProps>(function SandButton({
  children,
  className,
  disabled = false,
  leadingIcon,
  pending = false,
  shape = "rectangular",
  size = "md",
  sentiment = "neutral",
  trailingIcon,
  variant = "primary",
  type = "button",
  ...buttonProps
}, ref): ReactNode {
  return <button
    {...buttonProps}
    aria-busy={pending || buttonProps["aria-busy"] || undefined}
    className={joinClasses(KIT_BUTTON_BASE, size === "sm" ? KIT_BUTTON_SM : undefined, BUTTON_SIZE_CLASSES[size], BUTTON_SHAPE_CLASSES[shape], BUTTON_SENTIMENT_CLASSES[sentiment][variant], buttonProps["aria-pressed"] === true ? SELECTED_CLASSES : undefined, className)}
    data-sentiment={sentiment}
    data-shape={shape}
    data-size={size}
    data-variant={variant}
    disabled={disabled || pending}
    ref={ref}
    type={type}
  >
    {leadingIcon == null ? null : <SandIcon name={leadingIcon} />}
    <span className="sand-euugli sand-b3r6kr sand-lyipyv">{children}</span>
    {trailingIcon == null ? null : <SandIcon name={trailingIcon} />}
  </button>;
});

export interface SandIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color" | "children"> {
  readonly icon: SandIconName;
  readonly label?: string;
  readonly pending?: boolean;
  readonly platform?: SandIconPlatform;
  readonly selected?: boolean;
  readonly size?: SandIconButtonSize;
  readonly shape?: SandIconButtonShape;
  readonly variant?: SandIconButtonVariant;
  readonly sentiment?: SandSentiment;
}

export const SandIconButton = forwardRef<HTMLButtonElement, SandIconButtonProps>(function SandIconButton({
  className,
  disabled = false,
  icon,
  label,
  pending = false,
  platform,
  selected = false,
  sentiment = "neutral",
  shape = "square",
  size = "md",
  title,
  type = "button",
  variant = "ghost",
  ...buttonProps
}, ref): ReactNode {
  const resolvedLabel = label ?? buttonProps["aria-label"] ?? "";
  return <button
    {...buttonProps}
    aria-busy={pending || buttonProps["aria-busy"] || undefined}
    aria-label={resolvedLabel}
    aria-pressed={selected || buttonProps["aria-pressed"] || undefined}
    className={joinClasses(ICON_BUTTON_BASE, ICON_SIZE_CLASSES[size], ICON_SHAPE_CLASSES[shape], ICON_VARIANT_CLASSES[variant], selected || buttonProps["aria-pressed"] === true ? SELECTED_CLASSES : undefined, className)}
    data-sentiment={sentiment}
    data-shape={shape}
    data-size={size}
    data-variant={variant}
    disabled={disabled || pending}
    ref={ref}
    title={title ?? resolvedLabel}
    type={type}
  >
    <SandIcon name={icon} platform={platform} size={size} />
  </button>;
});

export interface SandTagProps extends HTMLAttributes<HTMLSpanElement> {
  readonly children?: ReactNode;
  readonly size?: SandButtonSize;
  readonly shape?: SandButtonShape;
  readonly variant?: SandPrimitiveVariant;
  readonly sentiment?: SandSentiment;
  readonly selected?: boolean;
}

export function SandTag({
  children,
  className,
  selected = false,
  shape = "pill",
  size = "sm",
  sentiment = "neutral",
  variant = "secondary",
  ...props
}: SandTagProps): ReactNode {
  return <span
    {...props}
    aria-pressed={selected || undefined}
    className={joinClasses(INSERTED_CHIP, CHIP_VARIANT_CLASSES[variant], CHIP_SENTIMENT_CLASSES[sentiment], selected ? SELECTED_CLASSES : undefined, className)}
    data-sentiment={sentiment}
    data-shape={shape}
    data-size={size}
    data-variant={variant}
  >{children}</span>;
}

export interface SandBadgeProps extends SandTagProps {
  readonly icon?: SandIconName;
}

export function SandBadge({ children, icon, ...props }: SandBadgeProps): ReactNode {
  return <span className={PILL_LABEL}>
    <SandTag {...props}>{icon == null ? null : <SandIcon name={icon} />}{children}</SandTag>
  </span>;
}

export interface SandKeycapProps extends Omit<SandTagProps, "shape" | "size" | "variant"> {
  readonly children?: ReactNode;
}

export function SandKeycap({ children, className, sentiment = "neutral", ...props }: SandKeycapProps): ReactNode {
  return <span
    {...props}
    className={joinClasses(INSERTED_CHIP, className)}
    data-sentiment={sentiment}
    data-shape="rectangular"
    data-size="sm"
    data-variant="secondary"
  >{children}</span>;
}
