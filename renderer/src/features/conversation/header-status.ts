/**
 * A room's *header* subtitle is not the same text as its presence strip: the presence strip (row 2) shows
 * every non-idle member, e.g. "Forge needs approval · Lens working", but the header subtitle (row 1, right
 * next to the title) only ever surfaces *working* members, e.g. "Lens working" -- needs-approval is
 * presence-strip/sidebar-dot territory only.
 *
 * The same rule holds for a bot DM from the other side: a blocked/needs-approval bot and a
 * mid-delegation bot both show a bare title with **no** subtitle at all -- needs-approval never gets a DM
 * subtitle either. A DM's own subtitle is therefore just "working" (no name needed, it's the chat's own
 * bot) when `statusPhraseKind(chat) === "working"`, and nothing otherwise (idle or needs-approval alike).
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */
import type { PresenceMember, StatusPhraseKind } from "../../data/status.ts";

/** A bot DM's header subtitle shows "working" only -- never a needs-approval phrase (see module doc). */
export function dmHeaderPhrase(phrase: StatusPhraseKind): "working" | null {
  return phrase === "working" ? "working" : null;
}

/** A room's header subtitle is the presence list filtered down to working members only (needs-approval
 * members are omitted here even though the presence strip below still lists them -- see module doc). */
export function workingOnlyPresence(presence: readonly PresenceMember[]): readonly PresenceMember[] {
  return presence.filter((member) => member.phrase === "working");
}
