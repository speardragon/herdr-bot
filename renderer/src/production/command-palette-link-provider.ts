import type { DesktopBridge } from "../recovered/contracts/desktop-bridge";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5058114
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=830042
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5517788

export interface CommandPaletteLink {
  readonly url: string;
}

export interface CommandPaletteLinkMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly hostname?: string;
  readonly faviconDataUrl?: string | null;
  readonly imageDataUrl?: string | null;
}

export type CommandPaletteLinkMetadataSnapshot =
  | { readonly status: "loading"; readonly value: Readonly<Record<string, CommandPaletteLinkMetadata>> }
  | { readonly status: "ready"; readonly value: Readonly<Record<string, CommandPaletteLinkMetadata>> }
  | { readonly status: "empty"; readonly value: Readonly<Record<string, CommandPaletteLinkMetadata>> }
  | { readonly status: "failed"; readonly value: Readonly<Record<string, CommandPaletteLinkMetadata>>; readonly error: string }
  | { readonly status: "unavailable"; readonly value: Readonly<Record<string, CommandPaletteLinkMetadata>> }
  | { readonly status: "cancelled"; readonly value: Readonly<Record<string, CommandPaletteLinkMetadata>> };

export interface CommandPaletteLinkMetadataProvider {
  getSnapshot(): CommandPaletteLinkMetadataSnapshot;
  subscribe(listener: () => void): () => void;
  setAvailable(available: boolean): void;
  setUrls(urls: readonly string[]): Promise<CommandPaletteLinkMetadataSnapshot>;
  cancel(): void;
  reset(): void;
  dispose(): void;
}

type LinkMetadataSource = Pick<DesktopBridge, "getLinkMetadata">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeCommandPaletteLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0 ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function commandPaletteLinkDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function commandPaletteLinksFromConversation(value: unknown): CommandPaletteLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const links: CommandPaletteLink[] = [];
  for (const candidate of value) {
    const url = normalizeCommandPaletteLink(candidate);
    if (url == null || seen.has(url)) continue;
    seen.add(url);
    links.push({ url });
  }
  return links;
}

function projectMetadata(value: unknown): CommandPaletteLinkMetadata | null {
  if (!isRecord(value)) return null;
  const metadata: { title?: string; description?: string; hostname?: string; faviconDataUrl?: string | null; imageDataUrl?: string | null } = {};
  const title = stringOrUndefined(value.title);
  const description = stringOrUndefined(value.description);
  const hostname = stringOrUndefined(value.hostname);
  if (title != null) metadata.title = title;
  if (description != null) metadata.description = description;
  if (hostname != null) metadata.hostname = hostname;
  if (typeof value.faviconDataUrl === "string" || value.faviconDataUrl === null) metadata.faviconDataUrl = value.faviconDataUrl;
  if (typeof value.imageDataUrl === "string" || value.imageDataUrl === null) metadata.imageDataUrl = value.imageDataUrl;
  return Object.values(metadata).some((entry) => entry != null && entry !== "") ? metadata : null;
}

function copyMetadata(value: Readonly<Record<string, CommandPaletteLinkMetadata>>): Readonly<Record<string, CommandPaletteLinkMetadata>> {
  return { ...value };
}

export function createCommandPaletteLinkMetadataProvider(source: LinkMetadataSource): CommandPaletteLinkMetadataProvider {
  const listeners = new Set<() => void>();
  let snapshot: CommandPaletteLinkMetadataSnapshot = { status: "unavailable", value: {} };
  let requestId = 0;
  let available = false;
  let disposed = false;

  const publish = (next: CommandPaletteLinkMetadataSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const cancelRequest = () => { requestId += 1; };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setAvailable(nextAvailable) {
      if (disposed || available === nextAvailable) return;
      cancelRequest();
      available = nextAvailable;
      publish(available ? { status: "empty", value: {} } : { status: "unavailable", value: {} });
    },
    async setUrls(rawUrls) {
      if (disposed || !available) return { status: "unavailable", value: {} };
      cancelRequest();
      const urls = [...new Set(rawUrls.map(normalizeCommandPaletteLink).filter((url): url is string => url != null))];
      if (urls.length === 0) {
        publish({ status: "empty", value: {} });
        return { status: "empty", value: {} };
      }
      const currentRequestId = requestId;
      const previous = snapshot.value;
      publish({ status: "loading", value: previous });
      try {
        const settled = await Promise.all(urls.map(async (url) => {
          try {
            const metadata = projectMetadata(await source.getLinkMetadata(url));
            return metadata == null ? null : [url, metadata] as const;
          } catch {
            return null;
          }
        }));
        if (disposed || currentRequestId !== requestId) return { status: "cancelled", value: previous };
        const value: Record<string, CommandPaletteLinkMetadata> = {};
        for (const entry of settled) if (entry != null) value[entry[0]] = entry[1];
        const next: CommandPaletteLinkMetadataSnapshot = Object.keys(value).length === 0 ? { status: "empty", value: {} } : { status: "ready", value: copyMetadata(value) };
        publish(next);
        return next;
      } catch (error) {
        if (disposed || currentRequestId !== requestId) return { status: "cancelled", value: previous };
        const next: CommandPaletteLinkMetadataSnapshot = { status: "failed", value: previous, error: error instanceof Error ? error.message : String(error) };
        publish(next);
        return next;
      }
    },
    cancel() {
      if (disposed) return;
      const previous = snapshot.value;
      cancelRequest();
      publish({ status: "cancelled", value: previous });
    },
    reset() {
      if (disposed) return;
      cancelRequest();
      publish(available ? { status: "empty", value: {} } : { status: "unavailable", value: {} });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelRequest();
      listeners.clear();
    }
  };
}
