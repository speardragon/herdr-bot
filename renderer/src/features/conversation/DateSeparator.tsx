import { useT } from "../../i18n/TranslationProvider.tsx";
import { formatDateSeparatorText } from "./date-separator-label.ts";
import styles from "./DateSeparator.module.css";

export interface DateSeparatorProps {
  readonly timestampMs: number;
}

export function DateSeparator({ timestampMs }: DateSeparatorProps) {
  const { t, locale } = useT();
  return <div className={styles["hb-date-separator"]}>{formatDateSeparatorText(timestampMs, Date.now(), locale, t)}</div>;
}
