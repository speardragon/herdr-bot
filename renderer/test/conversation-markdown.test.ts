import { test } from "node:test";
import assert from "node:assert/strict";
import { expandMentions, expandMentionsInBlocks, isSafeLinkHref, parseInline, parseMarkdown } from "../src/features/conversation/markdown.ts";

test("parseInline: plain text", () => {
  assert.deepEqual(parseInline("hello"), [{ type: "text", value: "hello" }]);
});

test("parseInline: bold with ** and __", () => {
  assert.deepEqual(parseInline("a **bold** b"), [
    { type: "text", value: "a " },
    { type: "bold", children: [{ type: "text", value: "bold" }] },
    { type: "text", value: " b" },
  ]);
  assert.deepEqual(parseInline("__bold__"), [{ type: "bold", children: [{ type: "text", value: "bold" }] }]);
});

test("parseInline: italic with * and _, does not confuse with bold", () => {
  assert.deepEqual(parseInline("*it*"), [{ type: "italic", children: [{ type: "text", value: "it" }] }]);
  assert.deepEqual(parseInline("_it_"), [{ type: "italic", children: [{ type: "text", value: "it" }] }]);
});

test("parseInline: inline code is not parsed further", () => {
  assert.deepEqual(parseInline("run `npm **not bold**`"), [
    { type: "text", value: "run " },
    { type: "code", value: "npm **not bold**" },
  ]);
});

test("parseInline: link", () => {
  assert.deepEqual(parseInline("see [docs](https://example.com/docs)"), [
    { type: "text", value: "see " },
    { type: "link", href: "https://example.com/docs", children: [{ type: "text", value: "docs" }] },
  ]);
});

test("parseInline: unterminated markers fall back to plain text", () => {
  assert.deepEqual(parseInline("a **bold without close"), [{ type: "text", value: "a **bold without close" }]);
});

test("parseMarkdown: paragraph with a soft line break", () => {
  assert.deepEqual(parseMarkdown("line one\nline two"), [
    {
      type: "paragraph",
      children: [{ type: "text", value: "line one" }, { type: "break" }, { type: "text", value: "line two" }],
    },
  ]);
});

test("parseMarkdown: blank line separates paragraphs", () => {
  const blocks = parseMarkdown("first\n\nsecond");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]!.type, "paragraph");
  assert.equal(blocks[1]!.type, "paragraph");
});

test("parseMarkdown: fenced code block with language", () => {
  const blocks = parseMarkdown("before\n```ts\nconst x = 1;\n```\nafter");
  assert.deepEqual(blocks[1], { type: "codeBlock", lang: "ts", code: "const x = 1;" });
});

test("parseMarkdown: fenced code block without a language", () => {
  const blocks = parseMarkdown("```\nplain\n```");
  assert.deepEqual(blocks[0], { type: "codeBlock", lang: null, code: "plain" });
});

test("parseMarkdown: ordered and unordered lists", () => {
  const ordered = parseMarkdown("1. one\n2. two");
  assert.equal(ordered[0]!.type, "list");
  assert.equal((ordered[0] as unknown as { ordered: boolean }).ordered, true);
  assert.equal((ordered[0] as unknown as { items: unknown[] }).items.length, 2);

  const unordered = parseMarkdown("- a\n- b\n- c");
  assert.equal((unordered[0] as unknown as { ordered: boolean }).ordered, false);
  assert.equal((unordered[0] as unknown as { items: unknown[] }).items.length, 3);
});

test("parseMarkdown: blockquote recurses into its own blocks", () => {
  const blocks = parseMarkdown("> quoted *text*");
  assert.equal(blocks[0]!.type, "blockquote");
  const inner = (blocks[0] as unknown as { children: unknown[] }).children;
  assert.equal(inner.length, 1);
});

test("parseMarkdown: heading", () => {
  assert.deepEqual(parseMarkdown("## Section"), [{ type: "heading", level: 2, children: [{ type: "text", value: "Section" }] }]);
});

test("expandMentions splits a text leaf into mention/text tokens", () => {
  const nodes = parseInline("ship it @Forge");
  const expanded = expandMentions(nodes, [{ id: "forge", name: "Forge" }]);
  assert.deepEqual(expanded, [
    { type: "text", value: "ship it " },
    { type: "mention", id: "forge", name: "Forge" },
  ]);
});

test("expandMentions never expands inside inline code", () => {
  const nodes = parseInline("`@Forge is code`");
  const expanded = expandMentions(nodes, [{ id: "forge", name: "Forge" }]);
  assert.deepEqual(expanded, [{ type: "code", value: "@Forge is code" }]);
});

test("expandMentions recurses into bold/italic/link children", () => {
  const nodes = parseInline("**@Forge**");
  const expanded = expandMentions(nodes, [{ id: "forge", name: "Forge" }]);
  assert.deepEqual(expanded, [{ type: "bold", children: [{ type: "mention", id: "forge", name: "Forge" }] }]);
});

test("expandMentionsInBlocks walks paragraphs, lists, and blockquotes", () => {
  const blocks = parseMarkdown("@Atlas: start\n\n- @Forge do it\n\n> @Lens review");
  const members = [
    { id: "atlas", name: "Atlas" },
    { id: "forge", name: "Forge" },
    { id: "lens", name: "Lens" },
  ];
  const expanded = expandMentionsInBlocks(blocks, members);
  const paragraph = expanded[0] as unknown as { children: { type: string }[] };
  assert.equal(paragraph.children[0]!.type, "mention");
  const list = expanded[1] as unknown as { items: { type: string }[][] };
  assert.equal(list.items[0]![0]!.type, "mention");
  const quote = expanded[2] as unknown as { children: { children: { type: string }[] }[] };
  assert.equal((quote.children[0] as unknown as { children: { type: string }[] }).children[0]!.type, "mention");
});

test("isSafeLinkHref allows http(s)/mailto, rejects everything else", () => {
  assert.equal(isSafeLinkHref("https://example.com"), true);
  assert.equal(isSafeLinkHref("http://example.com"), true);
  assert.equal(isSafeLinkHref("mailto:a@b.com"), true);
  assert.equal(isSafeLinkHref("javascript:alert(1)"), false);
  assert.equal(isSafeLinkHref("data:text/html,x"), false);
});
