import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createAttachmentService, looksBinary, mediaKindFor, safeFilename } from "../src/attachments.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("pure helpers", () => {
  assert.equal(safeFilename("../evil name?.png"), "evil-name-.png");
  assert.equal(mediaKindFor("/x/a.PNG"), "image");
  assert.equal(mediaKindFor("/x/a.mov"), "video");
  assert.equal(mediaKindFor("/x/a.mp3"), "audio");
  assert.equal(mediaKindFor("/x/a.pdf"), null);
  assert.equal(looksBinary(Buffer.from("hello\nworld")), false);
  assert.equal(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), true);
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
