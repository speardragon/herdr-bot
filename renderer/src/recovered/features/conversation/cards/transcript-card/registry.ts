import type { TranscriptCardEntryType, TranscriptCardProtocolKey } from "./protocol";
import { transcriptCardProtocolKey } from "./protocol";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5101117 (five shared frame variants)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5101409 (shared frame owner)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5102211 (data-group-start projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5108848 (cursor-agent lazy view)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5106681 (email-draft lazy view)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5107027 (slack-draft lazy view)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5107184 (widget lazy view)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104265 (cursor placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104417 (email placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104568 (Slack placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5105323 (widget placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5103854 (auto-review placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104608 (listener-connect placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5108848 (auto-review/listener lazy view map)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104265 (secret-request placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5103701 (attachment placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104000 (singular connector placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104000 (connectors placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5104433 (local-tool-permission placeholder metadata)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5108848 (singular connector lazy view map)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5108848 (connectors lazy view map)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5108848 (send-message:text lazy view map)
// @evidence src/app/dist/renderer/assets/view-BuhxMXKm.js#SHA256=6cd34b5d7aab0eef9827abe2fbe0a104108ef1052c650e5777d8638b08ff31e3
// @evidence recovered/frontend/app/assets/view-BuhxMXKm.js#SHA256=7739de70b21898f6b8e052d785c1b6239b25d902f35bc2c08c728df9567947e9

export type TranscriptCardFrameVariant = "tab" | "link" | "file" | "widget" | "question";

export interface TranscriptCardFrame {
  readonly variant: TranscriptCardFrameVariant;
  /** The route-specific wrapper selector supplied to the immutable frame. */
  readonly className: string;
}

export interface TranscriptCardMetadata {
  readonly protocolKey: TranscriptCardProtocolKey;
  readonly entryKind: "send-message";
  readonly entryType: TranscriptCardEntryType;
  readonly placeholderHeight: number;
  /** Null for local-tool-permission and branch-selected attachment media. */
  readonly frame: TranscriptCardFrame | null;
  readonly sourcePath: string;
  readonly chunkFile: string;
}

const metadata = (entryType: TranscriptCardEntryType, placeholderHeight: number, sourcePath: string, chunkFile: string, frame: TranscriptCardFrame | null): TranscriptCardMetadata => ({
  protocolKey: transcriptCardProtocolKey(entryType),
  entryKind: "send-message",
  entryType,
  placeholderHeight,
  frame,
  sourcePath,
  chunkFile,
});

export const TRANSCRIPT_CARD_REGISTRY: Readonly<Record<TranscriptCardProtocolKey, TranscriptCardMetadata>> = Object.freeze({
  "send-message:text": metadata(
    "text",
    60,
    "/src/electron-renderer/features/chat/cards/send-message/text/view.tsx",
    "view-BuhxMXKm.js",
    null,
  ),
  "send-message:widget": metadata(
    "widget",
    168,
    "/src/electron-renderer/features/chat/cards/send-message/widget/view.tsx",
    "view-CIFdOvCz.js",
    { variant: "question", className: "sand-widget-wrap" },
  ),
  "send-message:cursor-agent": metadata(
    "cursor-agent",
    180,
    "/src/electron-renderer/features/chat/cards/send-message/cursor-agent/view.tsx",
    "view-CizPQWLy.js",
    { variant: "question", className: "sand-cursor-agent-card-wrap" },
  ),
  "send-message:email-draft": metadata(
    "email-draft",
    200,
    "/src/electron-renderer/features/chat/cards/send-message/email-draft/view.tsx",
    "view-ClhdNXKM.js",
    { variant: "question", className: "sand-email-composer-wrap" },
  ),
  "send-message:slack-draft": metadata(
    "slack-draft",
    150,
    "/src/electron-renderer/features/chat/cards/send-message/slack-draft/view.tsx",
    "view-DyaeCHiE.js",
    { variant: "question", className: "sand-slack-composer-wrap" },
  ),
  "send-message:auto-review-approval": metadata(
    "auto-review-approval",
    152,
    "/src/electron-renderer/features/chat/cards/send-message/auto-review-approval/view.tsx",
    "view-QqBtBG74.js",
    { variant: "widget", className: "sand-auto-review-approval-wrap" },
  ),
  "send-message:listener-connect": metadata(
    "listener-connect",
    154,
    "/src/electron-renderer/features/chat/cards/send-message/listener-connect/view.tsx",
    "view-3mdFcnEj.js",
    { variant: "tab", className: "sand-tab-card-wrap" },
  ),
  "send-message:secret-request": metadata(
    "secret-request",
    134,
    "/src/electron-renderer/features/chat/cards/send-message/secret-request/view.tsx",
    "view-HYU0bFxa.js",
    { variant: "question", className: "sand-secret-request-wrap" },
  ),
  "send-message:attachment": metadata(
    "attachment",
    60,
    "/src/electron-renderer/features/chat/cards/send-message/attachment/view.tsx",
    "view-BKPMMMAd.js",
    null,
  ),
  "send-message:connector": metadata(
    "connector",
    76,
    "/src/electron-renderer/features/chat/cards/send-message/connector/view.tsx",
    "view-D9Ei08gq.js",
    { variant: "question", className: "sand-connector-card-wrap" },
  ),
  "send-message:connectors": metadata(
    "connectors",
    76,
    "/src/electron-renderer/features/chat/cards/send-message/connectors/view.tsx",
    "view-DqTN67x_.js",
    { variant: "question", className: "sand-connector-list-wrap" },
  ),
  "send-message:local-tool-permission": metadata(
    "local-tool-permission",
    32,
    "/src/electron-renderer/features/chat/cards/send-message/local-tool-permission/view.tsx",
    "view-DW7RVxhH.js",
    null,
  ),
});

export interface TranscriptCardViewProps {
  readonly entry: unknown;
  readonly adjacency?: { isGroupStart?: boolean; isGroupEnd?: boolean };
  readonly isStale?: boolean;
  readonly isKeyboardTarget?: boolean;
  readonly actionVerb: null;
}

export interface TranscriptCardViewModule {
  default: (props: TranscriptCardViewProps) => unknown;
}

export type TranscriptCardViewLoader = () => Promise<TranscriptCardViewModule>;

export type TranscriptCardViewLoaders = Partial<Record<TranscriptCardProtocolKey, TranscriptCardViewLoader>>;

export interface TranscriptCardRegistry {
  metadata(protocolKey: TranscriptCardProtocolKey): TranscriptCardMetadata;
  load(protocolKey: TranscriptCardProtocolKey): Promise<TranscriptCardViewModule | null>;
}

export function createTranscriptCardRegistry(loaders: TranscriptCardViewLoaders = {}): TranscriptCardRegistry {
  return {
    metadata(protocolKey) {
      return TRANSCRIPT_CARD_REGISTRY[protocolKey];
    },
    async load(protocolKey) {
      const loader = loaders[protocolKey];
      return loader == null ? null : await loader();
    },
  };
}

export function transcriptCardMetadataForType(type: TranscriptCardEntryType): TranscriptCardMetadata {
  return TRANSCRIPT_CARD_REGISTRY[transcriptCardProtocolKey(type)];
}
