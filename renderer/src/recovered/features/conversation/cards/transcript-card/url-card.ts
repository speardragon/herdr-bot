import type { DesktopBridge } from "../../../../contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5059259 (normalized HTTP URL helper)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=830042 (shared per-URL metadata provider)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#L1 (send-message:text bare-link consumer)
// @evidence src/app/dist/renderer/assets/view-BKPMMMAd.js#byteOffset=4426 (attachment legacy-link branch)

export interface LinkCardMetadata {
  readonly url?: string;
  readonly canonicalUrl?: string;
  readonly title?: string;
  readonly description?: string;
  readonly siteName?: string;
  readonly hostname?: string;
  readonly imageDataUrl?: string | null;
  readonly faviconDataUrl?: string | null;
  readonly fetchedAt?: number;
}

export type LinkMetadataResourceSnapshot =
  | { readonly status: "idle"; readonly value: null }
  | { readonly status: "loading"; readonly value: null }
  | { readonly status: "ready"; readonly value: LinkCardMetadata }
  | { readonly status: "empty"; readonly value: null }
  | { readonly status: "failed"; readonly value: null; readonly error: unknown };

export interface LinkMetadataResource {
  get(): LinkMetadataResourceSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<LinkMetadataResourceSnapshot>;
  reset(): void;
  heal(): Promise<LinkMetadataResourceSnapshot>;
}

export interface LinkMetadataRevision {
  get(): number;
  subscribe(listener: () => void): () => void;
}

export interface UrlCardProvider {
  stateFor(url: string): LinkMetadataResource;
  cachedValue(url: string): LinkCardMetadata | null;
  readonly revision: LinkMetadataRevision;
  noteReconnect(): void;
  noteWindowFocus(): void;
  reset(): void;
  openExternal(url: string): Promise<boolean>;
  dispose(): void;
}

export type UrlCardProviderSource = Pick<DesktopBridge, "getLinkMetadata" | "openExternal">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Mirrors the shipped link normalizer used by both message and attachment cards. */
export function normalizeLinkUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

interface RichTextDocument {
  readonly type?: unknown;
  readonly content?: readonly RichTextNode[];
}

interface RichTextNode {
  readonly type?: unknown;
  readonly text?: unknown;
  readonly content?: readonly RichTextNode[];
  readonly marks?: readonly { readonly type?: unknown; readonly attrs?: Record<string, unknown> }[];
}

function richTextBareLink(value: string): string | null {
  let document: RichTextDocument;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.type !== "doc" || !Array.isArray(parsed.content)) return null;
    document = parsed as RichTextDocument;
  } catch {
    return null;
  }
  const paragraphs = document.content?.filter((node) => node.type === "paragraph") ?? [];
  if (paragraphs.length !== 1) return null;
  const content = paragraphs[0]?.content?.filter((node) => node.type !== "text" || typeof node.text !== "string" || node.text.trim().length > 0) ?? [];
  if (content.length !== 1) return null;
  const node = content[0];
  if (node?.type !== "text" || typeof node.text !== "string" || node.marks?.some((mark) => mark.type === "code") === true) return null;
  const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
  return normalizeLinkUrl(typeof href === "string" ? href : node.text);
}

/** Extracts only the shipped single-bare-link form; rich text is accepted only when structurally exact. */
export function extractBareLink(content: string, richText?: string): string | null {
  const rich = richText == null ? null : richTextBareLink(richText);
  if (rich != null) return rich;
  const trimmed = content.trim();
  const markdown = /^\[[^\]\n]*\]\(\s*([^\)\s]+)(?:\s+[^)]*)?\)\s*$/.exec(trimmed);
  return normalizeLinkUrl(markdown?.[1] ?? trimmed);
}

/** Applies the send-message:text guards before extracting its bare URL. */
export function extractSendMessageTextLink(entry: unknown): string | null {
  if (!isRecord(entry) || entry.kind !== "send-message" || entry.streaming === true || !isRecord(entry.message) || entry.message.type !== "text" || typeof entry.message.content !== "string") return null;
  if (Array.isArray(entry.message.images) && entry.message.images.length > 0) return null;
  return extractBareLink(entry.message.content);
}

/** Legacy attachment links use the same normalized HTTP URL contract. */
export function extractLegacyAttachmentLink(url: string): string | null {
  return normalizeLinkUrl(url);
}

export function projectLinkMetadata(value: unknown): LinkCardMetadata | null {
  if (!isRecord(value)) return null;
  const metadata: LinkCardMetadata = {
    ...(nonEmptyString(value.url) == null ? {} : { url: nonEmptyString(value.url) }),
    ...(nonEmptyString(value.canonicalUrl) == null ? {} : { canonicalUrl: nonEmptyString(value.canonicalUrl) }),
    ...(nonEmptyString(value.title) == null ? {} : { title: nonEmptyString(value.title) }),
    ...(nonEmptyString(value.description) == null ? {} : { description: nonEmptyString(value.description) }),
    ...(nonEmptyString(value.siteName) == null ? {} : { siteName: nonEmptyString(value.siteName) }),
    ...(nonEmptyString(value.hostname) == null ? {} : { hostname: nonEmptyString(value.hostname) }),
    ...(nullableString(value.imageDataUrl) === undefined ? {} : { imageDataUrl: nullableString(value.imageDataUrl) }),
    ...(nullableString(value.faviconDataUrl) === undefined ? {} : { faviconDataUrl: nullableString(value.faviconDataUrl) }),
    ...(finiteNumber(value.fetchedAt) == null ? {} : { fetchedAt: finiteNumber(value.fetchedAt) }),
  };
  const hasCardValue = [metadata.title, metadata.description, metadata.hostname, metadata.imageDataUrl, metadata.faviconDataUrl]
    .some((candidate) => candidate != null && candidate !== "");
  return hasCardValue ? metadata : null;
}

