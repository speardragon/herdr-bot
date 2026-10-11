import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMessagePayload, isDocEmpty } from "../src/features/composer/rich-text.ts";
import type { DocNode, InlineNode, MentionNameResolver } from "../src/features/composer/rich-text.ts";

const noResolve: MentionNameResolver = () => null;

function paragraph(content: readonly InlineNode[]): DocNode {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

test("plain text with no mention has no richText at all", () => {
  const doc = paragraph([{ type: "text", text: "hello world" }]);
  const payload = buildMessagePayload(doc, noResolve);
  assert.equal(payload.text, "hello world");
  assert.equal(payload.richText, undefined);
});

test("a hardBreak becomes a literal newline in plain text", () => {
  const doc = paragraph([{ type: "text", text: "line one" }, { type: "hardBreak" }, { type: "text", text: "line two" }]);
  const payload = buildMessagePayload(doc, noResolve);
  assert.equal(payload.text, "line one\nline two");
});

test("a bot mention emits the host's required literal @handle token (squashed, no space)", () => {
  const doc = paragraph([
    { type: "text", text: "hey " },
    { type: "mention", attrs: { id: "bot-forge", label: "Forge", everyone: false } },
    { type: "text", text: " can you look" },
  ]);
  const payload = buildMessagePayload(doc, noResolve);
  assert.equal(payload.text, "hey @Forge can you look");
});

test("a multi-word bot name is squashed to one word so the host's word-boundary scan still matches", () => {
  const doc = paragraph([{ type: "mention", attrs: { id: "bot-cr", label: "Code Reviewer", everyone: false } }]);
  const payload = buildMessagePayload(doc, noResolve);
  assert.equal(payload.text, "@CodeReviewer");
});

test("the everyone pseudo-mention always emits the literal token '@everyone'", () => {
  const doc = paragraph([{ type: "mention", attrs: { id: "everyone", label: "Everyone", everyone: true } }]);
  const payload = buildMessagePayload(doc, noResolve);
  assert.equal(payload.text, "@everyone");
});

test("a mention resolves the bot's CURRENT name at send time, not the stale label stored on insert", () => {
  const doc = paragraph([{ type: "mention", attrs: { id: "bot-forge", label: "OldName", everyone: false } }]);
  const resolve: MentionNameResolver = (id) => (id === "bot-forge" ? "NewName" : null);
  const payload = buildMessagePayload(doc, resolve);
  assert.equal(payload.text, "@NewName");
});

test("a mention whose bot can no longer be resolved (deleted) falls back to the stored label", () => {
  const doc = paragraph([{ type: "mention", attrs: { id: "bot-gone", label: "Ghost", everyone: false } }]);
  const payload = buildMessagePayload(doc, noResolve);
  assert.equal(payload.text, "@Ghost");
});

test("richText is present and carries the resolved-current mention label when a mention exists", () => {
  const doc = paragraph([{ type: "mention", attrs: { id: "bot-forge", label: "OldName", everyone: false } }]);
  const resolve: MentionNameResolver = () => "NewName";
  const payload = buildMessagePayload(doc, resolve);
  assert.ok(payload.richText != null);
  const parsed = JSON.parse(payload.richText!);
  assert.deepEqual(parsed, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "bot-forge", label: "NewName", everyone: false } }] }],
  });
});

test("isDocEmpty is true for whitespace-only text and no mention", () => {
  assert.equal(isDocEmpty(paragraph([{ type: "text", text: "   " }])), true);
});

test("isDocEmpty is false when a mention is present even with no other text", () => {
  assert.equal(isDocEmpty(paragraph([{ type: "mention", attrs: { id: "everyone", label: "Everyone", everyone: true } }])), false);
});

test("isDocEmpty is true for a doc with no blocks at all", () => {
  assert.equal(isDocEmpty({ type: "doc", content: [] }), true);
});
