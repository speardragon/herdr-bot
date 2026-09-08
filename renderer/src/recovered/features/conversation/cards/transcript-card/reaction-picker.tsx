import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  QUICK_REACTION_EMOJIS,
  SAND_REACTION_SELF,
  type TranscriptReaction,
  type ReactToMessageTransport,
  type ReactionActionController,
} from "./reaction-actions";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5083971 (reaction set projection)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5084026 (reaction transport callback)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5084671 (reaction picker selectors/copy)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5076856 (message reaction optimistic action)

export interface ReactionCountProjection {
  readonly emoji: string;
  readonly count: number;
  readonly isMine: boolean;
  readonly reactors: readonly string[];
}

/** Mirrors the immutable DTe first-seen emoji grouping and reactor dedupe. */
export function projectReactionCounts(reactions: readonly TranscriptReaction[] = []): ReactionCountProjection[] {
  const order: string[] = [];
  const grouped = new Map<string, { count: number; isMine: boolean; reactors: string[] }>();
  for (const reaction of reactions) {
    if (typeof reaction.emoji !== "string" || reaction.emoji.length === 0 || typeof reaction.by !== "string" || reaction.by.length === 0) continue;
    const current = grouped.get(reaction.emoji);
    if (current == null) {
      order.push(reaction.emoji);
      grouped.set(reaction.emoji, { count: 1, isMine: reaction.by === SAND_REACTION_SELF, reactors: [reaction.by] });
      continue;
    }
    current.count += 1;
    current.isMine = current.isMine || reaction.by === SAND_REACTION_SELF;
    if (!current.reactors.includes(reaction.by)) current.reactors.push(reaction.by);
  }
  return order.map((emoji) => {
    const value = grouped.get(emoji);
    return { emoji, count: value?.count ?? 0, isMine: value?.isMine ?? false, reactors: value?.reactors ?? [] };
  });
}

