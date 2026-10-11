import { MAX_MESSAGES_PER_TURN } from "../rooms/index.ts";

export interface OpenTurn {
  readonly spoken: readonly string[];
  close(): readonly string[];
}

export type SayMode = "in-turn" | "late" | "over-cap";

/**
 * Result of accepting a `say`. Beyond the plain mode, callers (TurnService.handleSay) use these to tag
 * the stored entry (see model/entries.ts' marker-field contract in the A2/A6 doc comments there):
 * - `lateAfterMs`: only on `mode: "late"` -- how long after this turn closed the say arrived.
 * - `staleFor`: only on `mode: "in-turn"` -- the newer user entry id that arrived while this turn was
 *   already open (A2/C-03). Tagged on only the FIRST say after that newer message, since later says in
 *   the same turn had the chance to react to the interrupt delivered to the bot's terminal.
 * - `answersHeld`: only on `mode: "in-turn"` -- the id of an earlier user entry this bot had to skip
 *   while busy (A6/C-06), being addressed now that the bot can finally speak in this chat again.
 */
export interface AcceptResult {
  readonly mode: SayMode;
  readonly lateAfterMs?: number;
  readonly staleFor?: string;
  readonly answersHeld?: string;
}

export interface OpenTurnContext {
  /** User entries this bot was busy-skipped for in this chat, oldest first (A6/C-06). */
  readonly heldEntryIds?: readonly string[];
}

interface TurnRecord {
  spoken: string[];
  /** Set by `markInterrupted` when a newer user message arrives while this turn is still open (A2). */
  staleUserEntryId: string | null;
  /** Only the first say after `staleUserEntryId` is set gets tagged `staleFor` -- later says in the
   * same turn had a chance to react to the interrupt delivered to the bot's terminal. */
  staleConsumed: boolean;
  heldEntryIds: string[];
  /** Only the first say in the turn gets tagged `answersHeld`, addressing the oldest held question. */
  heldConsumed: boolean;
}

function key(chatId: string, botId: string): string {
  return `${chatId} ${botId}`;
}

/** Collects `say` calls that arrive while a bot's turn is open; everything else is a late message. */
export class SayInbox {
  readonly #turns = new Map<string, TurnRecord>();
  /** Close time of the last turn for each (chat, bot), so a late say can report `lateAfterMs` (A6/C-06). */
  readonly #closedAt = new Map<string, number>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  open(chatId: string, botId: string, context: OpenTurnContext = {}): OpenTurn {
    const record: TurnRecord = {
      spoken: [],
      staleUserEntryId: null,
      staleConsumed: false,
      heldEntryIds: [...(context.heldEntryIds ?? [])],
      heldConsumed: false,
    };
    const turnKey = key(chatId, botId);
    this.#turns.set(turnKey, record);
    return {
      get spoken() {
        return [...record.spoken];
      },
      close: () => {
        if (this.#turns.get(turnKey) === record) {
          this.#turns.delete(turnKey);
          this.#closedAt.set(turnKey, this.#now());
        }
        return [...record.spoken];
      },
    };
  }

  isOpen(chatId: string, botId: string): boolean {
    return this.#turns.has(key(chatId, botId));
  }

  /** The chat whose turn this bot is currently taking (the one a blocked prompt belongs to), if any. */
  openChatFor(botId: string): string | null {
    for (const turnKey of this.#turns.keys()) {
      const [chatId, owner] = turnKey.split(" ");
      if (owner === botId && chatId != null) return chatId;
    }
    return null;
  }

  /** Every bot with a currently open turn in `chatId` (A2/C-03: who to deliver a mid-turn interrupt to).
   * Under A1 more than one member's turn can be open in the same room at once. */
  openBotsFor(chatId: string): string[] {
    const ids: string[] = [];
    for (const turnKey of this.#turns.keys()) {
      const [owner, botId] = turnKey.split(" ");
      if (owner === chatId && botId != null) ids.push(botId);
    }
    return ids;
  }

  /** A newer user message arrived in `chatId` while `botId`'s turn is open (A2/C-03): its next say, if
   * any, is tagged `staleFor` this entry id. A no-op if that bot has no open turn there. */
  markInterrupted(chatId: string, botId: string, userEntryId: string): void {
    const record = this.#turns.get(key(chatId, botId));
    if (record != null) record.staleUserEntryId = userEntryId;
  }

  accept(chatId: string, botId: string, text: string): AcceptResult {
    const turnKey = key(chatId, botId);
    const record = this.#turns.get(turnKey);
    if (record == null) {
      const closedAt = this.#closedAt.get(turnKey);
      return closedAt == null ? { mode: "late" } : { mode: "late", lateAfterMs: Math.max(0, this.#now() - closedAt) };
    }
    if (record.spoken.length >= MAX_MESSAGES_PER_TURN) return { mode: "over-cap" };
    record.spoken = [...record.spoken, text];
    let staleFor: string | undefined;
    if (record.staleUserEntryId != null && !record.staleConsumed) {
      staleFor = record.staleUserEntryId;
      record.staleConsumed = true;
    }
    let answersHeld: string | undefined;
    if (record.heldEntryIds.length > 0 && !record.heldConsumed) {
      answersHeld = record.heldEntryIds[0];
      record.heldConsumed = true;
    }
    return { mode: "in-turn", ...(staleFor == null ? {} : { staleFor }), ...(answersHeld == null ? {} : { answersHeld }) };
  }
}
