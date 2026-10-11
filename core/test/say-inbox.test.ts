import { test } from "node:test";
import assert from "node:assert/strict";
import { SayInbox } from "../src/bots/say-inbox.ts";

test("says during an open turn are collected up to the per-turn cap; others are late", () => {
  const inbox = new SayInbox();
  assert.equal(inbox.accept("room-1", "a", "early").mode, "late");
  const turn = inbox.open("room-1", "a");
  assert.equal(inbox.accept("room-1", "a", "one").mode, "in-turn");
  assert.equal(inbox.accept("room-1", "a", "two").mode, "in-turn");
  assert.equal(inbox.accept("room-1", "a", "three").mode, "over-cap");
  assert.equal(inbox.accept("room-1", "b", "other bot").mode, "late");
  assert.equal(inbox.accept("room-2", "a", "other room").mode, "late");
  assert.deepEqual(turn.close(), ["one", "two"]);
  assert.equal(inbox.isOpen("room-1", "a"), false);
  assert.equal(inbox.accept("room-1", "a", "after").mode, "late");
});

test("reopening replaces the previous turn for the same bot", () => {
  const inbox = new SayInbox();
  const first = inbox.open("room-1", "a");
  const second = inbox.open("room-1", "a");
  inbox.accept("room-1", "a", "x");
  assert.deepEqual(first.close(), []);
  assert.deepEqual(second.close(), ["x"]);
});

test("a late say reports how long after close it arrived", () => {
  let now = 1_000;
  const inbox = new SayInbox(() => now);
  const turn = inbox.open("room-1", "a");
  turn.close();
  now = 1_500;
  assert.deepEqual(inbox.accept("room-1", "a", "late thought"), { mode: "late", lateAfterMs: 500 });
});

test("markInterrupted tags the next in-turn say staleFor that entry, but only the first one", () => {
  const inbox = new SayInbox();
  inbox.open("room-1", "a");
  inbox.markInterrupted("room-1", "a", "e5");
  assert.deepEqual(inbox.accept("room-1", "a", "answering the old ask"), { mode: "in-turn", staleFor: "e5" });
  assert.deepEqual(inbox.accept("room-1", "a", "a second say this turn"), { mode: "in-turn" });
});

test("heldEntryIds tag only the first in-turn say with answersHeld (the oldest held question)", () => {
  const inbox = new SayInbox();
  inbox.open("room-1", "a", { heldEntryIds: ["e2", "e4"] });
  assert.deepEqual(inbox.accept("room-1", "a", "sorry, to answer your earlier question: 4"), { mode: "in-turn", answersHeld: "e2" });
  assert.deepEqual(inbox.accept("room-1", "a", "also:"), { mode: "in-turn" });
});

test("openBotsFor lists every bot with a currently open turn in a chat", () => {
  const inbox = new SayInbox();
  inbox.open("room-1", "a");
  inbox.open("room-1", "b");
  inbox.open("room-2", "a");
  assert.deepEqual(inbox.openBotsFor("room-1").sort(), ["a", "b"]);
  assert.deepEqual(inbox.openBotsFor("room-3"), []);
});
