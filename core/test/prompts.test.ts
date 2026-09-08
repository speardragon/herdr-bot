import { test } from "node:test";
import assert from "node:assert/strict";
import { DM_TAG, ROOM_TAG_PREFIX, buildDmTurnPrompt, buildIdentityBrief, buildRoomTurnPrompt } from "../src/bots/prompts.ts";

const cli = "/h/bin/herdr-bot";
const reviewer = { id: "reviewer", name: "Code Reviewer", description: "reviews diffs" };
const fixer = { id: "fixer", name: "Fixer", description: "" };

test("identity brief names the bot, the CLI path, and the say/pass protocol", () => {
  const brief = buildIdentityBrief({ bot: reviewer, userName: "ray", cliPath: cli });
  assert.match(brief, /You are "Code Reviewer" \(id: reviewer\)/);
  assert.match(brief, /reviews diffs/);
  assert.match(brief, new RegExp(`${cli} say <room-id> "<your message>"`));
  assert.match(brief, new RegExp(`${cli} pass <room-id>`));
  assert.match(brief, /ray/);
  assert.match(brief, /NOT visible/);
});

test("room turn prompt carries the tag, peers, new messages, and exact say command", () => {
  const prompt = buildRoomTurnPrompt({
    room: { id: "room-auth-1a2b", name: "auth", description: "fix login" },
    member: reviewer,
    peers: [fixer],
    newMessages: [{ speaker: { kind: "user", name: "ray" }, content: "please review" }, { speaker: { kind: "member", id: "fixer", name: "Fixer" }, content: "on it" }],
    cliPath: cli,
  });
  assert.ok(prompt.startsWith(`${ROOM_TAG_PREFIX}"auth" - with Fixer]`));
  assert.match(prompt, /fix login/);
  assert.match(prompt, /ray \(user\): please review\nFixer: on it/);
  assert.match(prompt, new RegExp(`${cli} say room-auth-1a2b "`));
  assert.match(prompt, new RegExp(`${cli} pass room-auth-1a2b`));
  assert.match(prompt, /max 2 per turn/);
});

test("room turn prompt with no new messages says so", () => {
  const prompt = buildRoomTurnPrompt({ room: { id: "room-x-1", name: "x", description: "" }, member: reviewer, peers: [], newMessages: [], cliPath: cli });
  assert.match(prompt, /No new messages/);
  assert.ok(prompt.startsWith(`${ROOM_TAG_PREFIX}"x"]`));
});

test("DM turn prompt uses the DM tag and the bot chat id", () => {
  const prompt = buildDmTurnPrompt({ bot: reviewer, chatId: "reviewer", userName: "ray", cliPath: cli, newMessages: [{ speaker: { kind: "user", name: "ray" }, content: "hi" }] });
  assert.ok(prompt.startsWith(DM_TAG));
  assert.match(prompt, new RegExp(`${cli} say reviewer "`));
  assert.match(prompt, /ray \(user\): hi/);
});
