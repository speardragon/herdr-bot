import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly size?: "sm" | "md" | "lg";
  readonly "aria-label": string;
  readonly children: ReactNode;
}

/** An icon-only button. `aria-label` is required (not optional) -- every icon-only control in this app
 * must announce itself to assistive tech and carry a native tooltip, so we reuse `aria-label` as the
 * `title` too unless the caller overrides `title` explicitly. */
export function IconButton({ size = "md", type = "button", title, children, ...rest }: IconButtonProps) {
  return (
    <button type={type} className={`${styles["hb-icon-button"]} ${styles[`hb-icon-button--${size}`]}`} title={title ?? rest["aria-label"]} {...rest}>
      {children}
    </button>
  );
}
