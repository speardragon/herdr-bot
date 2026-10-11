/**
 * Decides which of the three subtitle shapes a message-search result row needs:
 * `In Checkout rate limits · 30m ago` for a room match, `Scout to you · 53m ago` / `You to Scout ·
 * 54m ago` for a DM, depending on who sent it. Pure classification -- `PaletteSlot` maps the returned
 * discriminant to an `i18n` template + the already-formatted relative time string.
 */
import type { MessageSearchHit } from "../../data/types.ts";

export type MessageHitSubtitle =
  | { readonly kind: "room"; readonly chatName: string }
  | { readonly kind: "dmFromBot"; readonly author: string }
  | { readonly kind: "dmFromYou"; readonly chatName: string };

export function messageHitSubtitle(hit: Pick<MessageSearchHit, "role" | "author" | "chatName">, isRoom: boolean): MessageHitSubtitle {
  if (isRoom) return { kind: "room", chatName: hit.chatName };
  return hit.role === "assistant" ? { kind: "dmFromBot", author: hit.author } : { kind: "dmFromYou", chatName: hit.chatName };
}
