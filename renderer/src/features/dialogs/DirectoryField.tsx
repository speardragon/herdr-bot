import { useEffect, useId, useRef, useState } from "react";
import { useBridge } from "../../data/BridgeContext.tsx";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { Button, TextField } from "../../primitives/index.ts";
import { useEscapeOwnership } from "../../primitives/useEscapeOwnership.ts";
import fieldStyles from "../../primitives/Field.module.css";
import type { DirectoryCheck } from "./bot-form.ts";
import styles from "./DirectoryField.module.css";

const DEBOUNCE_MS = 250;

export interface DirectoryFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Fires with the latest `directory.list` result for this value (or `null` while unresolved/disabled)
   * -- the parent form combines this with `bot-form.ts`'s `validateBotForm` to gate submit and decide
   * whether to show the "this is your home directory" step. */
  readonly onCheckChange?: (check: DirectoryCheck | null) => void;
  readonly invalidMessage?: string | null;
  readonly disabled?: boolean;
  readonly placeholder?: string;
}

/** The Working directory field: a text input + native "Choose…" picker, with live
 * `directory.list`-backed existence validation and a lightweight path-suggestion dropdown. Shared by the
 * New Bot form and the bot info panel's launch settings. */
export function DirectoryField({ label, value, onChange, onCheckChange, invalidMessage, disabled = false, placeholder }: DirectoryFieldProps) {
  const { client } = useStoreContext();
  const bridge = useBridge();
  const { t } = useT();
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [focused, setFocused] = useState(false);
  // Escape hides the suggestions until the next keystroke, without closing the dialog around the field.
  const [dismissed, setDismissed] = useState(false);
  const requestSeq = useRef(0);
  const showSuggestions = focused && !dismissed && !disabled && suggestions.length > 0;

  useEscapeOwnership(showSuggestions, () => setDismissed(true));

  useEffect(() => {
    if (disabled) {
      onCheckChange?.(null);
      return;
    }
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void client.call("directory.list", { path: value }).then((listing) => {
        if (requestSeq.current !== seq) return; // a newer keystroke superseded this request
        onCheckChange?.({ exists: listing.exists, isHome: listing.isHome });
        setSuggestions(listing.entries);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCheckChange is expected to be stable per render cycle
  }, [value, disabled, client]);

  async function choose() {
    const picked = await bridge.pickDirectory(value.length > 0 ? value : undefined);
    if (picked != null) onChange(picked);
  }

  // The label and the error line sit outside the input row, so the Choose button always lines up with the input itself.
  return (
    <div className={fieldStyles["hb-field"]}>
      <label className={fieldStyles["hb-field-label"]} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles["hb-directory-row"]}>
        <div className={styles["hb-directory-input"]}>
          <TextField
            id={inputId}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            invalid={invalidMessage != null}
            aria-describedby={invalidMessage != null ? helperId : undefined}
            onChange={(event) => {
              setDismissed(false);
              onChange(event.target.value);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
          />
          {showSuggestions && (
            <div className={styles["hb-directory-suggestions"]} role="listbox" aria-label={label}>
              {suggestions.slice(0, 20).map((entry) => (
                <button key={entry} type="button" role="option" aria-selected={false} className={styles["hb-directory-suggestion"]} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(entry)}>
                  {entry}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="button" onClick={choose} disabled={disabled}>
          {t("common.choose")}
        </Button>
      </div>
      {invalidMessage != null && (
        <div id={helperId} className={`${fieldStyles["hb-field-helper"]} ${fieldStyles["hb-field-helper--invalid"]}`}>
          {invalidMessage}
        </div>
      )}
    </div>
  );
}
