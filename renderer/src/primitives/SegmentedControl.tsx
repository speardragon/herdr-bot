import { useRef } from "react";
import type { KeyboardEvent } from "react";
import styles from "./SegmentedControl.module.css";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly "aria-label": string;
}

/** A tab-like exclusive choice (e.g. the Bot/Room switch, the palette's tab strip). Implements the
 * roving-tabindex `role="tablist"` keyboard pattern: arrow left/right moves focus and selects. */
export function SegmentedControl<T extends string>({ options, value, onChange, ...rest }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = options.findIndex((o) => o.value === value);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = options[(index + delta + options.length) % options.length];
      if (next != null) onChange(next.value);
    }
  }

  return (
    <div ref={ref} role="tablist" aria-label={rest["aria-label"]} className={styles["hb-segmented"]} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={styles["hb-segmented-item"]}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
