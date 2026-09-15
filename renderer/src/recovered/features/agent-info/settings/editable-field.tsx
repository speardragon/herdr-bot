import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=2766045 (Agent Settings view)

export interface EditableFieldProps {
  readonly id?: string;
  readonly ariaLabel: string;
  readonly initialValue?: string;
  readonly isMultiline?: boolean;
  readonly isRequired?: boolean;
  readonly placeholder: string;
  onCommit(value: string): void;
}

/**
 * A blur-committed text field: Escape reverts to the authoritative value, Enter blurs a single-line
 * field, and an unchanged (or emptied-when-required) draft never reaches `onCommit`.
 */
export function EditableField({ id, ariaLabel, initialValue = "", isMultiline = false, isRequired = false, placeholder, onCommit }: EditableFieldProps) {
  const [draft, setDraft] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(initialValue); }, [focused, initialValue]);
  const commit = () => {
    setFocused(false);
    const normalized = draft.trim();
    if (normalized === initialValue || (normalized.length === 0 && isRequired)) { setDraft(initialValue); return; }
    onCommit(normalized);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(initialValue); setFocused(false); event.currentTarget.blur(); }
    else if (!isMultiline && event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
  };
  const props = {
    "aria-label": ariaLabel,
    className: "sand-agent-settings__input",
    id,
    onBlur: commit,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.currentTarget.value),
    onFocus: () => setFocused(true),
    onKeyDown,
    placeholder,
    spellCheck: false,
    value: draft
  };
  return isMultiline ? <textarea {...props} rows={4} /> : <input {...props} type="text" />;
}
