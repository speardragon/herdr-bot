import type { ElementType, Ref } from "react";
import type { ReactionActionScope } from "./reaction-actions";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5077763 (dGe quick picker and onExpandPicker)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5091796 (mCn expanded Content/contentRef handoff)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=6403026 (Windows mCn expanded handoff)

/** The exact inputs retained by the expanded picker leaf. */
export interface ReactionPickerExpansionInputs {
  readonly entryId: string;
  readonly myReactions: ReadonlySet<string>;
  readonly onReacted: () => void;
}

/** The shell-owned primitives injected into the expanded picker leaf. */
export interface ReactionPickerExpansionContentOwner {
  readonly Content: ElementType;
  readonly contentRef: Ref<HTMLElement>;
}

/**
 * Non-promoting handoff between the mounted reaction action and the unresolved
 * floating shell. The shell owns open/close state and supplies Content and
 * contentRef; this contract owns no portal, catalog store, or transport.
 */
export interface ReactionPickerExpansionHandoff extends ReactionPickerExpansionInputs, ReactionPickerExpansionContentOwner {
  readonly scope: ReactionActionScope;
  readonly onExpandPicker: () => void;
  readonly onOpenChange: (open: boolean) => void;
}

export interface ReactionPickerExpansionHandoffInput extends ReactionPickerExpansionHandoff {}

function isContentOwner(value: ReactionPickerExpansionContentOwner): boolean {
  const contentRef = value.contentRef as unknown;
  return (typeof value.Content === "function" || typeof value.Content === "string")
    && (typeof contentRef === "function" || (typeof contentRef === "object" && contentRef !== null));
}

/**
 * Validates and projects the root inputs without mounting or controlling the
 * ambiguous floating/portal primitive. Missing agent scope or shell inputs
 * deliberately returns null so callers remain fail-closed.
 */
export function projectReactionPickerExpansionHandoff(input: ReactionPickerExpansionHandoffInput): ReactionPickerExpansionHandoff | null {
  if (input.scope.agentId == null || input.entryId.length === 0 || typeof input.onReacted !== "function" || typeof input.onExpandPicker !== "function" || typeof input.onOpenChange !== "function") return null;
  if (typeof input.myReactions?.has !== "function" || !isContentOwner(input)) return null;
  return {
    scope: { accountSlot: input.scope.accountSlot, agentId: input.scope.agentId },
    entryId: input.entryId,
    myReactions: input.myReactions,
    onReacted: input.onReacted,
    Content: input.Content,
    contentRef: input.contentRef,
    onExpandPicker: input.onExpandPicker,
    onOpenChange: input.onOpenChange,
  };
}