interface ResourceEntry {
  snapshot: LinkMetadataResourceSnapshot;
  listeners: Set<() => void>;
  watchers: number;
  requestGeneration: number;
  request: Promise<LinkMetadataResourceSnapshot> | null;
  publicResource: LinkMetadataResource | null;
}

const EMPTY_RESOURCE: LinkMetadataResourceSnapshot = { status: "empty", value: null };

export function createUrlCardProvider(source: UrlCardProviderSource): UrlCardProvider {
  const entries = new Map<string, ResourceEntry>();
  const revisionListeners = new Set<() => void>();
  let revision = 0;
  let disposed = false;

  const emitRevision = () => {
    revision += 1;
    for (const listener of [...revisionListeners]) listener();
  };
  const notify = (entry: ResourceEntry) => {
    for (const listener of [...entry.listeners]) listener();
  };
  const entryFor = (rawUrl: string): ResourceEntry | null => {
    const url = normalizeLinkUrl(rawUrl);
    if (url == null) return null;
    const existing = entries.get(url);
    if (existing != null) return existing;
    const created: ResourceEntry = {
      snapshot: { status: "idle", value: null },
      listeners: new Set(),
      watchers: 0,
      requestGeneration: 0,
      request: null,
      publicResource: null,
    };
    entries.set(url, created);
    return created;
  };
  const loadEntry = (url: string, entry: ResourceEntry, healFailed: boolean): Promise<LinkMetadataResourceSnapshot> => {
    if (disposed) return Promise.resolve(entry.snapshot);
    if (entry.request != null) return entry.request;
    if (!healFailed && (entry.snapshot.status === "ready" || entry.snapshot.status === "empty" || entry.snapshot.status === "failed")) return Promise.resolve(entry.snapshot);
    const requestGeneration = ++entry.requestGeneration;
    entry.snapshot = { status: "loading", value: null };
    notify(entry);
    const request = source.getLinkMetadata(url).then((raw) => {
      if (disposed || requestGeneration !== entry.requestGeneration) return entry.snapshot;
      const metadata = projectLinkMetadata(raw);
      entry.snapshot = metadata == null ? EMPTY_RESOURCE : { status: "ready", value: metadata };
      if (entry.snapshot.status === "ready") emitRevision();
      notify(entry);
      return entry.snapshot;
    }, (error: unknown) => {
      if (disposed || requestGeneration !== entry.requestGeneration) return entry.snapshot;
      entry.snapshot = { status: "failed", value: null, error };
      notify(entry);
      return entry.snapshot;
    }).finally(() => {
      if (entry.request === request) entry.request = null;
    });
    entry.request = request;
    return request;
  };
  const publicResource = (url: string, entry: ResourceEntry): LinkMetadataResource => entry.publicResource ??= {
    get: () => entry.snapshot,
    subscribe(listener) {
      if (disposed) return () => {};
      entry.watchers += 1;
      entry.listeners.add(listener);
      void loadEntry(url, entry, false);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        entry.watchers = Math.max(0, entry.watchers - 1);
        entry.listeners.delete(listener);
      };
    },
    load: () => loadEntry(url, entry, false),
    reset() {
      entry.requestGeneration += 1;
      entry.request = null;
      entry.snapshot = { status: "idle", value: null };
      notify(entry);
    },
    heal: () => loadEntry(url, entry, true),
  };

  const healWatchedFailures = () => {
    if (disposed) return;
    for (const [url, entry] of entries) if (entry.watchers > 0 && entry.snapshot.status === "failed") void loadEntry(url, entry, true);
  };

  return {
    stateFor(url) {
      const normalized = normalizeLinkUrl(url);
      const entry = normalized == null ? null : entryFor(normalized);
      if (normalized == null || entry == null) return { get: () => EMPTY_RESOURCE, subscribe: () => () => {}, load: async () => EMPTY_RESOURCE, reset: () => {}, heal: async () => EMPTY_RESOURCE };
      return publicResource(normalized, entry);
    },
    cachedValue(url) {
      const normalized = normalizeLinkUrl(url);
      const value = normalized == null ? null : entries.get(normalized)?.snapshot;
      return value?.status === "ready" ? value.value : null;
    },
    revision: {
      get: () => revision,
      subscribe(listener) {
        if (disposed) return () => {};
        revisionListeners.add(listener);
        return () => revisionListeners.delete(listener);
      },
    },
    noteReconnect: healWatchedFailures,
    noteWindowFocus: healWatchedFailures,
    reset() {
      if (disposed) return;
      for (const entry of entries.values()) entry.publicResource?.reset();
      emitRevision();
    },
    async openExternal(url) {
      if (disposed) return false;
      const normalized = normalizeLinkUrl(url);
      if (normalized == null) return false;
      await source.openExternal(normalized);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) {
        entry.requestGeneration += 1;
        entry.request = null;
        entry.listeners.clear();
      }
      entries.clear();
      revisionListeners.clear();
    },
  };
}
