/**
 * A small, safe markdown subset parser: text in, an AST out -- never an HTML string, so there is nothing
 * for a renderer to `dangerouslySetInnerHTML` and nothing for an agent's message content to inject as
 * markup. Supports this subset: paragraphs, bold/italic, inline code, fenced code blocks,
 * ordered/unordered lists, links, blockquotes. Headings are also recognized (cheap/safe to support and
 * plausible in real agent output).
 *
 * Mentions (`@Name`) are a separate pass (`mentions.ts`) applied to the text leaves of this AST after
 * parsing -- `expandMentions`/`expandMentionsInBlocks` below -- so plain markdown parsing stays agnostic
 * of any particular chat's member list.
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */
import { parseMentions } from "./mentions.ts";
import type { MentionCandidate } from "./mentions.ts";

export type InlineNode =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "break" }
  | { readonly type: "bold"; readonly children: readonly InlineNode[] }
  | { readonly type: "italic"; readonly children: readonly InlineNode[] }
  | { readonly type: "code"; readonly value: string }
  | { readonly type: "link"; readonly href: string; readonly children: readonly InlineNode[] }
  | { readonly type: "mention"; readonly id: string | null; readonly name: string };

export type BlockNode =
  | { readonly type: "paragraph"; readonly children: readonly InlineNode[] }
  | { readonly type: "heading"; readonly level: number; readonly children: readonly InlineNode[] }
  | { readonly type: "codeBlock"; readonly lang: string | null; readonly code: string }
  | { readonly type: "list"; readonly ordered: boolean; readonly items: readonly (readonly InlineNode[])[] }
  | { readonly type: "blockquote"; readonly children: readonly BlockNode[] };

/** Parses one line's worth (or a short run of consecutive non-blank, non-special lines joined by
 * explicit `break`s) of inline markdown. Recursive-descent by hand rather than a regex-token table --
 * the subset is small enough that this stays easy to follow, and every recursive call operates on a
 * strictly shorter substring so it always terminates. */
