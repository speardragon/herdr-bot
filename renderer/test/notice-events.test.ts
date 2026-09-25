import { test } from "node:test";
import assert from "node:assert/strict";
import { projectBotSystemEvent } from "../src/production/bot-system-event.ts";

test("projectBotSystemEvent validates a well-formed bot-renamed event", () => {
  assert.deepEqual(
    projectBotSystemEvent({ type: "bot-renamed", oldName: "A", newName: "Ava" }),
    { type: "bot-renamed", oldName: "A", newName: "Ava" },
  );
});

test("projectBotSystemEvent validates a well-formed bot-message-sent event (bot and room targets)", () => {
  assert.deepEqual(
    projectBotSystemEvent({ type: "bot-message-sent", targetChatId: "b", targetName: "B", targetKind: "bot" }),
    { type: "bot-message-sent", targetChatId: "b", targetName: "B", targetKind: "bot" },
  );
  assert.deepEqual(
    projectBotSystemEvent({ type: "bot-message-sent", targetChatId: "room-1", targetName: "auth", targetKind: "room" }),
    { type: "bot-message-sent", targetChatId: "room-1", targetName: "auth", targetKind: "room" },
  );
});

test("projectBotSystemEvent falls back to null for an unrecognized type", () => {
  assert.equal(projectBotSystemEvent({ type: "something-else", foo: "bar" }), null);
  assert.equal(projectBotSystemEvent(undefined), null);
  assert.equal(projectBotSystemEvent(null), null);
  assert.equal(projectBotSystemEvent("bot-renamed"), null);
});

test("projectBotSystemEvent falls back to null for a malformed bot-renamed event (wrong shape, not just missing fields)", () => {
  assert.equal(projectBotSystemEvent({ type: "bot-renamed", oldName: "A" }), null); // missing newName
  assert.equal(projectBotSystemEvent({ type: "bot-renamed", oldName: 5, newName: "Ava" }), null); // wrong type
  assert.equal(projectBotSystemEvent({ type: "bot-renamed", oldName: "", newName: "Ava" }), null); // empty string
});

test("projectBotSystemEvent falls back to null for a malformed bot-message-sent event", () => {
  assert.equal(projectBotSystemEvent({ type: "bot-message-sent", targetChatId: "b", targetName: "B" }), null); // missing targetKind
  assert.equal(projectBotSystemEvent({ type: "bot-message-sent", targetChatId: "b", targetName: "B", targetKind: "group" }), null); // invalid targetKind
  assert.equal(projectBotSystemEvent({ type: "bot-message-sent", targetChatId: 1, targetName: "B", targetKind: "bot" }), null); // wrong type
});
