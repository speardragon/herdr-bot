import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "accent-mine" | "late" | "key";

export interface BadgeProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  readonly tone?: BadgeTone;
  readonly as?: "span" | "button";
  readonly children: ReactNode;
}

/** A small pill: reaction counts (`accent`/`accent-mine`), the late/held/stale badges (`neutral`/`late`),
 * and the approval card's lettered option keycaps (`key`). Renders a `<button>` (reactions are
 * clickable/toggleable) unless `as="span"`. */
export function Badge({ tone = "neutral", as = "span", children, ...rest }: BadgeProps) {
  const className = `${styles["hb-badge"]} ${styles[`hb-badge--${tone}`]}`;
  if (as === "button") {
    return (
      <button type="button" className={className} {...rest}>
        {children}
      </button>
    );
  }
  return <span className={className}>{children}</span>;
}
