import { PERSONA_COLORS, personaColorVar } from "../../data/avatar-colors.ts";
import type { PersonaColor } from "../../data/avatar-colors.ts";
import styles from "./ColorSwatches.module.css";

export interface ColorSwatchesProps {
  readonly value: PersonaColor;
  readonly onChange: (color: PersonaColor) => void;
  readonly "aria-label": string;
}

/** The 11-swatch persona color picker shared by the onboarding/quick-create card and the bot info
 * panel's "Change color" popover -- both show the identical two-row grid. */
export function ColorSwatches({ value, onChange, ...rest }: ColorSwatchesProps) {
  return (
    <div className={styles["hb-swatches"]} role="radiogroup" aria-label={rest["aria-label"]}>
      {PERSONA_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          className={`${styles["hb-swatch"]} ${color === value ? styles["hb-swatch--selected"] : ""}`}
          onClick={() => onChange(color)}
        >
          <span className={styles["hb-swatch-fill"]} style={{ background: personaColorVar(color) }} />
        </button>
      ))}
    </div>
  );
}
