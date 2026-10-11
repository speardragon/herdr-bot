/**
 * Assembles the full message catalog from every feature folder's fragment. This file has to know
 * about each feature folder that *exists* (one import line per folder) -- but a slice adding keys to a
 * folder that's already wired here only ever touches its own `i18n.ts`, never this file. A brand new
 * feature folder needs one new import line added here once.
 */
import * as common from "./common.ts";
import * as shell from "../shell/i18n.ts";
import * as sidebar from "../features/sidebar/i18n.ts";
import * as palette from "../features/palette/i18n.ts";
import * as conversation from "../features/conversation/i18n.ts";
import * as composer from "../features/composer/i18n.ts";
import * as dialogs from "../features/dialogs/i18n.ts";
import { mergeCatalog, translate } from "./catalog.ts";
import type { Vars } from "./catalog.ts";
import type { Locale } from "./locale.ts";

export type { Locale } from "./locale.ts";
export { DEFAULT_LOCALE, parseLocale } from "./locale.ts";

const CATALOG = mergeCatalog([common, shell, sidebar, palette, conversation, composer, dialogs]);

export function t(locale: Locale, key: string, vars?: Vars): string {
  return translate(CATALOG, locale, key, vars);
}
