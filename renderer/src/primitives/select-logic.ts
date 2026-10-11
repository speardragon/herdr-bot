/**
 * Pure keyboard/typeahead logic for `Select`'s listbox popover -- no DOM/React, so it's directly
 * unit-testable (see `renderer/test/select-logic.test.ts`). Mirrors the WAI-ARIA APG listbox pattern:
 * Arrow keys move the "active" option (the one that would be chosen on Enter/Space) skipping disabled
 * options with wraparound; Home/End jump to the first/last enabled option; typed characters accumulate
 * into a short-lived query that jumps to the next option whose label starts with it, except that
 * repeating the *same* character cycles through every match for that character (classic `<select>`
 * behavior) instead of accumulating "aaa".
 */

export interface SelectLogicOption {
  readonly label: string;
  readonly disabled?: boolean;
}

export type MoveDirection = 1 | -1;

/** The next enabled option's index moving from `from` by `direction` (wrapping around), skipping
 * disabled options. Returns `from` unchanged if every option is disabled or the list is empty. */
export function moveActiveIndex(options: readonly SelectLogicOption[], from: number, direction: MoveDirection): number {
  if (options.length === 0) return -1;
  let index = from;
  for (let step = 0; step < options.length; step++) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]!.disabled) return index;
  }
  return from;
}

/** The first enabled option's index (Home), or -1 if every option is disabled. */
export function firstEnabledIndex(options: readonly SelectLogicOption[]): number {
  return options.findIndex((option) => !option.disabled);
}

/** The last enabled option's index (End), or -1 if every option is disabled. */
export function lastEnabledIndex(options: readonly SelectLogicOption[]): number {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]!.disabled) return index;
  }
  return -1;
}

export interface TypeaheadState {
  readonly query: string;
  readonly lastTime: number;
}

export const TYPEAHEAD_RESET_MS = 700;

export const EMPTY_TYPEAHEAD: TypeaheadState = { query: "", lastTime: 0 };

/** Appends a typed character to the typeahead query, resetting it if too much time has passed since
 * the last keystroke. A character that merely repeats the query's existing (single) character does not
 * grow the query -- it stays a 1-character query so `typeaheadMatch` keeps cycling through every option
 * starting with that character, rather than searching for an ever-longer run of the same letter. */
export function typeaheadAppend(state: TypeaheadState, char: string, now: number): TypeaheadState {
  const fresh = state.query.length === 0 || now - state.lastTime > TYPEAHEAD_RESET_MS;
  if (fresh) return { query: char, lastTime: now };
  const repeatsSameChar = [...state.query].every((existing) => existing.toLowerCase() === char.toLowerCase());
  return { query: repeatsSameChar ? state.query[0]! : state.query + char, lastTime: now };
}

/** The next option (searching forward from just after `activeIndex`, wrapping, skipping disabled
 * options) whose label starts with `query` case-insensitively. Returns `activeIndex` unchanged if
 * `query` is empty or nothing matches. */
export function typeaheadMatch(options: readonly SelectLogicOption[], query: string, activeIndex: number): number {
  const needle = query.toLowerCase();
  const count = options.length;
  if (count === 0 || needle.length === 0) return activeIndex;
  for (let offset = 1; offset <= count; offset += 1) {
    const index = (activeIndex + offset) % count;
    const option = options[index]!;
    if (!option.disabled && option.label.toLowerCase().startsWith(needle)) return index;
  }
  return activeIndex;
}
