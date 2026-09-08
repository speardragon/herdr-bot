import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import type { TranscriptCardEntry } from "./protocol";
import { classifySendMessageTextUrl } from "./send-message-text";
import type { TranscriptMessage } from "../../workspace/model";
import type { TranscriptThreadSummary } from "./thread-summary-controller";
import { ThreadAffordance } from "./thread-affordance";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5084871 (message action eligibility/labels)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5086012 (mCn action anchor, selectors, focus lifecycle)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5097299 (reply quote target navigation)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5098582 (Roe replyTo projection and action owner)

/** The raw user-attachment shape accepted by the immutable action owner. */
export interface TranscriptUserAttachmentActionEntry {
  readonly kind: "user-attachment";
  readonly id: string;
  readonly file_path: string;
  readonly file_name?: string;
  readonly replyTo?: string;
}

/**
 * The three and only three discriminants accepted by mCn/Roe. send-message
 * text is represented as TranscriptMessage by the current production model;
 * the raw card union remains available for the other send-message types.
 */
export type TranscriptCardActionEntry = TranscriptMessage | TranscriptCardEntry | TranscriptUserAttachmentActionEntry;

/** Shared action contract for ordinary messages, cards, and raw user attachments. */
export interface TranscriptMessageReactionSlotProps {
  readonly entry: TranscriptCardActionEntry;
  readonly isReadOnly: boolean;
  readonly threadRootId: string | null;
  readonly isDeliveryActionable: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export type RenderTranscriptMessageReactionActions = (props: TranscriptMessageReactionSlotProps) => ReactNode;

export interface TranscriptCardInteractionContext {
  readonly threadRootId: string | null;
  readonly isReadOnly: boolean;
  onReply(entryId: string): void;
  onThread(entryId: string): void;
  getThreadSummary(entryId: string): TranscriptThreadSummary | null;
  openThread(targetId: string): void;
  resolveEntry(targetId: string): TranscriptCardActionEntry | null;
  scrollToEntry(targetId: string): void;
  isEntryInScope(targetId: string): boolean;
}

const TranscriptCardInteractionContext = createContext<TranscriptCardInteractionContext | null>(null);

export function TranscriptCardInteractionProvider({ value, children }: { value: TranscriptCardInteractionContext; children: ReactNode }) {
  return <TranscriptCardInteractionContext.Provider value={value}>{children}</TranscriptCardInteractionContext.Provider>;
}

export function useTranscriptCardInteractionContext(): TranscriptCardInteractionContext | null {
  return useContext(TranscriptCardInteractionContext);
}

export function isTranscriptCardActionEntry(value: unknown): value is TranscriptCardActionEntry {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const candidate = value as { kind?: unknown; id?: unknown };
  return (candidate.kind === "message" || candidate.kind === "send-message" || candidate.kind === "user-attachment")
    && typeof candidate.id === "string"
    && candidate.id.length > 0;
}

/** Roe's parent-reply projection, normalized to the current recovery model. */
export function replyTargetIdForTranscriptCardEntry(entry: TranscriptCardActionEntry): string | undefined {
  if (entry.kind === "user-attachment") return entry.replyTo;
  return entry.replyToId;
}

export interface TranscriptCardCopyProjection {
  readonly text: string;
}

/**
 * Copy is exact only for projected transcript message text and the shipped
 * send-message:text card. Other card payloads and raw attachment paths have
 * no immutable copy-content contract, so they stay fail-closed.
 */
export function projectTranscriptCardCopy(entry: TranscriptCardActionEntry): TranscriptCardCopyProjection | null {
  if (entry.kind === "message") return entry.text.length === 0 ? null : { text: entry.text };
  if (entry.kind === "send-message" && entry.message.type === "text") {
    if (classifySendMessageTextUrl(entry) != null || entry.message.content.length === 0) return null;
    return { text: entry.message.content };
  }
  return null;
}

function messageRole(entry: TranscriptCardActionEntry): "user" | "assistant" {
  if (entry.kind === "message") return entry.role;
  if (entry.kind === "user-attachment") return "user";
  return "assistant";
}

function messageAuthor(entry: TranscriptCardActionEntry): string {
  if (entry.kind === "message") return entry.role === "user" ? "your message" : entry.author;
  return entry.kind === "user-attachment" ? "your message" : "Agent";
}

export function transcriptMessageActionsLabel(entry: TranscriptCardActionEntry): string {
  return `Message actions for ${messageAuthor(entry)} (${entry.id})`;
}

export function transcriptReplyActionLabel(entry: TranscriptCardActionEntry): string {
  if (messageRole(entry) === "user") return "Reply to your message";
  const author = messageAuthor(entry).replace(/\s+/gu, " ").trim();
  const bounded = author.length > 60 ? `${author.slice(0, 59).trimEnd()}…` : author;
  return `Reply to ${bounded.length > 0 ? bounded : "Agent"} message`;
}

export function isMessageContextTargetExcluded(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('a[href], img, input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .sand-attachment__image-button') != null) return true;
  const selection = window.getSelection();
  if (selection == null || selection.isCollapsed || selection.toString().length === 0) return false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    try {
      if (selection.getRangeAt(index).intersectsNode(target)) return true;
    } catch {
      // A detached target is not an eligible context-menu selection.
    }
  }
  return false;
}

