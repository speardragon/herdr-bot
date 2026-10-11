/**
 * Composer placeholder copy picks a different Korean particle depending on what kind of chat it is
 * addressed to: a bot is a person-like addressee ("Forge*에게* 메시지 보내기", dative), a room is a place
 * you post into ("Checkout rate limits*에* 메시지 보내기", locative). English uses the same template
 * either way ("Message <ChatName>") -- only the Korean half of the fragment varies, and
 * it varies by chat *kind*, never by the name's trailing consonant (받침), so this is a two-key lookup,
 * not batchim detection. Pure/DOM-free so the rule is unit-testable without rendering anything.
 */
import type { ChatKind } from "../../data/types.ts";

/** Which `composer.i18n.ts` key to use for a given chat's placeholder, per the particle rule above. */
export function placeholderKey(kind: ChatKind): "composer.placeholder.bot" | "composer.placeholder.room" {
  return kind === "bot" ? "composer.placeholder.bot" : "composer.placeholder.room";
}
