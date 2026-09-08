import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FindInChatController, FindInChatMatch, FindInChatTranscriptHandle } from "./find-in-chat-controller";
import { SandIcon, SandIconButton } from "../../../ui/sand-kit-primitives";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5276787
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5279500
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5282052

const FIND_MATCH_HIGHLIGHT = "sand-find-match";
const FIND_CURRENT_HIGHLIGHT = "sand-find-current";
const FIND_EXCLUDED_SELECTOR = 'input, textarea, [contenteditable]:not([contenteditable="false"]), .sand-row-timestamp, .sand-reply-quote, .sand-activity-slot';

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5283344 (find bar/search icon)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5284483 (previous/next controls)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5284820 (close control)
const FIND_GLYPHS = { "chevron-up": 0xeab7, "chevron-down": 0xeab4 } as const;

function FindGlyph({ name }: { readonly name: keyof typeof FIND_GLYPHS }) {
  return <span aria-hidden="true" data-icon-name={name} style={{ fontFamily: "cursor-icons", lineHeight: 1 }}>{String.fromCodePoint(FIND_GLYPHS[name])}</span>;
}

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

interface HighlightGlobals {
  CSS?: { highlights?: HighlightRegistry };
  Highlight?: new (...ranges: Range[]) => unknown;
}

function clearFindHighlights(): void {
  const globals = globalThis as unknown as HighlightGlobals;
  globals.CSS?.highlights?.delete(FIND_MATCH_HIGHLIGHT);
  globals.CSS?.highlights?.delete(FIND_CURRENT_HIGHLIGHT);
}

function textNodes(container: HTMLElement): { nodes: Text[]; starts: number[]; text: string } {
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(FIND_EXCLUDED_SELECTOR) == null
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
    const textNode = node as Text;
    nodes.push(textNode);
    starts.push(text.length);
    text += textNode.data.toLowerCase();
  }
  return { nodes, starts, text };
}

function nodeAt(source: { nodes: Text[]; starts: number[] }, offset: number): { node: Text; offset: number } | null {
  let low = 0;
  let high = source.starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((source.starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  const node = source.nodes[low];
  const start = source.starts[low];
  return node == null || start == null ? null : { node, offset: offset - start };
}

function rangeFor(source: { nodes: Text[]; starts: number[] }, start: number, end: number): Range | null {
  const from = nodeAt(source, start);
  const to = nodeAt(source, end - 1);
  if (from == null || to == null) return null;
  const range = from.node.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset + 1);
  return range;
}

export function applyFindHighlights(container: HTMLElement | null, query: string, current: FindInChatMatch | null): void {
  clearFindHighlights();
  if (container == null || query.trim().length === 0) return;
  const globals = globalThis as unknown as HighlightGlobals;
  const highlights = globals.CSS?.highlights;
  const Highlight = globals.Highlight;
  if (highlights == null || Highlight == null) return;
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  let currentRange: Range | null = null;
  // The recovered transcript uses data-entry-id; the immutable virtualized
  // transcript uses data-row-key. Accept both without changing either owner.
  for (const row of container.querySelectorAll<HTMLElement>("[data-entry-id], [data-row-key]")) {
    const entryId = row.getAttribute("data-entry-id") ?? row.getAttribute("data-row-key");
    const source = textNodes(row);
    let occurrence = 0;
    let at = source.text.indexOf(needle);
    while (at >= 0) {
      const range = rangeFor(source, at, at + needle.length);
      if (range != null) {
        ranges.push(range);
        if (current?.entryId === entryId && current.occurrence === occurrence) currentRange = range;
      }
      occurrence += 1;
      at = source.text.indexOf(needle, at + needle.length);
    }
  }
  if (ranges.length === 0) return;
  highlights.set(FIND_MATCH_HIGHLIGHT, new Highlight(...ranges));
  if (currentRange != null) highlights.set(FIND_CURRENT_HIGHLIGHT, new Highlight(currentRange));
}

export function FindInChatBar({ controller, focusNonce = 0, transcriptContainer, transcriptHandle, transcriptHandleRef, onClose }: {
  controller: FindInChatController;
  focusNonce?: number;
  transcriptContainer?: HTMLElement | null;
  transcriptHandle?: FindInChatTranscriptHandle | null;
  /** Immutable root passes the live transcript handle through a ref. */
  transcriptHandleRef?: { current: FindInChatTranscriptHandle | null };
  onClose?(): void;
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [inputQuery, setInputQuery] = useState(snapshot.query);
  const deferredQuery = useDeferredValue(inputQuery);
  const submittedQueryRef = useRef(snapshot.query);
  useEffect(() => {
    if (snapshot.query !== submittedQueryRef.current) {
      submittedQueryRef.current = snapshot.query;
      setInputQuery(snapshot.query);
      return;
    }
    if (deferredQuery !== submittedQueryRef.current) {
      submittedQueryRef.current = deferredQuery;
      controller.setQuery(deferredQuery);
    }
  }, [controller, deferredQuery, snapshot.query]);
  const query = inputQuery;
  const currentIndex = snapshot.current == null ? -1 : snapshot.matches.findIndex((match) => match.entryId === snapshot.current?.entryId && match.occurrence === snapshot.current?.occurrence);
  const close = () => { controller.close(); onClose?.(); };
  const step = (delta: 1 | -1) => {
    controller.step(delta);
    const refresh = () => {
      const nextSnapshot = controller.getSnapshot();
      applyFindHighlights(transcriptContainer ?? null, nextSnapshot.query, nextSnapshot.current);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(refresh);
    else refresh();
  };
  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusNonce]);
  useEffect(() => {
    applyFindHighlights(transcriptContainer ?? null, snapshot.query, snapshot.current);
    return () => clearFindHighlights();
  }, [snapshot.query, snapshot.current, transcriptContainer]);
  useEffect(() => {
    const liveTranscriptHandle = transcriptHandleRef?.current ?? transcriptHandle ?? null;
    if (liveTranscriptHandle == null) return undefined;
    const unsubscribe = liveTranscriptHandle.subscribeViewCommits(() => {
      applyFindHighlights(transcriptContainer ?? null, snapshot.query, snapshot.current);
    });
    return () => {
      unsubscribe();
      clearFindHighlights();
    };
  }, [snapshot.current, snapshot.query, transcriptContainer, transcriptHandle, transcriptHandleRef]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      step(event.shiftKey ? -1 : 1);
    }
  };
  const hasMatches = snapshot.matches.length > 0;
  const ordinal = currentIndex < 0 ? 0 : currentIndex + 1;
  return (
    <div className="sand-chat-find">
      <div className="sand-chat-find-bar">
        <span aria-hidden="true" className="sand-78zum5 sand-6s0dn4 sand-6wrskw sand-169k319"><SandIcon name="search" size="sm" /></span>
        <input aria-label="Find in chat" autoFocus onChange={(event) => setInputQuery(event.currentTarget.value)} onKeyDown={handleKeyDown} placeholder="Find in chat" ref={inputRef} spellCheck={false} type="text" value={query} />
        {query.trim().length > 0 ? <span role="status">{ordinal}/{snapshot.matches.length}</span> : null}
        <span aria-hidden="true" />
        <button aria-label="Previous match" disabled={!hasMatches} onClick={() => step(-1)} type="button"><FindGlyph name="chevron-up" /></button>
        <button aria-label="Next match" disabled={!hasMatches} onClick={() => step(1)} type="button"><FindGlyph name="chevron-down" /></button>
        <SandIconButton aria-label="Close find" icon="close" onClick={close} size="sm" type="button" variant="ghost" />
      </div>
    </div>
  );
}
