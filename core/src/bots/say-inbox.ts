import { GROUP_MAX_MESSAGES_PER_TURN } from "../group/group-chat.ts";

export interface OpenTurn {
  readonly spoken: readonly string[];
  close(): readonly string[];
}

export type SayMode = "in-turn" | "late" | "over-cap";

interface TurnRecord {
  spoken: string[];
}

function key(chatId: string, botId: string): string {
  return `${chatId} ${botId}`;
}

/** Collects `say` calls that arrive while a bot's turn is open; everything else is a late message. */
export class SayInbox {
  readonly #turns = new Map<string, TurnRecord>();

  open(chatId: string, botId: string): OpenTurn {
    const record: TurnRecord = { spoken: [] };
    const turnKey = key(chatId, botId);
    this.#turns.set(turnKey, record);
    return {
      get spoken() {
        return [...record.spoken];
      },
      close: () => {
        if (this.#turns.get(turnKey) === record) this.#turns.delete(turnKey);
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

  accept(chatId: string, botId: string, text: string): SayMode {
    const record = this.#turns.get(key(chatId, botId));
    if (record == null) return "late";
    if (record.spoken.length >= GROUP_MAX_MESSAGES_PER_TURN) return "over-cap";
    record.spoken = [...record.spoken, text];
    return "in-turn";
  }
}
