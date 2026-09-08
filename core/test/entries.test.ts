import { test } from "node:test";
import assert from "node:assert/strict";
import { botMessageEntry, entryText, lastEntryPreview, noticeEntry, toGroupMessage, toggleReaction, userMessageEntry } from "../src/model/entries.ts";
import type { StoredEntry } from "../src/store/transcript-store.ts";

function stored(entry: Record<string, unknown>, seq = 1): StoredEntry {
  return { ...entry, seq, id: `e${seq}` } as StoredEntry;
}

test("user entries carry the renderer message shape plus clientNonce", () => {
  const entry = userMessageEntry({ content: "hi", timestampMs: 5, clientNonce: "n1", userName: "ray" });
  assert.equal(entry.kind, "message");
  assert.equal(entry.role, "user");
  assert.equal(entry.content, "hi");
  assert.equal(entry.clientNonce, "n1");
  assert.deepEqual(entry.author, { id: "user", name: "ray" });
  assert.equal("richText" in entry, false);
});

test("bot entries are send-message text cards with an author", () => {
  const entry = botMessageEntry({ content: "done", author: { id: "reviewer", name: "Reviewer" }, timestampMs: 5 });
  assert.deepEqual(entry.message, { type: "text", content: "done" });
  assert.equal(entryText(stored(entry)), "done");
  assert.deepEqual(toGroupMessage(stored(entry)), { speaker: { kind: "member", id: "reviewer", name: "Reviewer" }, content: "done" });
});

test("notices are excluded from group history but have text", () => {
  const entry = stored(noticeEntry({ content: "x joined", timestampMs: 1 }));
  assert.equal(entryText(entry), "x joined");
  assert.equal(toGroupMessage(entry), null);
  assert.deepEqual(lastEntryPreview(entry), { kind: "text", text: "x joined" });
  assert.equal(lastEntryPreview(null), null);
});

test("user entries map to user speakers with their name", () => {
  const entry = stored(userMessageEntry({ content: "go", timestampMs: 1, userName: "ray" }));
  assert.deepEqual(toGroupMessage(entry), { speaker: { kind: "user", name: "ray" }, content: "go" });
});

test("toggleReaction adds then removes my reaction", () => {
  const base = stored(botMessageEntry({ content: "a", author: { id: "b", name: "B" }, timestampMs: 1 }));
  const added = toggleReaction(base, "👍");
  assert.deepEqual(added.reactions, [{ emoji: "👍", by: "me" }]);
  const removed = toggleReaction(added, "👍");
  assert.deepEqual(removed.reactions, []);
});
