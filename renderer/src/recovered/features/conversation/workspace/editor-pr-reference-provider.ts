import type { CloudAgentInfo, CloudAgentProvider, CloudAgentWatcher } from "../cards/transcript-card/cloud-agent-provider";
import type { TranscriptCardEntry } from "../cards/transcript-card/protocol";
import type { ConversationTranscriptEntry, TranscriptMessage } from "./model";
import type { PromptEditorPrReference } from "./rich-text-editor";

// Immutable PR candidate projection:
// Mac index-UbX-y3il.js SHA-256 ef4e9831b65d39633f09c9ad0c083b98b7ebf52e3bb558182aee5bde31f876fa:
// URL/node extraction and priority merge at byte offsets 5292050-5295640.
// Windows index-UbX-y3il.js SHA-256 80464803b50f478598080bdc1b91da3996c6b74168e2351ea26f620f2ec62ba5:
// corresponding extraction/merge at byte offsets 6649107-6653946.
// The immutable root supplies these candidates from the current transcript and
// cloud-agent watcher state; there is no PR search coordinator method.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5292050
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5295640
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6649107
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6653946

const GITHUB_PULL_REQUEST_PATH = /^\/[^/]+\/[^/]+\/pull\/(\d+)(?:\/|$)/u;
const CURSOR_PULL_REQUEST_PATH = /^\/github\/pr\/[^/]+\/[^/]+\/(\d+)(?:\/|$)/u;
const URL_RE = /https?:\/\/[^\s<>()[\]]+/gu;
const VALID_NUMBER = /^\d+$/u;

type CandidateSource = "node" | "cloud" | "text";

export interface EditorPrReferenceCandidate extends PromptEditorPrReference {
  readonly source: CandidateSource;
  readonly state?: string;
}

export interface EditorPrReferenceScope {
  readonly accountKey: string | null;
  readonly agentId: string | null;
}

export interface EditorPrReferenceWatcherSource {
  watchInfo(bcId: string): CloudAgentWatcher;
}

export interface EditorPrReferenceProvider {
  getCandidates(): readonly PromptEditorPrReference[];
  getDetailedCandidates(): readonly EditorPrReferenceCandidate[];
  subscribe(listener: () => void): () => void;
  setScope(scope: EditorPrReferenceScope): void;
  setEntries(entries: readonly ConversationTranscriptEntry[]): void;
  reset(): void;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && VALID_NUMBER.test(value) ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function candidateFromUrl(value: string): { prNumber: number; url: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();
  const match = hostname === "github.com" || hostname === "www.github.com"
    ? GITHUB_PULL_REQUEST_PATH.exec(url.pathname)
    : hostname === "review.cursor.com" ? CURSOR_PULL_REQUEST_PATH.exec(url.pathname) : null;
  const prNumber = match == null ? null : positiveNumber(match[1]);
  return prNumber == null ? null : { prNumber, url: value };
}

function candidatesFromText(text: string): EditorPrReferenceCandidate[] {
  const result: EditorPrReferenceCandidate[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0]!.replace(/[.,;:!?]+$/u, "");
    const candidate = candidateFromUrl(raw);
    if (candidate != null) result.push({ ...candidate, title: null, source: "text" });
  }
  return result;
}

function markLinkHref(node: Record<string, unknown>): string | null {
  if (!Array.isArray(node.marks)) return null;
  for (const mark of node.marks) {
    if (!isRecord(mark) || mark.type !== "link" || !isRecord(mark.attrs)) continue;
    const href = mark.attrs.href;
    if (typeof href === "string") return href;
  }
  return null;
}

function candidatesFromRichTextNode(node: unknown, output: EditorPrReferenceCandidate[]): void {
  if (!isRecord(node)) return;
  if (node.type === "prReference" && isRecord(node.attrs)) {
    const prNumber = positiveNumber(node.attrs.prNumber);
    if (prNumber != null) output.push({
      prNumber,
      title: optionalText(node.attrs.title),
      url: optionalText(node.attrs.url),
      source: "node",
    });
  } else if (node.type === "text") {
    const text = typeof node.text === "string" ? node.text : "";
    output.push(...candidatesFromText(text));
    const href = markLinkHref(node);
    const candidate = href == null ? null : candidateFromUrl(href);
    if (candidate != null) output.push({ ...candidate, title: null, source: "text" });
  }
  if (Array.isArray(node.content)) for (const child of node.content) candidatesFromRichTextNode(child, output);
}

function messageText(entry: TranscriptMessage | TranscriptCardEntry): string {
  if (entry.kind === "message") return entry.text;
  return entry.message.type === "text" ? entry.message.content : "";
}

function richTextFor(entry: TranscriptMessage | TranscriptCardEntry): string | undefined {
  return entry.kind === "message" ? entry.richText : undefined;
}

function candidatesFromEntry(entry: ConversationTranscriptEntry): EditorPrReferenceCandidate[] {
  if (entry.kind === "message" || entry.kind === "send-message") {
    const richText = richTextFor(entry);
    if (richText != null && richText.length > 0) {
      try {
        const parsed: unknown = JSON.parse(richText);
        if (isRecord(parsed) && parsed.type === "doc") {
          const result: EditorPrReferenceCandidate[] = [];
          candidatesFromRichTextNode(parsed, result);
          return result;
        }
      } catch {
        // The immutable path falls back to plain text when persisted JSON is invalid.
      }
    }
    return candidatesFromText(messageText(entry));
  }
  return [];
}

