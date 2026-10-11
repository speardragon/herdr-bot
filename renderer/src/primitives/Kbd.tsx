import styles from "./Kbd.module.css";

/** The small keyboard-shortcut badge (⌘K, ⌘1, Esc, ...) used in the command palette and tooltips. */
export function Kbd({ children }: { readonly children: string }) {
  return <kbd className={styles["hb-kbd"]}>{children}</kbd>;
}
