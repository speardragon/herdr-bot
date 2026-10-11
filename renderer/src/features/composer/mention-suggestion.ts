/**
 * Wires `@tiptap/suggestion`'s imperative render lifecycle (onStart/onUpdate/onKeyDown/onExit -- not
 * hook-shaped, see `@tiptap/suggestion`'s own types) to a `MentionList` mounted via Tiptap's
 * `ReactRenderer`. `ReactRenderer` renders through the editor's own React tree (`editor.contentComponent`'s
 * portal set, the same mechanism node views use -- see `mention-extension.tsx`'s comment), so this still
 * gets real app context if `MentionList` ever needs it; only the *positioning* (where its plain DOM
 * element gets appended/placed) is manual, because the popover has no owning React component of its own
 * to anchor a `<Popover>` to.
 *
 * Deliberately does NOT provide `command` to `Suggestion` -- the Mention extension's own default command
 * (insert a `{type:"mention", attrs:{...props}}` node + a trailing space) is exactly what's wanted; only
 * `items` (the candidate list) and `render` (this popover) are overridden.
 */
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { placeNear } from "../../primitives/popover-position.ts";
import popoverStyles from "../../primitives/Popover.module.css";
import { buildMentionCandidates, filterMentionCandidates } from "./mention-candidates.ts";
import type { MentionCandidate, MentionMember } from "./mention-candidates.ts";
import { MentionList } from "./MentionList.tsx";
import type { MentionInsert, MentionListHandle, MentionListProps } from "./MentionList.tsx";

export interface MentionSuggestionDeps {
  /** Read fresh on every keystroke (not captured once) so a room's membership changing mid-session
   * doesn't require recreating the editor/extension. */
  getMembers: () => readonly MentionMember[];
}

function repositionAbove(element: HTMLElement, clientRect: SuggestionProps<MentionCandidate, MentionInsert>["clientRect"]): void {
  const anchor = clientRect?.();
  if (anchor == null) return;
  const panel = { width: element.offsetWidth, height: element.offsetHeight };
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  // "top-start": the popover opens as a small floating list directly above the composer, anchored at
  // the caret -- the composer sits at the bottom of the window, so below-the-caret would usually run
  // off-screen anyway.
  const { top, left } = placeNear({ top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height }, panel, "top-start", viewport);
  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
}

/**
 * `@tiptap/extension-mention`'s own types fix the suggestion's "selected item" generic at
 * `MentionNodeAttrs` (`{id, label}` -- it doesn't know about this extension's extra `everyone` attr, see
 * `mention-extension.tsx`). The object actually built below carries `everyone` through at runtime (the
 * default Mention command just spreads whatever it's given into the node's attrs); this cast exists only
 * to satisfy that generic mismatch at the type level, not to paper over an actual behavior difference.
 */
export function createMentionSuggestion(deps: MentionSuggestionDeps): Partial<SuggestionOptions<MentionCandidate, MentionNodeAttrs>> {
  const config: Partial<SuggestionOptions<MentionCandidate, MentionInsert>> = {
    // A bot 1:1 DM has no members to mention at all (see mention-candidates.ts's own doc comment) --
    // `allow` returning false means the suggestion plugin never activates there, so `@` just stays a
    // literal character instead of opening an empty/pointless popover.
    allow: () => deps.getMembers().length > 0,
    items: ({ query }) => [...filterMentionCandidates(buildMentionCandidates(deps.getMembers()), query)],
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, MentionListProps> | null = null;

      return {
        onStart: (props) => {
          renderer = new ReactRenderer(MentionList, { editor: props.editor, props: { items: props.items, command: props.command } });
          const el = renderer.element;
          el.classList.add(popoverStyles["hb-popover"]!);
          el.style.position = "fixed";
          el.style.zIndex = "300";
          el.style.visibility = "hidden";
          document.body.appendChild(el);
          requestAnimationFrame(() => {
            repositionAbove(el, props.clientRect);
            el.style.visibility = "visible";
          });
        },
        onUpdate: (props) => {
          if (renderer == null) return;
          renderer.updateProps({ items: props.items, command: props.command });
          repositionAbove(renderer.element, props.clientRect);
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (renderer?.ref == null) return false;
          return renderer.ref.onKeyDown({ event: props.event });
        },
        onExit: () => {
          renderer?.element.remove();
          renderer?.destroy();
          renderer = null;
        },
      };
    },
  };
  return config as Partial<SuggestionOptions<MentionCandidate, MentionNodeAttrs>>;
}
