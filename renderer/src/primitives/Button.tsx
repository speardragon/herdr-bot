import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
}

export function Button({ variant = "secondary", size = "md", type = "button", children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={`${styles["hb-button"]} ${styles[`hb-button--${variant}`]} ${styles[`hb-button--${size}`]}`} {...rest}>
      {children}
    </button>
  );
}