export function parseInline(src: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buffer = "";
  let i = 0;

  function flush() {
    if (buffer.length > 0) {
      nodes.push({ type: "text", value: buffer });
      buffer = "";
    }
  }

  while (i < src.length) {
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push({ type: "code", value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (src.startsWith("**", i) || src.startsWith("__", i)) {
      const marker = src.slice(i, i + 2);
      const end = src.indexOf(marker, i + 2);
      if (end !== -1 && end > i + 2) {
        flush();
        nodes.push({ type: "bold", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if ((src[i] === "*" || src[i] === "_") && src[i + 1] !== src[i]) {
      const marker = src[i]!;
      const end = src.indexOf(marker, i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        nodes.push({ type: "italic", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (src[i] === "[") {
      const closeBracket = src.indexOf("]", i + 1);
      if (closeBracket !== -1 && src[closeBracket + 1] === "(") {
        const closeParen = src.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          flush();
          const linkText = src.slice(i + 1, closeBracket);
          const href = src.slice(closeBracket + 2, closeParen);
          nodes.push({ type: "link", href, children: parseInline(linkText) });
          i = closeParen + 1;
          continue;
        }
      }
    }

    buffer += src[i];
    i += 1;
  }
  flush();
  return nodes;
}

const FENCE_OPEN_RE = /^```\s*(\S*)\s*$/;
const FENCE_CLOSE_RE = /^```\s*$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;
const ORDERED_ITEM_RE = /^\s*\d+\.\s+(.*)$/;
const UNORDERED_ITEM_RE = /^\s*[-*+]\s+(.*)$/;

/** Parses a full message body into block nodes. Block detection is line-based (not a full CommonMark
 * grammar) -- deliberately: chat messages are short, and this never needed table/
 * nested-list/setext-heading support. */
export function parseMarkdown(src: string): BlockNode[] {
  const lines = src.split("\n");
  const blocks: BlockNode[] = [];
  let paragraphLines: string[] = [];
  let i = 0;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    const children: InlineNode[] = [];
    paragraphLines.forEach((line, index) => {
      if (index > 0) children.push({ type: "break" });
      children.push(...parseInline(line));
    });
    blocks.push({ type: "paragraph", children });
    paragraphLines = [];
  }

  while (i < lines.length) {
    const line = lines[i]!;

    const fenceMatch = FENCE_OPEN_RE.exec(line);
    if (fenceMatch != null) {
      flushParagraph();
      const lang = fenceMatch[1]!.length > 0 ? fenceMatch[1]! : null;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_CLOSE_RE.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      i += 1; // skip the closing fence, or run off the end if the fence was never closed
      blocks.push({ type: "codeBlock", lang, code: codeLines.join("\n") });
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      i += 1;
      continue;
    }

    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch != null) {
      flushParagraph();
      blocks.push({ type: "heading", level: headingMatch[1]!.length, children: parseInline(headingMatch[2]!) });
      i += 1;
      continue;
    }

    const blockquoteMatch = BLOCKQUOTE_RE.exec(line);
    if (blockquoteMatch != null) {
      flushParagraph();
      const quotedLines: string[] = [blockquoteMatch[1]!];
      i += 1;
      while (i < lines.length) {
        const next = BLOCKQUOTE_RE.exec(lines[i]!);
        if (next == null) break;
        quotedLines.push(next[1]!);
        i += 1;
      }
      blocks.push({ type: "blockquote", children: parseMarkdown(quotedLines.join("\n")) });
      continue;
    }

    const orderedMatch = ORDERED_ITEM_RE.exec(line);
    const unorderedMatch = !orderedMatch ? UNORDERED_ITEM_RE.exec(line) : null;
    if (orderedMatch != null || unorderedMatch != null) {
      flushParagraph();
      const ordered = orderedMatch != null;
      const itemRe = ordered ? ORDERED_ITEM_RE : UNORDERED_ITEM_RE;
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const match = itemRe.exec(lines[i]!);
        if (match == null) break;
        items.push(parseInline(match[1]!));
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraphLines.push(line);
    i += 1;
  }
  flushParagraph();
  return blocks;
}

function expandMentionsInInline(node: InlineNode, members: readonly MentionCandidate[]): InlineNode[] {
  if (node.type === "text") {
    return parseMentions(node.value, members).map((token): InlineNode => (token.type === "text" ? { type: "text", value: token.value } : { type: "mention", id: token.id, name: token.name }));
  }
  if (node.type === "code" || node.type === "break" || node.type === "mention") return [node];
  return [{ ...node, children: node.children.flatMap((child) => expandMentionsInInline(child, members)) } as InlineNode];
}

export function expandMentions(nodes: readonly InlineNode[], members: readonly MentionCandidate[]): InlineNode[] {
  return nodes.flatMap((node) => expandMentionsInInline(node, members));
}

/** Walks a full block tree applying `expandMentions` to every inline run (paragraphs, headings, list
 * items, and recursively into blockquotes) -- the one entry point a message renderer should call after
 * `parseMarkdown`. */
export function expandMentionsInBlocks(blocks: readonly BlockNode[], members: readonly MentionCandidate[]): BlockNode[] {
  return blocks.map((block): BlockNode => {
    if (block.type === "paragraph" || block.type === "heading") return { ...block, children: expandMentions(block.children, members) };
    if (block.type === "list") return { ...block, items: block.items.map((item) => expandMentions(item, members)) };
    if (block.type === "blockquote") return { ...block, children: expandMentionsInBlocks(block.children, members) };
    return block;
  });
}

/** Only `http:`/`https:`/`mailto:` links are ever rendered as clickable -- anything else (a bare
 * `javascript:`/`data:` URL an agent's output might contain) renders as plain text instead, since this
 * app has no sandboxing around `openExternal`. */
export function isSafeLinkHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}
