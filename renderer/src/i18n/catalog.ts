/**
 * Message catalog merge + lookup. Pure/DOM-free so it's unit-testable directly.
 *
 * Convention (not enforced by types, since fragments are owned independently by each feature folder):
 * every key is namespaced by its owning folder, e.g. `"sidebar.search"`, `"composer.placeholder"`,
 * `"common.cancel"` -- that is what keeps two slices from silently overwriting each other's key when
 * `mergeCatalog` spreads every fragment into one flat object. Within one fragment file, `ko` is checked
 * against `en`'s keys at compile time with `satisfies Record<keyof typeof en, string>` (see
 * `src/i18n/common.ts` for the pattern) -- that part *is* enforced.
 */
import type { Locale } from "./locale.ts";

export interface MessageFragment {
  readonly en: Record<string, string>;
  readonly ko: Record<string, string>;
}

export function mergeCatalog(fragments: readonly MessageFragment[]): Record<Locale, Record<string, string>> {
  const en: Record<string, string> = {};
  const ko: Record<string, string> = {};
  for (const fragment of fragments) {
    Object.assign(en, fragment.en);
    Object.assign(ko, fragment.ko);
  }
  return { en, ko };
}

export type Vars = Record<string, string | number>;

function interpolate(template: string, vars: Vars | undefined): string {
  if (vars == null) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Looks up `key` in `locale`'s catalog, falling back to English, then to the bare key (so a missing
 * translation is visibly wrong in the UI rather than silently blank). */
export function translate(catalog: Record<Locale, Record<string, string>>, locale: Locale, key: string, vars?: Vars): string {
  const template = catalog[locale][key] ?? catalog.en[key] ?? key;
  return interpolate(template, vars);
}