function cloudCandidate(entry: TranscriptCardEntry, info: CloudAgentInfo | null): EditorPrReferenceCandidate[] {
  if (entry.message.type !== "cursor-agent" || info?.prNumber == null || !Number.isInteger(info.prNumber) || info.prNumber <= 0) return [];
  return [{
    prNumber: info.prNumber,
    title: optionalText(info.name) ?? optionalText(entry.message.title),
    url: optionalText(info.prUrl),
    ...(optionalText(info.prState) == null ? {} : { state: optionalText(info.prState) as string }),
    source: "cloud",
  }];
}

function projectCandidates(entries: readonly ConversationTranscriptEntry[], cloudInfo: ReadonlyMap<string, CloudAgentInfo | null>): EditorPrReferenceCandidate[] {
  const byNumber = new Map<number, { index: number; priority: number; candidate: EditorPrReferenceCandidate }>();
  const orderedNumbers: number[] = [];
  const priority: Record<CandidateSource, number> = { text: 0, cloud: 1, node: 2 };
  const add = (candidate: EditorPrReferenceCandidate) => {
    if (!Number.isInteger(candidate.prNumber) || candidate.prNumber <= 0) return;
    const existing = byNumber.get(candidate.prNumber);
    if (existing == null) {
      byNumber.set(candidate.prNumber, { index: orderedNumbers.length, priority: priority[candidate.source], candidate });
      orderedNumbers.push(candidate.prNumber);
      return;
    }
    if (priority[candidate.source] > existing.priority) byNumber.set(candidate.prNumber, { ...existing, priority: priority[candidate.source], candidate });
  };
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry == null) continue;
    for (const candidate of candidatesFromEntry(entry)) add(candidate);
    if (entry.kind === "send-message" && entry.message.type === "cursor-agent") {
      for (const candidate of cloudCandidate(entry, cloudInfo.get(entry.message.bcId) ?? null)) add(candidate);
    }
  }
  return orderedNumbers.flatMap((number) => byNumber.get(number)?.candidate ?? []);
}

export function projectEditorPrReferenceCandidates(entries: readonly ConversationTranscriptEntry[], cloudInfos: ReadonlyMap<string, CloudAgentInfo | null> = new Map()): readonly EditorPrReferenceCandidate[] {
  return projectCandidates(entries, cloudInfos);
}

function sameScope(left: EditorPrReferenceScope, right: EditorPrReferenceScope): boolean {
  return left.accountKey === right.accountKey && left.agentId === right.agentId;
}

export function createEditorPrReferenceProvider(input: { readonly cloudAgents: EditorPrReferenceWatcherSource }): EditorPrReferenceProvider {
  const listeners = new Set<() => void>();
  const watchers = new Map<string, { watcher: CloudAgentWatcher; unsubscribe: () => void }>();
  let scope: EditorPrReferenceScope = { accountKey: null, agentId: null };
  let entries: readonly ConversationTranscriptEntry[] = [];
  let candidates: readonly EditorPrReferenceCandidate[] = [];
  let disposed = false;

  const emit = () => { if (!disposed) for (const listener of [...listeners]) listener(); };
  const recompute = () => {
    if (disposed || scope.accountKey == null || scope.agentId == null) { candidates = []; emit(); return; }
    const cloudInfos = new Map<string, CloudAgentInfo | null>();
    for (const [bcId, record] of watchers) {
      const snapshot = record.watcher.getSnapshot();
      cloudInfos.set(bcId, snapshot.status === "ready" ? snapshot.value : snapshot.previous);
    }
    candidates = projectCandidates(entries, cloudInfos);
    emit();
  };
  const releaseWatchers = () => {
    for (const record of watchers.values()) { record.unsubscribe(); record.watcher.release(); }
    watchers.clear();
  };
  const reconcileWatchers = () => {
    const needed = new Set(entries.flatMap((entry) => entry.kind === "send-message" && entry.message.type === "cursor-agent" ? [entry.message.bcId] : []));
    for (const [bcId, record] of watchers) if (!needed.has(bcId)) { record.unsubscribe(); record.watcher.release(); watchers.delete(bcId); }
    if (scope.accountKey == null || scope.agentId == null) return;
    for (const bcId of needed) if (!watchers.has(bcId)) {
      const watcher = input.cloudAgents.watchInfo(bcId);
      const record = { watcher, unsubscribe: () => {} };
      watchers.set(bcId, record);
      const unsubscribe = watcher.subscribe(recompute);
      record.unsubscribe = unsubscribe;
    }
  };
  const provider: EditorPrReferenceProvider = {
    getCandidates: () => candidates.map(({ source, state, ...candidate }) => candidate),
    getDetailedCandidates: () => candidates,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    setScope(nextScope) {
      if (disposed || sameScope(scope, nextScope)) return;
      scope = { accountKey: nextScope.accountKey, agentId: nextScope.agentId };
      releaseWatchers();
      reconcileWatchers();
      recompute();
    },
    setEntries(nextEntries) {
      if (disposed) return;
      entries = [...nextEntries];
      reconcileWatchers();
      recompute();
    },
    reset() { if (disposed) return; entries = []; releaseWatchers(); candidates = []; emit(); },
    dispose() { if (disposed) return; disposed = true; releaseWatchers(); listeners.clear(); entries = []; candidates = []; },
  };
  return provider;
}
