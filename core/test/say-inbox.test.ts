import { test } from "node:test";
import assert from "node:assert/strict";
import { SayInbox } from "../src/bots/say-inbox.ts";

test("says during an open turn are collected up to the per-turn cap; others are late", () => {
  const inbox = new SayInbox();
  assert.equal(inbox.accept("room-1", "a", "early"), "late");
  const turn = inbox.open("room-1", "a");
  assert.equal(inbox.accept("room-1", "a", "one"), "in-turn");
  assert.equal(inbox.accept("room-1", "a", "two"), "in-turn");
  assert.equal(inbox.accept("room-1", "a", "three"), "over-cap");
  assert.equal(inbox.accept("room-1", "b", "other bot"), "late");
  assert.equal(inbox.accept("room-2", "a", "other room"), "late");
  assert.deepEqual(turn.close(), ["one", "two"]);
  assert.equal(inbox.isOpen("room-1", "a"), false);
  assert.equal(inbox.accept("room-1", "a", "after"), "late");
});

test("reopening replaces the previous turn for the same bot", () => {
  const inbox = new SayInbox();
  const first = inbox.open("room-1", "a");
  const second = inbox.open("room-1", "a");
  inbox.accept("room-1", "a", "x");
  assert.deepEqual(first.close(), []);
  assert.deepEqual(second.close(), ["x"]);
});
