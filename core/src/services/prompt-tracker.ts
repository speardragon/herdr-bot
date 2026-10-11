import type { SayInbox } from "../bots/say-inbox.ts";
import type { BlockedPrompt, BlockedPromptKind } from "../herdr/blocked-prompt.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import type { BotRuntime } from "../herdr/types.ts";
import type { PromptEntryAnswer } from "../model/entries.ts";
import type { StoredEntry } from "../store/transcript-store.ts";
import type { ChatService } from "./chat-service.ts";
import type { ProfileStore } from "../store/profile-store.ts";
import type { PromptAnswer } from "./prompt-service.ts";

export interface PromptTrackerDeps {
  readonly chat: ChatService;
  readonly inbox: SayInbox;
  readonly profiles: ProfileStore;
}

interface OpenPrompt {
  readonly chatId: string;
  readonly entryId: string;
  readonly signature: string;
  readonly kind: BlockedPromptKind;
  answered: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function promptAuthorId(entry: StoredEntry): string | null {
  return isRecord(entry.author) && typeof entry.author.id === "string" ? entry.author.id : null;
}

function promptSignature(entry: StoredEntry): string | null {
  return isRecord(entry.prompt) && typeof entry.prompt.signature === "string" ? entry.prompt.signature : null;
}

/** Turns the mirror's blocked-prompt observations into transcript "prompt" entries (pending -> answered
 * / resolved) in the chat whose turn the bot was taking (its DM when no turn is open). */
export class PromptTracker {
  readonly #deps: PromptTrackerDeps;
  readonly #open = new Map<string, OpenPrompt>();
  /** Bots this process has already reconciled against a previous run's leftover card (see
   * `#reconcileOnce`) -- at most once per bot per process, so a later, ordinary re-blocking never
   * re-triggers it. */
  readonly #reconciled = new Set<string>();

  constructor(deps: PromptTrackerDeps) {
    this.#deps = deps;
  }

  /**
   * Host start, once the mirror's first refresh has resolved: a bot whose runtime never changed from
   * the pre-start empty state (still fully offline, no pane at all) never reaches `onRuntimeChange`,
   * so it would otherwise never get reconciled against a card the previous run left `pending`. Sweep
   * those. Every other bot was already reconciled inline by `onRuntimeChange` while that same refresh
   * ran (`#reconciled` makes this a no-op for them).
   */
  recover(mirror: StatusMirror): void {
    this.#hideGhosts();
    for (const profile of this.#deps.profiles.list()) this.#reconcileOnce(profile.id, mirror.get(profile.id));
  }

  /**
   * Earlier builds force-resolved every pending card on start and then appended a fresh copy for the
   * still-blocked form, so a chat could hold "터미널에서 답변됨" ghost(s) stacked right above the live
   * card for the same question. Those are on disk for good; mark every resolved-without-answer card
   * that is followed by a later card of the same bot AND same form as `superseded` so the renderer
   * drops it. A resolved card followed by a different question is genuine history and stays.
   */
  #hideGhosts(): void {
    for (const summary of this.#deps.chat.listSummaries()) {
      const cards = this.#deps.chat.transcript(summary.id).readAll().filter((entry) => entry.kind === "prompt");
      cards.forEach((entry, index) => {
        if (entry.status !== "resolved" || entry.answer != null) return;
        const key = `${promptAuthorId(entry)}\u0000${promptSignature(entry)}`;
        const hasLaterTwin = cards.slice(index + 1).some((later) => `${promptAuthorId(later)}\u0000${promptSignature(later)}` === key);
        if (hasLaterTwin) this.#deps.chat.updateEntry(summary.id, entry.id, (current) => ({ ...current, status: "superseded" }));
      });
    }
  }

  /** Called from the status mirror's onChange, before the summary upsert is published. */
  onRuntimeChange(botId: string, runtime: BotRuntime, previous: BotRuntime): void {
    this.#reconcileOnce(botId, runtime);
    const next = runtime.status === "blocked" ? runtime.prompt : null;
    const open = this.#open.get(botId);
    if (next == null) {
      if (open != null) this.#close(botId, open);
      return;
    }
    if (open != null && open.signature === next.signature) {
      // Same form, new cursor/checkbox state: keep the card current without re-appending.
      if (previous.prompt?.signature !== next.signature || !samePromptState(previous.prompt, next)) this.#patch(open, (entry) => ({ ...entry, prompt: next }));
      return;
    }
    // An "unknown" form's signature folds in up to 12 raw screen lines, so a ticking/volatile line (a
    // spinner, a live timer) can change it on every refresh while the bot sits on the exact same kind of
    // blocked screen (a trust dialog, an MCP accept/decline). Patch the existing card in place instead of
    // closing it and appending a fresh one each time -- otherwise the transcript grows one entry per
    // refresh for as long as the bot stays blocked. Normal kinds (permission/question) keep the
    // close-then-append behavior: a different signature there is a genuinely different question.
    if (open != null && open.kind === "unknown" && next.kind === "unknown") {
      this.#open.set(botId, { ...open, signature: next.signature, kind: next.kind });
      this.#patch(open, (entry) => ({ ...entry, prompt: next }));
      return;
    }
    if (open != null) this.#close(botId, open);
    this.#openEntry(botId, next);
  }