const FOCUS_DATASET_KEY = "sandArmedFocusLabel";

export function armTranscriptActionFocus(anchor: HTMLElement | null, target: Element | null): void {
  if (anchor == null || target == null) return;
  const label = target.closest("button")?.getAttribute("aria-label");
  if (label != null) anchor.dataset[FOCUS_DATASET_KEY] = label;
}

export function restoreTranscriptActionFocus(anchor: HTMLElement | null): boolean {
  if (anchor == null) return false;
  const label = anchor.dataset[FOCUS_DATASET_KEY];
  if (label == null) return false;
  delete anchor.dataset[FOCUS_DATASET_KEY];
  for (const button of anchor.querySelectorAll("button")) {
    if (button.getAttribute("aria-label") !== label) continue;
    button.focus();
    return true;
  }
  return false;
}

export interface TranscriptCardActionAnchorProps {
  readonly entry: TranscriptCardActionEntry;
  readonly children: ReactNode;
  readonly onCopy?: () => void | Promise<void>;
  readonly isReadOnly?: boolean;
  readonly threadRootId?: string | null;
  readonly isDeliveryActionable?: boolean;
  readonly renderReactionActions?: RenderTranscriptMessageReactionActions;
}

type ActionChildProps = {
  className?: string;
  children?: ReactNode;
  onContextMenu?: (event: MouseEvent) => void;
  onFocusCapture?: (event: FocusEvent) => void;
  onPointerEnter?: (event: ReactPointerEvent) => void;
  ref?: (element: HTMLElement | null) => void;
};

function swallowCopyFailure(onCopy: () => void | Promise<void>): void {
  try {
    void Promise.resolve(onCopy()).catch(() => undefined);
  } catch {
    // The shipped action owner intentionally does not surface clipboard/action errors.
  }
}

function clipboardCopyForEntry(entry: TranscriptCardActionEntry): (() => void | Promise<void>) | undefined {
  const projection = projectTranscriptCardCopy(entry);
  if (projection == null) return undefined;
  return () => {
    if (typeof navigator === "undefined" || navigator.clipboard == null) return;
    return navigator.clipboard.writeText(projection.text);
  };
}

