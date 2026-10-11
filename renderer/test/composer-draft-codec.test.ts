import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_DRAFT, decodeDraft, encodeDraft, isDraftEmpty } from "../src/features/composer/draft-codec.ts";
import type { ComposerDraftState } from "../src/features/composer/draft-codec.ts";

test("an empty draft encodes to the empty string (so DraftStore clears its key)", () => {
  assert.equal(encodeDraft(EMPTY_DRAFT), "");
});

test("decodeDraft('') returns the empty draft", () => {
  assert.deepEqual(decodeDraft(""), EMPTY_DRAFT);
});

test("a draft with text round-trips through encode/decode", () => {
  const state: ComposerDraftState = {
    doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] },
    attachments: [],
  };
  const decoded = decodeDraft(encodeDraft(state));
  assert.deepEqual(decoded, state);
});

test("a draft with a mention and a staged attachment round-trips", () => {
  const state: ComposerDraftState = {
    doc: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "bot-forge", label: "Forge", everyone: false } }] }],
    },
    attachments: [{ path: "staged/abc.png", filename: "abc.png", size: 1234 }],
  };
  const decoded = decodeDraft(encodeDraft(state));
  assert.deepEqual(decoded, state);
});

test("a pre-existing plain-text draft (foundation's old string format) is not discarded", () => {
  const decoded = decodeDraft("an unsent draft from before this slice shipped");
  assert.equal(isDraftEmpty(decoded), false);
  assert.deepEqual(decoded.attachments, []);
  const textNode = decoded.doc.content?.[0]?.content?.[0];
  assert.equal(textNode?.type, "text");
  assert.equal(textNode?.text, "an unsent draft from before this slice shipped");
});

test("corrupted/garbage JSON degrades to treating the raw string as plain text, not throwing", () => {
  assert.doesNotThrow(() => decodeDraft('{"doc": not valid json'));
  const decoded = decodeDraft('{"doc": not valid json');
  assert.equal(decoded.doc.content?.[0]?.content?.[0]?.text, '{"doc": not valid json');
});

test("isDraftEmpty is true only with no text, no mention, and no attachments", () => {
  assert.equal(isDraftEmpty(EMPTY_DRAFT), true);
  assert.equal(
    isDraftEmpty({ doc: EMPTY_DRAFT.doc, attachments: [{ path: "p", filename: "f", size: 1 }] }),
    false,
  );
});
