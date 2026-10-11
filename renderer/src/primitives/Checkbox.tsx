import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  readonly children?: ReactNode;
}

export function Checkbox({ children, ...rest }: CheckboxProps) {
  return (
    <label className={styles["hb-checkbox"]}>
      <input type="checkbox" {...rest} />
      {children}
    </label>
  );
}