/** Leaf-only mCn equivalent. It deliberately does not add delivery gating or transport state. */
export function TranscriptCardActionAnchor({ entry, children, onCopy, isReadOnly, threadRootId, isDeliveryActionable = true, renderReactionActions }: TranscriptCardActionAnchorProps) {
  const context = useTranscriptCardInteractionContext();
  const effectiveOnCopy = onCopy ?? clipboardCopyForEntry(entry);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node) || anchorRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      restoreTranscriptActionFocus(anchorRef.current);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  if (!isTranscriptCardActionEntry(entry)) return <>{children}</>;

  const effectiveReadOnly = isReadOnly ?? context?.isReadOnly ?? false;
  const effectiveThreadRootId = threadRootId ?? context?.threadRootId ?? null;
  const isThreadActionVisible = context != null && !effectiveReadOnly && effectiveThreadRootId == null;
  const hasContextActions = context != null && (!effectiveReadOnly || isThreadActionVisible || effectiveOnCopy != null);
  const hasReactionActions = renderReactionActions != null && !effectiveReadOnly && isDeliveryActionable;
  if (!hasContextActions && !hasReactionActions) return <>{children}</>;

  const reactionActions = hasReactionActions
    ? renderReactionActions({
      entry,
      isReadOnly: effectiveReadOnly,
      threadRootId: effectiveThreadRootId,
      isDeliveryActionable,
      onOpenChange: (open) => {
        setReactionMenuOpen(open);
        if (open) setMenuOpen(false);
      },
    })
    : null;

  const rememberFocus = (target: EventTarget | null) => {
    armTranscriptActionFocus(anchorRef.current, target instanceof Element ? target : null);
  };
  const copy = () => {
    setMenuOpen(false);
    if (effectiveOnCopy != null) swallowCopyFailure(effectiveOnCopy);
  };
  const child = Children.only(children);
  if (!isValidElement(child)) return <>{children}</>;
  const childWithProps = child as ReactElement<ActionChildProps>;
  const childProps = childWithProps.props;
  const childRef = childProps.ref;
  const setAnchor = (element: HTMLElement | null) => {
    anchorRef.current = element;
    if (typeof childRef === "function") childRef(element);
  };
  const actionClassName = [childProps.className, "sand-message-action-anchor", menuOpen || reactionMenuOpen ? "sand-message-action-anchor--menu-open" : undefined].filter(Boolean).join(" ");
  const actionToolbar = (
    <div aria-label={transcriptMessageActionsLabel(entry)} className="sand-message-hover-actions" role="toolbar">
      {reactionActions}
      {isThreadActionVisible ? <button aria-label={transcriptReplyActionLabel(entry)} className="sand-message-hover-actions__button" onClick={() => context.onReply(entry.id)} type="button"><span aria-hidden="true" data-icon-name={messageRole(entry) === "user" ? "arrow-u-up-right" : "arrow-u-up-left"} /></button> : null}
      {context == null ? null : <button aria-expanded={menuOpen} aria-haspopup="menu" aria-label="More message actions" className="sand-message-hover-actions__button" onClick={() => { rememberFocus(document.activeElement); setReactionMenuOpen(false); setMenuOpen((open) => !open); }} type="button">
        <span aria-hidden="true" data-icon-name="dots-3-horizontal" />
      </button>}
      {menuOpen && context != null ? <div aria-label="More message actions" role="menu">
        {isThreadActionVisible ? <button className="sand-message-hover-actions__button" onClick={() => { context.onThread(entry.id); setMenuOpen(false); }} role="menuitem" type="button"><span aria-hidden="true" data-icon-name="chat-bubbles" />Start a thread</button> : null}
        {effectiveOnCopy == null ? null : <button className="sand-message-hover-actions__button" onClick={copy} role="menuitem" type="button"><span aria-hidden="true" data-icon-name="copy" />Copy</button>}
      </div> : null}
    </div>
  );
  const threadSummary = context != null && context.threadRootId == null && !effectiveReadOnly
    ? context.getThreadSummary(entry.id)
    : null;
  const threadAffordance = threadSummary == null || context == null
    ? null
    : <ThreadAffordance onOpen={context.openThread} role={messageRole(entry)} summary={threadSummary} />;
  const childElement = cloneElement(childWithProps, {
    className: actionClassName,
    onContextMenu: (event) => {
      childProps.onContextMenu?.(event);
      if (isMessageContextTargetExcluded(event.target)) return;
      event.preventDefault();
      rememberFocus(event.target);
      setReactionMenuOpen(false);
      setMenuOpen(true);
    },
    onFocusCapture: (event) => {
      childProps.onFocusCapture?.(event);
      if (!menuOpen) rememberFocus(event.target);
    },
    onPointerEnter: (event) => {
      childProps.onPointerEnter?.(event);
      setMenuOpen((open) => open);
    },
    ref: setAnchor,
  }, childProps.children, threadAffordance, actionToolbar);

  return childElement;
}
