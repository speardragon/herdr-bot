import { appendFileSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredEntry {
  readonly id: string;
  readonly kind: string;
  readonly seq: number;
  readonly timestampMs: number;
  readonly [key: string]: unknown;
}

export type NewEntry = {
  readonly kind: string;
  readonly timestampMs: number;
  readonly [key: string]: unknown;
};

export interface TranscriptPage {
  readonly entries: readonly StoredEntry[];
  readonly nextBeforeSeq?: number;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && typeof candidate.kind === "string"
    && typeof candidate.seq === "number"
    && typeof candidate.timestampMs === "number";
}

/** Parses one JSONL line, or null for a blank or corrupt one -- shared by the full-file loader and the
 * tail reader so "skip a corrupt line" means the same thing in both. */
function parseLine(line: string): StoredEntry | null {
  if (line.trim().length === 0) return null;
  try {
    const value: unknown = JSON.parse(line);
    return isStoredEntry(value) ? value : null;
  } catch {
    return null; // Skip a corrupt line instead of losing the whole transcript.
  }
}

function parseLines(raw: string): StoredEntry[] {
  const parsed: StoredEntry[] = [];
  for (const line of raw.split("\n")) {
    const entry = parseLine(line);
    if (entry != null) parsed.push(entry);
  }
  return parsed;
}

/** Initial tail-read chunk; doubled (capped at the file size) until a whole valid trailing line is
 * found. Most lines are far smaller than this, so the common case is a single read. */
const TAIL_CHUNK_BYTES = 4_096;

export class TranscriptStore {
  readonly path: string;
  #entries: readonly StoredEntry[] | null = null;
  /** The last entry, cached independently of `#entries` so `last()`/`nextSeq()` stay cheap after a
   * `release()`. `undefined` = unknown (not read yet); `null` = known empty/missing transcript. */
  #last: StoredEntry | null | undefined = undefined;
  /** Fired every time the full entry array is actually touched (loaded fresh or served from cache) --
   * NOT on the cheap `last()`/`nextSeq()` path. Lets a caller (ChatService) track which chats are
   * genuinely "hot" without the mere existence of a last-entry cache counting as use. */
  readonly #onFullAccess?: () => void;

  constructor(path: string, onFullAccess?: () => void) {
    this.path = path;
    this.#onFullAccess = onFullAccess;
  }

  readAll(): readonly StoredEntry[] {
    return this.#load();
  }

  nextSeq(): number {
    const last = this.last();
    return last == null ? 1 : last.seq + 1;
  }

  append(entry: NewEntry): StoredEntry {
    const seq = this.nextSeq();
    const stored: StoredEntry = { ...entry, seq, id: `e${seq}` };
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(stored)}\n`, "utf8");
    // Keep an already-loaded array coherent instead of forcing a reload; a released/never-loaded store
    // stays released -- only the cheap last-entry cache needs to move.
    if (this.#entries != null) {
      this.#entries = [...this.#entries, stored];
      this.#onFullAccess?.(); // a hot chat that just got a new message stays hot
    }
    this.#last = stored;
    return stored;
  }

  get(id: string): StoredEntry | null {
    return this.#load().find((entry) => entry.id === id) ?? null;
  }

  /** Whether the full entry array is currently resident (vs. released/never loaded). Test/introspection
   * only -- no behavior depends on it, since every read transparently reloads either way. */
  isLoaded(): boolean {
    return this.#entries != null;
  }

  update(id: string, patch: (entry: StoredEntry) => StoredEntry): StoredEntry | null {
    const entries = this.#load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = entries[index]!;
    const next: StoredEntry = { ...patch(current), id: current.id, seq: current.seq };
    // A patch that leaves every field the same (e.g. PromptTracker re-patching an unchanged card) must
    // not pay for a whole-file rewrite.
    if (JSON.stringify(next) === JSON.stringify(current)) return current;
    this.#rewrite([...entries.slice(0, index), next, ...entries.slice(index + 1)]);
    return next;
  }

  tail(limit: number, beforeSeq?: number): TranscriptPage {
    const entries = this.#load();
    const boundary = beforeSeq == null ? -1 : entries.findIndex((entry) => entry.seq >= beforeSeq);
    const end = boundary < 0 ? entries.length : boundary;
    const start = Math.max(0, end - Math.max(0, limit));
    const page = entries.slice(start, end);
    const first = page[0];
    return start > 0 && first != null ? { entries: page, nextBeforeSeq: first.seq } : { entries: page };
  }

  /** Does NOT force a full load: once the full array is in memory it is authoritative, but a cold store
   * answers from the cheap last-entry cache (or a tail read of the file) instead. Deliberately does NOT
   * fire onFullAccess even when `#entries` happens to already be loaded -- a roster scan calls this for
   * every chat, and that must never promote a hot chat's recency, or scanning the whole roster would
   * reorder (and eventually evict) chats by iteration order instead of by actual use. */
  last(): StoredEntry | null {
    if (this.#entries != null) return this.#entries[this.#entries.length - 1] ?? null;
    if (this.#last === undefined) this.#last = this.#readLastFromTail();
    return this.#last;
  }

  /** Frees the full in-memory entry array for a chat that has gone cold (ChatService's LRU), keeping
   * only the cheap last-entry cache so `last()`/`nextSeq()`/`append()` keep working without a reload.
   * Any operation that needs the full history (readAll/get/update/tail) transparently reloads it. */
  release(): void {
    if (this.#entries == null) return;
    if (this.#last === undefined) this.#last = this.#entries[this.#entries.length - 1] ?? null;
    this.#entries = null;
  }

  #load(): readonly StoredEntry[] {
    if (this.#entries != null) {
      // Capture before firing the hook: with maxHotTranscripts set to 0 the hook can synchronously
      // release() this very store, which would null out `#entries` out from under a bare `return`.
      const entries = this.#entries;
      this.#onFullAccess?.();
      return entries;
    }
    let raw = "";
    try {
      raw = readFileSync(this.path, "utf8");
    } catch {
      raw = "";
    }
    const entries = parseLines(raw);
    this.#entries = entries;
    this.#last = entries[entries.length - 1] ?? null;
    this.#onFullAccess?.();
    return entries;
  }

  /** Reads just enough of the file's tail to find the last valid entry, growing the chunk until a whole
   * line is captured -- avoids loading the whole transcript merely to learn its last entry/seq. */
  #readLastFromTail(): StoredEntry | null {
    let fd: number;
    try {
      fd = openSync(this.path, "r");
    } catch {
      return null; // No file yet -> empty transcript.
    }
    try {
      const size = fstatSync(fd).size;
      if (size === 0) return null;
      let chunkSize = Math.min(size, TAIL_CHUNK_BYTES);
      for (;;) {
        const offset = size - chunkSize;
        const buffer = Buffer.alloc(chunkSize);
        const bytesRead = readSync(fd, buffer, 0, chunkSize, offset);
        const lines = buffer.toString("utf8", 0, bytesRead).split("\n");
        // The chunk may start mid-line when it does not cover the whole file; that leading fragment is
        // unusable and must not be mistaken for a (corrupt) complete line.
        const usable = offset > 0 ? lines.slice(1) : lines;
        for (let i = usable.length - 1; i >= 0; i -= 1) {
          const entry = parseLine(usable[i]!);
          if (entry != null) return entry;
        }
        if (offset === 0) return null; // Scanned the whole file; nothing valid in it.
        chunkSize = Math.min(size, chunkSize * 2);
      }
    } finally {
      closeSync(fd);
    }
  }

  #rewrite(entries: readonly StoredEntry[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
    writeFileSync(temp, entries.length > 0 ? `${body}\n` : "", "utf8");
    renameSync(temp, this.path);
    this.#entries = entries;
    this.#last = entries[entries.length - 1] ?? null;
  }
}
