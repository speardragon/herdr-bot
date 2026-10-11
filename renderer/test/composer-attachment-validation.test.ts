import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_ATTACHMENT_BYTES, attachmentErrorMessageKey, validateAttachmentCandidate } from "../src/features/composer/attachment-validation.ts";

test("a zero-byte file is rejected as empty", () => {
  assert.equal(validateAttachmentCandidate({ size: 0 }), "empty");
});

test("a file right at the 25MB cap is accepted", () => {
  assert.equal(validateAttachmentCandidate({ size: MAX_ATTACHMENT_BYTES }), null);
});

test("a file one byte over the 25MB cap is rejected as too-large", () => {
  assert.equal(validateAttachmentCandidate({ size: MAX_ATTACHMENT_BYTES + 1 }), "too-large");
});

test("an ordinary small file passes", () => {
  assert.equal(validateAttachmentCandidate({ size: 1024 }), null);
});

test("every rejection reason maps to a distinct i18n key", () => {
  assert.equal(attachmentErrorMessageKey("empty"), "composer.attachment.error.empty");
  assert.equal(attachmentErrorMessageKey("too-large"), "composer.attachment.error.tooLarge");
  assert.equal(attachmentErrorMessageKey("failed"), "composer.attachment.error.failed");
});
