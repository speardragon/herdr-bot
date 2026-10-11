/** The two UI locales herdr-bot ships -- exactly two options, no "System". Pure
 * module so parsing/fallback logic is unit-testable without touching `window.herdrBot`. */
export type Locale = "ko" | "en";

/** Korean is the default locale; falls back here whenever the persisted
 * preference is absent/unrecognized. */
export const DEFAULT_LOCALE: Locale = "ko";

export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : value === "ko" ? "ko" : DEFAULT_LOCALE;
}
