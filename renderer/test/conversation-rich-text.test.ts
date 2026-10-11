import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRichTextBlocks } from "../src/features/conversation/rich-text.ts";

test("parses the composer's documented shape: text, mention, hardBreak", () => {
  const json = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "hey " },
          { type: "mention", attrs: { id: "bot-forge", label: "Forge", everyone: false } },
          { type: "text", text: " check this" },
          { type: "hardBreak" },
          { type: "text", text: "next line" },
        ],
      },
    ],
  });
  assert.deepEqual(parseRichTextBlocks(json), [
    {
      type: "paragraph",
      children: [
        { type: "text", value: "hey " },
        { type: "mention", id: "bot-forge", name: "Forge" },
        { type: "text", value: " check this" },
        { type: "break" },
        { type: "text", value: "next line" },
      ],
    },
  ]);
});

test("everyone:true resolves to id: null", () => {
  const json = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "anything", label: "everyone", everyone: true } }] }],
  });
  const blocks = parseRichTextBlocks(json) as unknown as { children: { type: string; id?: string | null }[] }[];
  assert.deepEqual(blocks[0]!.children[0], { type: "mention", id: null, name: "everyone" });
});

test("bold/italic/code marks on a text node", () => {
  const json = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: "italic", marks: [{ type: "italic" }] },
          { type: "text", text: "code", marks: [{ type: "code" }] },
        ],
      },
    ],
  });
  assert.deepEqual(parseRichTextBlocks(json), [
    {
      type: "paragraph",
      children: [
        { type: "bold", children: [{ type: "text", value: "bold" }] },
        { type: "italic", children: [{ type: "text", value: "italic" }] },
        { type: "code", value: "code" },
      ],
    },
  ]);
});

test("multiple paragraphs join with a break", () => {
  const json = JSON.stringify({
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "first" }] },
      { type: "paragraph", content: [{ type: "text", text: "second" }] },
    ],
  });
  assert.deepEqual(parseRichTextBlocks(json), [
    { type: "paragraph", children: [{ type: "text", value: "first" }, { type: "break" }, { type: "text", value: "second" }] },
  ]);
});

test("returns null for invalid JSON or the wrong root shape", () => {
  assert.equal(parseRichTextBlocks("not json"), null);
  assert.equal(parseRichTextBlocks(JSON.stringify({ type: "not-a-doc" })), null);
  assert.equal(parseRichTextBlocks(JSON.stringify({ type: "doc" })), null);
});

test("a mention with no label falls back to its id", () => {
  const json = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "bot-x" } }] }],
  });
  const blocks = parseRichTextBlocks(json) as unknown as { children: { name: string }[] }[];
  assert.equal(blocks[0]!.children[0]!.name, "bot-x");
});
