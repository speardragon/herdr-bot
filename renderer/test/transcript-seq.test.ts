import { test } from "node:test";
import assert from "node:assert/strict";
import { maxEntrySeq, mergeTranscriptPageById } from "../src/production/transcript-seq.ts";

interface Entry {
  readonly id: string;
  readonly text: string;
}

test("mergeTranscriptPageById appends only entries missing from the cache, in fetched order", () => {
  const existing: Entry[] = [{ id: "e1", text: "hi" }, { id: "e2", text: "there" }];
  const fetched: Entry[] = [{ id: "e1", text: "hi" }, { id: "e2", text: "there" }, { id: "e3", text: "new" }, { id: "e4", text: "newer" }];
  const merged = mergeTranscriptPageById(existing, fetched);
  assert.deepEqual(merged, [{ id: "e1", text: "hi" }, { id: "e2", text: "there" }, { id: "e3", text: "new" }, { id: "e4", text: "newer" }]);
});

test("mergeTranscriptPageById never overwrites an already-cached entry, even if the fetched copy differs", () => {
  // Simulates a stale/late resync response racing a live event that already updated the cached entry
  // (e.g. a reaction toggled after the resync request was issued but before it resolved).
  const existing: Entry[] = [{ id: "e1", text: "hi (edited locally)" }];
  const fetched: Entry[] = [{ id: "e1", text: "hi (stale server copy)" }, { id: "e2", text: "new" }];
  const merged = mergeTranscriptPageById(existing, fetched);
  assert.deepEqual(merged, [{ id: "e1", text: "hi (edited locally)" }, { id: "e2", text: "new" }]);
});

test("mergeTranscriptPageById never drops an existing entry the fetched page no longer includes", () => {
  // The host tail window can shift; entries falling out of it must still not be dropped from the cache.
  const existing: Entry[] = [{ id: "e1", text: "old" }, { id: "e2", text: "kept" }];
  const fetched: Entry[] = [{ id: "e2", text: "kept" }, { id: "e3", text: "new" }];
  const merged = mergeTranscriptPageById(existing, fetched);
  assert.deepEqual(merged, [{ id: "e1", text: "old" }, { id: "e2", text: "kept" }, { id: "e3", text: "new" }]);
});

test("mergeTranscriptPageById returns the SAME array reference when nothing new was fetched (lets a caller skip re-rendering)", () => {
  const existing: Entry[] = [{ id: "e1", text: "hi" }];
  const merged = mergeTranscriptPageById(existing, [{ id: "e1", text: "hi (stale)" }]);
  assert.equal(merged, existing);
});

test("regression: a cache revisit after a missed incoming event resyncs the transcript and clears unread", () => {
  // Reproduces the reported gap: the chat was cached at seq 2 (acked), then a live event was missed
  // while backgrounded (e.g. transport disconnect/reconnect) so the incoming seq-3 reply never reached
  // the cached transcript or the read-receipt controller. A cache revisit must refetch the tail, merge
  // the missed entry in by id, and advance the ACK to the newly-merged max seq -- clearing unread.
  const cachedTranscript = [{ id: "e1", text: "hi" }, { id: "e2", text: "loaded before backgrounding" }];
  const cachedAckedSeq = 2; // what the read-receipt controller acked before the chat was backgrounded

  // The host's current tail includes the seq-3 reply the renderer never saw while backgrounded.
  const rawFetchedEntries = [{ id: "e1", seq: 1 }, { id: "e2", seq: 2 }, { id: "e3", seq: 3 }];
  const fetchedProjectedEntries = [{ id: "e1", text: "hi" }, { id: "e2", text: "loaded before backgrounding" }, { id: "e3", text: "missed while backgrounded" }];

  const mergedTranscript = mergeTranscriptPageById(cachedTranscript, fetchedProjectedEntries);
  assert.deepEqual(mergedTranscript, [
    { id: "e1", text: "hi" },
    { id: "e2", text: "loaded before backgrounding" },
    { id: "e3", text: "missed while backgrounded" },
  ]);

  const resyncedMaxSeq = maxEntrySeq(rawFetchedEntries);
  assert.equal(resyncedMaxSeq, 3, "the merge must surface the true latest loaded seq, not the pre-resync cached watermark");
  assert.ok(resyncedMaxSeq > cachedAckedSeq, "there is something new to ack after the resync");
});
