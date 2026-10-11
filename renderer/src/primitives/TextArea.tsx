import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "id"> {
  readonly label?: string;
  readonly helperText?: string;
  readonly invalid?: boolean;
}

export function TextArea({ label, helperText, invalid = false, rows = 3, ...rest }: TextAreaProps) {
  const id = useId();
  const helperId = helperText != null ? `${id}-helper` : undefined;
  return (
    <div className={styles["hb-field"]}>
      {label != null && (
        <label className={styles["hb-field-label"]} htmlFor={id}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        className={`${styles["hb-field-control"]} ${invalid ? styles["hb-field-control--invalid"] : ""}`}
        aria-invalid={invalid || undefined}
        aria-describedby={helperId}
        {...rest}
      />
      {helperText != null && <div id={helperId} className={`${styles["hb-field-helper"]} ${invalid ? styles["hb-field-helper--invalid"] : ""}`}>{helperText}</div>}
    </div>
  );
}