  /**
   * The in-memory `#open` bookkeeping for a bot's card does not survive a restart, so the first time
   * this process observes a bot's live runtime, check its transcripts for a card a PREVIOUS run left
   * `pending`. If the pane is still blocked on the exact same form, resume tracking that stored entry
   * (so the logic above reuses and patches it instead of appending a duplicate). Otherwise -- answered
   * in herdr, or moved to a different form, while the app was closed -- resolve it.
   */
  #reconcileOnce(botId: string, runtime: BotRuntime): void {
    if (this.#reconciled.has(botId)) return;
    this.#reconciled.add(botId);
    const stale = this.#findPendingEntry(botId);
    if (stale == null) return;
    if (runtime.status === "blocked" && runtime.prompt?.signature === stale.signature) {
      this.#open.set(botId, { chatId: stale.chatId, entryId: stale.entryId, signature: stale.signature, kind: runtime.prompt.kind, answered: false });
    } else {
      this.#deps.chat.updateEntry(stale.chatId, stale.entryId, (entry) => ({ ...entry, status: "resolved" }));
    }
  }

  #findPendingEntry(botId: string): { chatId: string; entryId: string; signature: string } | null {
    for (const summary of this.#deps.chat.listSummaries()) {
      for (const entry of this.#deps.chat.transcript(summary.id).readAll()) {
        if (entry.kind !== "prompt" || entry.status !== "pending" || promptAuthorId(entry) !== botId) continue;
        const signature = promptSignature(entry);
        if (signature != null) return { chatId: summary.id, entryId: entry.id, signature };
      }
    }
    return null;
  }

  /** Records what the user chose on the card so the entry collapses to that answer. Toggling a row of a
   * multi-select question does not settle the form and is not recorded. */
  recordAnswer(botId: string, answer: PromptAnswer, prompt: BlockedPrompt): void {
    const open = this.#open.get(botId);
    if (open == null || open.signature !== prompt.signature) return;
    const recorded = toEntryAnswer(answer, prompt);
    if (recorded == null) return;
    open.answered = true;
    this.#patch(open, (entry) => ({ ...entry, status: "answered", answer: recorded }));
  }

  #openEntry(botId: string, prompt: BlockedPrompt): void {
    const profile = this.#deps.profiles.get(botId);
    if (profile == null) return;
    const chatId = this.#deps.inbox.openChatFor(botId) ?? botId;
    if (this.#deps.chat.chatKind(chatId) == null) return;
    const entry = this.#deps.chat.appendPrompt(chatId, { id: botId, name: profile.name }, prompt);
    this.#open.set(botId, { chatId, entryId: entry.id, signature: prompt.signature, kind: prompt.kind, answered: false });
  }

  #close(botId: string, open: OpenPrompt): void {
    this.#open.delete(botId);
    if (!open.answered) this.#patch(open, (entry) => ({ ...entry, status: "resolved" }));
  }

  #patch(open: OpenPrompt, patch: (entry: StoredEntry) => StoredEntry): void {
    this.#deps.chat.updateEntry(open.chatId, open.entryId, patch);
  }
}

function samePromptState(a: BlockedPrompt | null, b: BlockedPrompt): boolean {
  return a != null && a.options.every((option, index) => option.selected === b.options[index]?.selected && option.checked === b.options[index]?.checked);
}

function toEntryAnswer(answer: PromptAnswer, prompt: BlockedPrompt): PromptEntryAnswer | null {
  switch (answer.action) {
    case "option": {
      if (prompt.multiSelect) return null;
      const option = prompt.options.find((candidate) => candidate.key === answer.key);
      return option == null ? null : { kind: "option", key: option.key, label: option.label };
    }
    case "text": return { kind: "text", text: answer.text.replace(/\s*\r?\n\s*/gu, " ").trim() };
    case "cancel": return { kind: "cancelled" };
    case "next": return null;
  }
}
