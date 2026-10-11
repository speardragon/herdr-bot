import styles from "./ToggleSwitch.module.css";

export interface ToggleSwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly "aria-label": string;
  readonly disabled?: boolean;
}

/** The Notifications row's switch -- a small feature-local control, not a shared
 * primitive (no `Switch`/`Toggle` exists in `primitives/index.ts`). */
export function ToggleSwitch({ checked, onChange, disabled = false, ...rest }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      className={`${styles["hb-toggle"]} ${checked ? styles["hb-toggle--on"] : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles["hb-toggle-knob"]} />
    </button>
  );
}
