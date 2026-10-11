/**
 * Parses the composer's Tiptap `richText` JSON (`message.send`'s optional `richText` param, and the
 * `message` entry's own `richText` field) into this module's plain
 * `BlockNode[]` shape, so `MarkdownView` renders a rich-text user message through the exact same
 * pipeline as a bot's markdown reply. The composer produces a `{type:"doc",content:
 * [paragraph,...]}` document whose paragraphs contain `text` (optionally marked bold/italic/code),
 * `mention` (`attrs:{id,label,everyone}}`; `everyone:true` -> the synthesized "@everyone" mention, `id`
 * elsewhere resolves to the mentioned bot's *current* name/avatar at render time, same as a plain-text
 * `@Name` mention), and `hardBreak` nodes. `richText` is omitted whenever a message has no mentions (the
 * plain `text`/`content` field always has the literal `@Handle` either way) -- callers should only use
 * this when present and fall back to `parseMarkdown(content)` otherwise (see MarkdownView.tsx).
 *
 * Pure, DOM-free -- unit tested directly with `node --test`.
 */
import type { BlockNode, InlineNode } from "./markdown.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyMark(leaf: InlineNode, markType: string): InlineNode {
  if (markType === "bold") return { type: "bold", children: [leaf] };
  if (markType === "italic") return { type: "italic", children: [leaf] };
  return leaf;
}

function textNodeToInline(node: Record<string, unknown>): InlineNode {
  const value = typeof node.text === "string" ? node.text : "";
  const marks = Array.isArray(node.marks) ? node.marks : [];
  const isCode = marks.some((mark) => isRecord(mark) && mark.type === "code");
  if (isCode) return { type: "code", value };
  let result: InlineNode = { type: "text", value };
  for (const mark of marks) {
    if (isRecord(mark) && typeof mark.type === "string") result = applyMark(result, mark.type);
  }
  return result;
}

function mentionNodeToInline(node: Record<string, unknown>): InlineNode | null {
  const attrs = node.attrs;
  if (!isRecord(attrs)) return null;
  const everyone = attrs.everyone === true;
  const id = typeof attrs.id === "string" ? attrs.id : null;
  const label = typeof attrs.label === "string" ? attrs.label : (id ?? "");
  return { type: "mention", id: everyone ? null : id, name: label };
}

function inlineChildToInline(node: unknown): InlineNode[] {
  if (!isRecord(node) || typeof node.type !== "string") return [];
  if (node.type === "text") return [textNodeToInline(node)];
  if (node.type === "mention") {
    const mention = mentionNodeToInline(node);
    return mention != null ? [mention] : [];
  }
  if (node.type === "hardBreak") return [{ type: "break" }];
  return [];
}

function paragraphToInline(node: unknown): InlineNode[] {
  if (!isRecord(node) || !Array.isArray(node.content)) return [];
  return node.content.flatMap(inlineChildToInline);
}

/** `null` on anything that doesn't look like a Tiptap doc (invalid JSON, wrong root shape) -- the caller
 * falls back to markdown-parsing the plain text field instead. */
export function parseRichTextBlocks(json: string): BlockNode[] | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(doc) || doc.type !== "doc" || !Array.isArray(doc.content)) return null;

  const children: InlineNode[] = [];
  doc.content.forEach((paragraph, index) => {
    if (index > 0) children.push({ type: "break" });
    children.push(...paragraphToInline(paragraph));
  });
  return [{ type: "paragraph", children }];
}
