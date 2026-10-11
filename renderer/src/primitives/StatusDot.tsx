import styles from "./StatusDot.module.css";

export type StatusDotTone = "blocked" | "working" | "unread";

export interface StatusDotProps {
  readonly tone: StatusDotTone;
  readonly size?: number;
  /** A 2px ring matching the surface behind it (11×11px, 2px white ring) -- set for the
   * status dot overlapping an avatar's corner, unset for the plain unread dot. */
  readonly ring?: boolean;
  readonly "aria-label"?: string;
}

/** The small colored dot used over an avatar's corner (status: red=blocked, orange=working) and the
 * separate boolean unread indicator (blue, no ring) -- see data/status.ts for the derivation logic. */
export function StatusDot({ tone, size = 10, ring = false, ...rest }: StatusDotProps) {
  return (
    <span
      role={rest["aria-label"] != null ? "img" : undefined}
      aria-label={rest["aria-label"]}
      className={`${styles["hb-status-dot"]} ${styles[`hb-status-dot--${tone}`]} ${ring ? styles["hb-status-dot--ring"] : ""}`}
      style={{ width: size, height: size }}
    />
  );
}