export function reactionTooltip(reaction: ReactionCountProjection, resolveReactorName?: (reactor: string) => string): string {
  const names = reaction.reactors.map((reactor) => reactor === SAND_REACTION_SELF ? "You" : resolveReactorName?.(reactor) ?? reactor);
  const subject = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${subject} reacted with ${reaction.emoji}`;
}

export interface ReactionPickerProps {
  readonly entryId: string;
  readonly agentId: string | null;
  readonly myReactions: ReadonlySet<string>;
  readonly transport?: ReactToMessageTransport;
  readonly controller?: ReactionActionController;
  readonly onReacted?: () => void;
  readonly onExpandPicker: () => void;
  readonly children?: ReactNode;
}

export function ReactionCell({ emoji, isReacted, onReact }: { readonly emoji: string; readonly isReacted: boolean; readonly onReact: () => void }) {
  return (
    <button
      aria-label={isReacted ? `Remove ${emoji} reaction` : `React with ${emoji}`}
      aria-pressed={isReacted}
      className="sand-emoji-cell"
      onClick={onReact}
      title={emoji}
      type="button"
    >
      {emoji}
    </button>
  );
}

export function ReactionPicker({ entryId, agentId, myReactions, transport, controller, onReacted, onExpandPicker, children }: ReactionPickerProps) {
  if (controller == null && (agentId == null || transport == null)) return null;
  const react = (emoji: string) => {
    if (controller != null) {
      controller.react(entryId, emoji);
      return;
    }
    if (agentId == null || transport == null) return;
    onReacted?.();
    void transport.reactToMessage({ entryId, emoji, agentId }).catch(() => undefined);
  };
  return (
    <div aria-label="Add reaction" className="sand-reaction-picker" role="group">
      {QUICK_REACTION_EMOJIS.map((emoji) => (
        <ReactionCell emoji={emoji} isReacted={myReactions.has(emoji)} key={emoji} onReact={() => react(emoji)} />
      ))}
      <button aria-label="More emoji" className="sand-reaction-picker__more" onClick={onExpandPicker} type="button">{children ?? "More emoji"}</button>
    </div>
  );
}

export interface ReactionPillsProps {
  readonly entryId: string;
  readonly agentId: string | null;
  readonly reactions: readonly TranscriptReaction[];
  readonly transport?: ReactToMessageTransport;
  readonly controller?: ReactionActionController;
  readonly onReacted?: () => void;
  readonly resolveReactorName?: (reactor: string) => string;
}

/** The immutable count/tooltip consumer below the message action anchor. */
export function ReactionPills({ entryId, agentId, reactions, transport, controller, onReacted, resolveReactorName }: ReactionPillsProps) {
  const grouped = projectReactionCounts(reactions);
  if (grouped.length === 0) return null;
  const react = (emoji: string) => {
    if (controller != null) {
      controller.react(entryId, emoji);
      return;
    }
    if (agentId == null || transport == null) return;
    onReacted?.();
    void transport.reactToMessage({ entryId, emoji, agentId }).catch(() => undefined);
  };
  return (
    <div className="sand-reaction-pills">
      {grouped.map((reaction) => (
        <button
          aria-label={`${reactionTooltip(reaction, resolveReactorName)}. Toggle your ${reaction.emoji} reaction`}
          aria-pressed={reaction.isMine}
          className="sand-reaction-pill"
          key={reaction.emoji}
          onClick={() => react(reaction.emoji)}
          type="button"
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          {reaction.count > 1 ? reaction.count : null}
        </button>
      ))}
    </div>
  );
}

export interface MessageReactionActionProps {
  readonly entryId: string;
  readonly agentId: string | null;
  readonly myReactions: ReadonlySet<string>;
  readonly transport?: ReactToMessageTransport;
  readonly controller?: ReactionActionController;
  readonly onReacted?: () => void;
  readonly onExpandPicker: () => void;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: ReactNode;
}

/** Unmounted message-consumer boundary for the shipped hover/focus picker action. */
export function MessageReactionAction({ entryId, agentId, myReactions, transport, controller, onReacted, onExpandPicker, open: controlledOpen, onOpenChange, children }: MessageReactionActionProps) {
  const canReact = controller != null || (agentId != null && transport != null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const setOpen = (next: boolean, restoreFocus = false) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next && restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node) || wrapperRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false, true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!canReact || entryId.length === 0) return null;
  const handleReacted = () => {
    setOpen(false, true);
    onReacted?.();
  };
  return (
    <div ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add reaction"
        className="sand-message-hover-actions__button"
        onClick={() => setOpen(!open)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" data-icon-name="smiley-happy">{children}</span>
      </button>
      {open ? <ReactionPicker
        agentId={agentId}
        controller={controller}
        entryId={entryId}
        myReactions={myReactions}
        onExpandPicker={onExpandPicker}
        onReacted={handleReacted}
        transport={transport}
      /> : null}
    </div>
  );
}

export interface TranscriptMessageReactionConsumerProps extends ReactionPillsProps, Omit<MessageReactionActionProps, "entryId" | "agentId" | "myReactions" | "transport" | "controller" | "onReacted" | "onExpandPicker"> {
  readonly myReactions: ReadonlySet<string>;
  readonly onExpandPicker: () => void;
}

/** Typed, unmounted consumer for one transcript message's pills and picker. */
export function TranscriptMessageReactionConsumer({ entryId, agentId, reactions, myReactions, transport, controller, onReacted, resolveReactorName, onExpandPicker, ...actionProps }: TranscriptMessageReactionConsumerProps) {
  const canReact = controller != null || (agentId != null && transport != null);
  if (!canReact) return null;
  return <>
    <ReactionPills agentId={agentId} controller={controller} entryId={entryId} onReacted={onReacted} reactions={reactions} resolveReactorName={resolveReactorName} transport={transport} />
    <MessageReactionAction {...actionProps} agentId={agentId} controller={controller} entryId={entryId} myReactions={myReactions} onExpandPicker={onExpandPicker} onReacted={onReacted} transport={transport} />
  </>;
}
