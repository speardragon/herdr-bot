import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

function parseLines(raw: string): StoredEntry[] {
  const parsed: StoredEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isStoredEntry(value)) parsed.push(value);
    } catch {
      // Skip a corrupt line instead of losing the whole transcript.
    }
  }
  return parsed;
}

export class TranscriptStore {
  readonly path: string;
  #entries: readonly StoredEntry[] | null = null;

  constructor(path: string) {
    this.path = path;
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
    this.#entries = [...this.#load(), stored];
    return stored;
  }

  get(id: string): StoredEntry | null {
    return this.#load().find((entry) => entry.id === id) ?? null;
  }

  update(id: string, patch: (entry: StoredEntry) => StoredEntry): StoredEntry | null {
    const entries = this.#load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = entries[index]!;
    const next: StoredEntry = { ...patch(current), id: current.id, seq: current.seq };
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

  last(): StoredEntry | null {
    const entries = this.#load();
    return entries[entries.length - 1] ?? null;
  }

  #load(): readonly StoredEntry[] {
    if (this.#entries != null) return this.#entries;
    let raw = "";
    try {
      raw = readFileSync(this.path, "utf8");
    } catch {
      raw = "";
    }
    this.#entries = parseLines(raw);
    return this.#entries;
  }

  #rewrite(entries: readonly StoredEntry[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
    writeFileSync(temp, entries.length > 0 ? `${body}\n` : "", "utf8");
    renameSync(temp, this.path);
    this.#entries = entries;
  }
}
