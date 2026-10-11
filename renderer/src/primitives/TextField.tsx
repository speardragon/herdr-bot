import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import styles from "./Field.module.css";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> {
  readonly label?: string;
  readonly helperText?: string;
  readonly invalid?: boolean;
}

export function TextField({ label, helperText, invalid = false, ...rest }: TextFieldProps) {
  const id = useId();
  const helperId = helperText != null ? `${id}-helper` : undefined;
  return (
    <div className={styles["hb-field"]}>
      {label != null && (
        <label className={styles["hb-field-label"]} htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className={`${styles["hb-field-control"]} ${invalid ? styles["hb-field-control--invalid"] : ""}`}
        aria-invalid={invalid || undefined}
        aria-describedby={helperId}
        {...rest}
      />
      {helperText != null && <div id={helperId} className={`${styles["hb-field-helper"]} ${invalid ? styles["hb-field-helper--invalid"] : ""}`}>{helperText}</div>}
    </div>
  );
}
