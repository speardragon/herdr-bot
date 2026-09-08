import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { appendFileSync, readFileSync } from "node:fs";
import { TranscriptStore } from "../src/store/transcript-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

function entry(kind: string, extra: Record<string, unknown> = {}) {
  return { kind, timestampMs: 1_000, ...extra };
}

test("append assigns monotonic seq and e<seq> ids and persists as JSONL", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    const first = store.append(entry("message", { content: "hi" }));
    const second = store.append(entry("notice", { content: "x" }));
    assert.deepEqual([first.seq, first.id, second.seq, second.id], [1, "e1", 2, "e2"]);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).content, "hi");
    const reloaded = new TranscriptStore(path);
    assert.equal(reloaded.readAll().length, 2);
    assert.equal(reloaded.last()?.id, "e2");
  } finally {
    temp.cleanup();
  }
});

test("tail pages backwards with nextBeforeSeq", () => {
  const temp = makeTempHome();
  try {
    const store = new TranscriptStore(join(temp.home, "t.jsonl"));
    for (let index = 0; index < 5; index += 1) store.append(entry("message", { content: String(index) }));
    const page = store.tail(2);
    assert.deepEqual(page.entries.map((item) => item.id), ["e4", "e5"]);
    assert.equal(page.nextBeforeSeq, 4);
    const older = store.tail(2, page.nextBeforeSeq);
    assert.deepEqual(older.entries.map((item) => item.id), ["e2", "e3"]);
    const oldest = store.tail(2, older.nextBeforeSeq);
    assert.deepEqual(oldest.entries.map((item) => item.id), ["e1"]);
    assert.equal(oldest.nextBeforeSeq, undefined);
  } finally {
    temp.cleanup();
  }
});

test("update rewrites one entry, keeps id/seq, and survives reload", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    const updated = store.update("e1", (current) => ({ ...current, reactions: [{ emoji: "👍", by: "me" }], seq: 99, id: "zzz" }));
    assert.equal(updated?.id, "e1");
    assert.equal(updated?.seq, 1);
    assert.equal(store.update("missing", (current) => current), null);
    const reloaded = new TranscriptStore(path);
    assert.deepEqual(reloaded.get("e1")?.reactions, [{ emoji: "👍", by: "me" }]);
  } finally {
    temp.cleanup();
  }
});

test("corrupt lines are skipped on load", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    appendFileSync(path, "{not json\n");
    assert.equal(new TranscriptStore(path).readAll().length, 1);
  } finally {
    temp.cleanup();
  }
});
