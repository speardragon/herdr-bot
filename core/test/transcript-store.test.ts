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

test("last()/nextSeq() on a fresh (never-loaded) store read only the file's tail, even with a large last line", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const seed = new TranscriptStore(path);
    seed.append(entry("message", { content: "a" }));
    // A last line far bigger than the initial tail chunk forces the reader to grow its read.
    seed.append(entry("message", { content: "x".repeat(10_000) }));
    const fresh = new TranscriptStore(path);
    const last = fresh.last();
    assert.equal(last?.id, "e2");
    assert.equal((last?.content as string).length, 10_000);
    assert.equal(fresh.nextSeq(), 3);
  } finally {
    temp.cleanup();
  }
});

test("last() from the tail skips a corrupt trailing line, even one longer than the initial chunk", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const seed = new TranscriptStore(path);
    seed.append(entry("message", { content: "good" }));
    appendFileSync(path, `{"not": "valid", "garbage": "${"z".repeat(10_000)}"\n`); // corrupt: missing closing brace
    const fresh = new TranscriptStore(path);
    assert.equal(fresh.last()?.id, "e1");
    assert.equal(fresh.nextSeq(), 2);
  } finally {
    temp.cleanup();
  }
});

test("last() on a missing file is null and nextSeq() starts at 1", () => {
  const temp = makeTempHome();
  try {
    const store = new TranscriptStore(join(temp.home, "missing.jsonl"));
    assert.equal(store.last(), null);
    assert.equal(store.nextSeq(), 1);
  } finally {
    temp.cleanup();
  }
});

test("release() drops the full entry array but append() keeps seq continuity without a reload", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    store.append(entry("message", { content: "b" }));
    assert.equal(store.readAll().length, 2); // force a full load
    store.release();
    const appended = store.append(entry("message", { content: "c" }));
    assert.equal(appended.seq, 3);
    assert.equal(appended.id, "e3");
    assert.equal(store.last()?.id, "e3");
    // readAll() transparently reloads the full history, release did not lose anything on disk.
    assert.deepEqual(store.readAll().map((e) => e.id), ["e1", "e2", "e3"]);
  } finally {
    temp.cleanup();
  }
});

test("release() does not disturb get/update/tail: they transparently reload from disk", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    store.append(entry("message", { content: "b" }));
    store.release();
    assert.equal(store.get("e1")?.content, "a");
    const updated = store.update("e2", (current) => ({ ...current, content: "b2" }));
    assert.equal(updated?.content, "b2");
    store.release();
    assert.deepEqual(store.tail(10).entries.map((e) => e.id), ["e1", "e2"]);
  } finally {
    temp.cleanup();
  }
});

test("update() is a no-op write when the patch leaves every field the same", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    const before = readFileSync(path, "utf8");
    const unchanged = store.update("e1", (current) => ({ ...current }));
    const after = readFileSync(path, "utf8");
    assert.equal(unchanged?.content, "a");
    assert.equal(after, before, "an unchanged patch must not rewrite the file");
  } finally {
    temp.cleanup();
  }
});

test("onFullAccess fires on readAll()/get()/update()/tail() but not on a cold last()/nextSeq()", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    let fullAccesses = 0;
    const store = new TranscriptStore(path, () => {
      fullAccesses += 1;
    });
    store.append(entry("message", { content: "a" })); // append alone never loads the full array
    assert.equal(fullAccesses, 0);
    assert.equal(store.last()?.content, "a"); // served from the append-time last-entry cache
    assert.equal(fullAccesses, 0);
    store.readAll();
    assert.equal(fullAccesses, 1);
  } finally {
    temp.cleanup();
  }
});
