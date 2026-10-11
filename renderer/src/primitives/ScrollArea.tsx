import type { HTMLAttributes, ReactNode } from "react";
import styles from "./ScrollArea.module.css";

export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  readonly children: ReactNode;
}

/** A scrollable region using the app's thin themed scrollbar (styles/reset.css) -- a thin wrapper so
 * call sites read as intent ("this area scrolls") rather than a bare styled div. */
export function ScrollArea({ children, ...rest }: ScrollAreaProps) {
  return (
    <div className={styles["hb-scroll-area"]} {...rest}>
      {children}
    </div>
  );
}
