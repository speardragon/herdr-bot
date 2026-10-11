import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentFileName, inferAttachmentKind, splitAttachments } from "../src/features/conversation/attachments.ts";

test("splitAttachments strips a single trailing attachment line", () => {
  const result = splitAttachments("Here's the file.\n\n(attached: /staged/demo.txt)");
  assert.equal(result.text, "Here's the file.");
  assert.deepEqual(result.attachmentPaths, ["/staged/demo.txt"]);
});

test("splitAttachments strips multiple trailing attachment lines in order", () => {
  const result = splitAttachments("Two files.\n\n(attached: /a.png)\n(attached: /b.txt)");
  assert.equal(result.text, "Two files.");
  assert.deepEqual(result.attachmentPaths, ["/a.png", "/b.txt"]);
});

test("splitAttachments leaves plain text with no attachment lines alone", () => {
  const result = splitAttachments("No attachments here.");
  assert.equal(result.text, "No attachments here.");
  assert.deepEqual(result.attachmentPaths, []);
});

test("splitAttachments does not false-positive on the literal text mid-message", () => {
  const result = splitAttachments("The docs say (attached: foo) is deprecated syntax.\n\nReal content continues.");
  assert.deepEqual(result.attachmentPaths, []);
  assert.equal(result.text, "The docs say (attached: foo) is deprecated syntax.\n\nReal content continues.");
});

test("inferAttachmentKind maps common extensions", () => {
  assert.equal(inferAttachmentKind("/x/demo.PNG"), "image");
  assert.equal(inferAttachmentKind("/x/clip.mp4"), "video");
  assert.equal(inferAttachmentKind("/x/voice.mp3"), "audio");
  assert.equal(inferAttachmentKind("/x/notes.txt"), "file");
  assert.equal(inferAttachmentKind("/x/no-extension"), "file");
});

test("attachmentFileName takes everything after the last slash", () => {
  assert.equal(attachmentFileName("/staged/demo-attach.txt"), "demo-attach.txt");
  assert.equal(attachmentFileName("bare.txt"), "bare.txt");
});
