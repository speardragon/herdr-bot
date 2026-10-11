import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "./Popover.tsx";
import { useEscapeOwnership } from "./useEscapeOwnership.ts";
import { EMPTY_TYPEAHEAD, firstEnabledIndex, lastEnabledIndex, moveActiveIndex, typeaheadAppend, typeaheadMatch } from "./select-logic.ts";
import type { TypeaheadState } from "./select-logic.ts";
import fieldStyles from "./Field.module.css";
import styles from "./Select.module.css";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  /** A leading glyph (e.g. a provider brand icon) -- see `ProviderSelect`. */
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
}

export interface SelectProps {
  readonly label?: string;
  readonly helperText?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  readonly disabled?: boolean;
  /** "trigger" (default): the listbox is as wide as the trigger button, like a native `<select>` --
   * every plain text dropdown in the app (Settings' Language/Appearance/Defaults, New Bot's Permissions/
   * Model/Reasoning, the adopt-agent picker, ...). "content": sized to its own icon+label content
   * instead, narrower than a typically-wide field -- `ProviderSelect`'s AI provider picker. */
  readonly panelWidth?: "trigger" | "content";
  /** "stacked" (default): label above the trigger. "inline": label on the left, trigger on the right --
   * the Settings dialog's rows. */
  readonly layout?: "stacked" | "inline";
  readonly "aria-label"?: string;
}

/**
 * An accessible custom listbox popover standing in for a native `<select>` -- every dropdown in this
 * app is an in-page popover with a checkmark on the current value and, where relevant, a leading icon
 * per option, rather than an OS-chrome native select. Button trigger
 * (`aria-haspopup="listbox"`/`aria-expanded`), full keyboard support (Arrow keys move the active option
 * skipping disabled ones with wraparound, Home/End jump to the first/last enabled option, typed
 * characters jump by prefix, Enter/Space commits, Escape closes without closing a parent `Dialog` --
 * `useEscapeOwnership`, Tab closes and keeps focus near the trigger), closes on an outside click,
 * returns focus to the trigger on close, scrolls when long (`max-height` + `overflow-y`), and flips
 * above the trigger when there's no room below (`Popover`'s `autoFlip`). `ProviderSelect` is a thin
 * wrapper over this (an icon per option, `panelWidth="content"`) rather than its own popover.
 */
export function Select({ label, helperText, value, onChange, options, disabled = false, panelWidth = "trigger", layout = "stacked", ...rest }: SelectProps) {
  const id = useId();
  const helperId = helperText != null ? `${id}-helper` : undefined;
  const ariaLabel = rest["aria-label"] ?? label;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef<TypeaheadState>(EMPTY_TYPEAHEAD);
  // Set on the trigger's own mousedown (before Popover's document-level outside-mousedown listener can
  // have closed it -- see this ref's one read, below, for why) so the matching click doesn't immediately
  // reopen what that outside click just closed.
  const wasOpenOnMouseDownRef = useRef(false);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEscapeOwnership(open, close);

  // Focuses the active option whenever the listbox opens or the active option changes -- roving focus,
  // the WAI-ARIA APG "aria-activedescendant or roving tabindex" listbox pattern's latter option (simpler
  // to reason about here since every option is a real, individually focusable `<button>`). Deferred to
  // the next frame on open specifically because a native `<button>`'s own post-click "activation
  // behavior" re-focuses *itself* right after our click handler returns (after any focus call we make
  // synchronously inside it, mousedown `preventDefault()` notwithstanding) -- so focusing the option
  // synchronously here would just lose that race the moment the listbox was opened by a click.
  useLayoutEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, activeIndex]);

  function openListbox() {
    optionRefs.current = [];
    typeaheadRef.current = EMPTY_TYPEAHEAD;
    if (panelWidth === "trigger") setTriggerWidth(triggerRef.current?.getBoundingClientRect().width ?? null);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options));
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (option == null || option.disabled === true) return;
    if (option.value !== value) onChange(option.value);
    close();
  }

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => moveActiveIndex(options, current, 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => moveActiveIndex(options, current, -1));
        return;
      case "Home":
        event.preventDefault();
        setActiveIndex(firstEnabledIndex(options));
        return;
      case "End":
        event.preventDefault();
        setActiveIndex(lastEnabledIndex(options));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        return;
      case "Tab":
        // A real native select never lets Tab land focus inside its (closed) popup; we portal to
        // document.body, so the simplest robust equivalent is: close, and keep focus at the trigger
        // rather than risk Tab's default action landing focus somewhere surprising in the portal.
        event.preventDefault();
        close();
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          typeaheadRef.current = typeaheadAppend(typeaheadRef.current, event.key, Date.now());
          setActiveIndex((current) => typeaheadMatch(options, typeaheadRef.current.query, current));
        }
    }
  }

  return (
    <div className={layout === "inline" ? `${fieldStyles["hb-field"]} ${fieldStyles["hb-field--inline"]}` : fieldStyles["hb-field"]}>
      {label != null && (
        <label className={fieldStyles["hb-field-label"]} htmlFor={id}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        className={`${fieldStyles["hb-field-control"]} ${styles["hb-select-trigger"]}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={helperId}
        onMouseDown={() => {
          wasOpenOnMouseDownRef.current = open;
        }}
        onClick={() => {
          if (wasOpenOnMouseDownRef.current) return;
          openListbox();
        }}
        onKeyDown={(event) => {
          if (open) return; // the open listbox's own onKeyDown (below) handles every key at that point
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openListbox();
          }
        }}
      >
        {selected?.icon}
        {/* Falls back to the raw value (not blank) if it isn't among `options` yet -- e.g. the New Bot
         * model picker while `bot.listModels` is still loading. */}
        <span className={styles["hb-select-trigger-label"]}>{selected?.label ?? value}</span>
        <ChevronDown size={16} className={styles["hb-select-chevron"]} aria-hidden />
      </button>
      {helperText != null && (
        <div id={helperId} className={fieldStyles["hb-field-helper"]}>
          {helperText}
        </div>
      )}

      {open && (
        <Popover
          open
          onClose={close}
          anchor={{ kind: "element", element: triggerRef.current!, placement: "bottom-start", autoFlip: true }}
          aria-label={ariaLabel}
        >
          <div
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={`${styles["hb-select-listbox"]} ${panelWidth === "content" ? styles["hb-select-listbox--content"] : ""}`}
            style={panelWidth === "trigger" && triggerWidth != null ? { width: triggerWidth } : undefined}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled === true || undefined}
                tabIndex={-1}
                disabled={option.disabled === true}
                className={[
                  styles["hb-select-option"],
                  index === activeIndex ? styles["hb-select-option--active"] : "",
                  option.value === value ? styles["hb-select-option--selected"] : "",
                ].join(" ")}
                onMouseEnter={() => {
                  if (option.disabled !== true) setActiveIndex(index);
                }}
                onClick={() => commit(index)}
              >
                {option.icon}
                <span className={styles["hb-select-option-label"]}>{option.label}</span>
                {option.value === value && <Check size={14} className={styles["hb-select-option-check"]} aria-hidden />}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
