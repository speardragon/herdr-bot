import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createAttachmentService, isPathWithinDir, looksBinary, mediaKindFor, readAvatarDataUrl, safeFilename } from "../src/attachments.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("pure helpers", () => {
  assert.equal(safeFilename("../evil name?.png"), "evil-name-.png");
  assert.equal(mediaKindFor("/x/a.PNG"), "image");
  assert.equal(mediaKindFor("/x/a.mov"), "video");
  assert.equal(mediaKindFor("/x/a.mp3"), "audio");
  assert.equal(mediaKindFor("/x/a.pdf"), null);
  assert.equal(looksBinary(Buffer.from("hello\nworld")), false);
  assert.equal(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), true);
  assert.equal(isPathWithinDir("/a/b/staged/c.png", "/a/b/staged"), true);
  assert.equal(isPathWithinDir("/a/b/other/c.png", "/a/b/staged"), false);
  assert.equal(isPathWithinDir("/a/b/staged-evil/c.png", "/a/b/staged"), false);
});

test("stage → read → discard round-trip without Electron", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home });
    const staged = (await service.handlers.stageAttachmentBytes!({ filename: "notes.txt", bytes: new Uint8Array(Buffer.from("hi there")) })) as { ok: boolean; path: string };
    assert.equal(staged.ok, true);
    assert.ok(staged.path.startsWith(join(temp.home, "staged")));
    assert.deepEqual(await service.handlers.readAttachmentText!({ path: staged.path }), { kind: "text", text: "hi there", truncated: false, bytes: 8 });
    const bytes = (await service.handlers.readAttachmentBytes!({ path: staged.path, maxBytes: 4 })) as { kind: string; size?: number };
    assert.deepEqual(bytes, { kind: "too-large", size: 8 });
    assert.deepEqual(await service.handlers.commitStagedAttachments!({ paths: [staged.path], filenames: ["notes.txt"] }), [staged.path]);
    await service.handlers.discardStagedAttachment!({ path: staged.path });
    assert.equal(await service.handlers.readAttachmentText!({ path: staged.path }), null);
    const empty = await service.handlers.stageAttachmentBytes!({ filename: "e", bytes: new Uint8Array() });
    assert.deepEqual(empty, { ok: false, reason: "empty" });
    const png = join(temp.home, "p.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const media = (await service.handlers.resolveAttachmentMedia!({ source: png })) as { kind: string; dataUrl: string };
    assert.equal(media.kind, "image");
    assert.ok(media.dataUrl.startsWith("data:image/png;base64,"));
  } finally {
    temp.cleanup();
  }
});

test("resolveAttachmentMedia: an image over the preview cap degrades to null instead of reading the whole file", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home, maxImagePreviewBytes: 4 });
    const png = join(temp.home, "big.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
    assert.equal(await service.handlers.resolveAttachmentMedia!({ source: png }), null);
  } finally {
    temp.cleanup();
  }
});

test("readAttachmentText: only the capped prefix is read into memory, but the real size and truncated flag are reported", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home, maxTextBytes: 4 });
    const file = join(temp.home, "notes.txt");
    writeFileSync(file, "hello world");
    assert.deepEqual(await service.handlers.readAttachmentText!({ path: file }), { kind: "text", text: "hell", truncated: true, bytes: 11 });
  } finally {
    temp.cleanup();
  }
});

test("readAttachmentText: a binary sample within the capped prefix is still classified binary", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home, maxTextBytes: 4 });
    const file = join(temp.home, "image.bin");
    writeFileSync(file, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    assert.deepEqual(await service.handlers.readAttachmentText!({ path: file }), { kind: "binary", bytes: 6 });
  } finally {
    temp.cleanup();
  }
});

test("readAttachmentText: a missing path or directory resolves to null instead of throwing", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home });
    assert.equal(await service.handlers.readAttachmentText!({ path: join(temp.home, "missing.txt") }), null);
    assert.equal(await service.handlers.readAttachmentText!({ path: temp.home }), null);
  } finally {
    temp.cleanup();
  }
});

test("stageAttachmentBytes: bytes over MAX_STAGED_BYTES are rejected before any write", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home });
    const oversized = new Uint8Array(25 * 1024 * 1024 + 1);
    const result = await service.handlers.stageAttachmentBytes!({ filename: "huge.bin", bytes: oversized });
    assert.deepEqual(result, { ok: false, reason: "too-large" });
  } finally {
    temp.cleanup();
  }
});

test("readAvatarDataUrl: rejects a file over the cap cleanly, same as a cancelled pick", async () => {
  const temp = makeTempHome();
  try {
    const png = join(temp.home, "avatar.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
    const accepted = await readAvatarDataUrl(png, 10);
    assert.equal(accepted?.fileName, "avatar.png");
    assert.equal(await readAvatarDataUrl(png, 2), null);
    assert.equal(await readAvatarDataUrl(join(temp.home, "missing.png"), 10), null);
  } finally {
    temp.cleanup();
  }
});
