import styles from "./Spinner.module.css";

export function Spinner({ size = 16, label = "Loading" }: { readonly size?: number; readonly label?: string }) {
  return <span role="status" aria-label={label} className={styles["hb-spinner"]} style={{ width: size, height: size }} />;
}
