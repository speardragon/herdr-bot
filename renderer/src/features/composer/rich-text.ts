/**
 * Serializes the composer's Tiptap document into what `message.send` actually needs: a plain-text
 * `text` (what every other part of the app -- notifications, search snippets, the host's own bot
 * routing -- reads) and an optional `richText` (a stable, Tiptap/ProseMirror-shaped JSON string the
 * conversation feature can parse back into mention chips when rendering a *sent* message -- see this
 * folder's README for the exact contract).
 *
 * This is a pure, DOM/editor-free module: it walks a plain JSON tree shaped like Tiptap's `JSONContent`
 * (duck-typed here as `DocNode`/`InlineNode` rather than importing `@tiptap/core`, so it stays trivially
 * unit-testable with plain object literals -- see `renderer/test/composer-rich-text.test.ts`) and never
 * touches a live `Editor` instance.
 *
 * CRITICAL correctness note (confirmed by reading `core/src/group/group-chat.ts` directly): the host
 * does not parse `richText` for bot routing in a room at all -- it
 * scans the plain `content`/`text` string for a literal `@handle` word (see `parseGroupMentions`,
 * `memberMentionHandles`). A handle is the member's lowercased full name, its *whitespace-squashed*
 * name, its first word, or its id; "@everyone"/"@all" addresses the whole room. So the plain-text runner
 * below MUST emit one of those exact literal tokens for every mention run, or an @-mention silently
 * fails to route to the intended bot. Squashing (`squashHandle`) is the only form of every bot's name
 * that is *always* a valid handle regardless of whether the name itself contains a space, so that's
 * what's emitted for a real (non-"everyone") mention.
 */

export interface InlineNode {
  readonly type: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
}

export interface DocNode {
  readonly type?: string;
  readonly content?: readonly BlockLike[];
}

/** A block-level node (typically `"paragraph"`) holding inline children. Loosely typed on purpose --
 * only `content` is read. */
export interface BlockLike {
  readonly type?: string;
  readonly content?: readonly InlineNode[];
}

export interface MentionAttrs {
  readonly id: string;
  readonly label: string;
  readonly everyone: boolean;
}

/** Looks up a mention's CURRENT display name by id: chips -- and by extension the routing text -- must
 * reflect the bot's current name/avatar, not whatever was true when the mention was inserted. Returns
 * `null` when the id no longer resolves to a known chat (e.g. the bot was deleted
 * after the mention was typed); callers fall back to the mention's stored `label` in that case. */
export type MentionNameResolver = (id: string) => string | null;

export interface ComposerMessagePayload {
  readonly text: string;
  /** Omitted (not merely empty) when the message has no mention at all -- see docs/app-api.md: a plain
   * message should stay lean rather than carry a richText blob with nothing a renderer needs. */
  readonly richText?: string;
}

/** The literal plain-text token the host's mention scanner needs for "everyone" (`parseGroupMentions`'s
 * `/@(everyone|all)\b/` -- case-insensitive, so "everyone" lowercase is fine either way). */
const EVERYONE_TOKEN = "everyone";

function squashHandle(name: string): string {
  return name.trim().replace(/\s+/g, "");
}

function resolveMentionDisplayName(attrs: MentionAttrs, resolve: MentionNameResolver): string {
  if (attrs.everyone) return EVERYONE_TOKEN;
  return resolve(attrs.id) ?? attrs.label;
}

function hasMentionIdentity(attrs: Readonly<Record<string, unknown>> | undefined): attrs is Readonly<Record<string, unknown>> & { readonly id: string; readonly label: string } {
  return attrs != null && typeof attrs["id"] === "string" && typeof attrs["label"] === "string";
}

/** Plain-text + cleaned-JSON runs for one inline node: `[plainText, richTextNode-or-null]`. A node this
 * module doesn't recognize (a future inline type) is dropped from both -- better to lose an unsupported
 * run than to crash the composer or mis-route a message. */
function renderInline(node: InlineNode, resolve: MentionNameResolver): { readonly plain: string; readonly rich: InlineNode | null } {
  if (node.type === "text") {
    const text = node.text ?? "";
    return { plain: text, rich: { type: "text", text } };
  }
  if (node.type === "hardBreak") {
    return { plain: "\n", rich: { type: "hardBreak" } };
  }
  if (node.type === "mention" && hasMentionIdentity(node.attrs)) {
    const attrs: MentionAttrs = { id: node.attrs.id, label: node.attrs.label, everyone: node.attrs["everyone"] === true };
    const currentName = resolveMentionDisplayName(attrs, resolve);
    const plain = `@${attrs.everyone ? EVERYONE_TOKEN : squashHandle(currentName)}`;
    return { plain, rich: { type: "mention", attrs: { id: attrs.id, label: currentName, everyone: attrs.everyone } } };
  }
  return { plain: "", rich: null };
}

/** Builds the `{ text, richText? }` pair `message.send` wants from the composer's current Tiptap
 * document. `resolve` is called once per mention run to substitute the mentioned bot's CURRENT name
 * (both so a late rename doesn't silently break routing, and so the richText chip the conversation
 * slice renders matches what actually routed the message). */
export function buildMessagePayload(doc: DocNode, resolve: MentionNameResolver): ComposerMessagePayload {
  const richBlocks: BlockLike[] = [];
  let plain = "";
  let sawMention = false;
  const blocks = doc.content ?? [];

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) plain += "\n\n";
    const richInline: InlineNode[] = [];
    for (const inline of block.content ?? []) {
      const { plain: plainRun, rich } = renderInline(inline, resolve);
      plain += plainRun;
      if (rich != null) richInline.push(rich);
      if (inline.type === "mention") sawMention = true;
    }
    richBlocks.push({ type: block.type ?? "paragraph", content: richInline });
  });

  if (!sawMention) return { text: plain };
  return { text: plain, richText: JSON.stringify({ type: "doc", content: richBlocks }) };
}

/** Whether the document has nothing worth sending: no non-whitespace text and no mention (an "@everyone"
 * with no other words is still real content). Used for both the send button's disabled state and to
 * decide whether a draft is empty enough to clear from storage rather than persist. */
export function isDocEmpty(doc: DocNode): boolean {
  for (const block of doc.content ?? []) {
    for (const inline of block.content ?? []) {
      if (inline.type === "mention") return false;
      if (inline.type === "text" && (inline.text ?? "").trim().length > 0) return false;
    }
  }
  return true;
}
