import { test } from "node:test";
import assert from "node:assert/strict";
import { DM_TAG, ROOM_TAG_PREFIX, buildDmTurnPrompt, buildIdentityBrief, buildRoomTurnPrompt } from "../src/bots/prompts.ts";
import { formatGroupLine } from "../src/group/group-chat.ts";

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
  assert.match(prompt, /ray \(user\): please review\nFixer \(bot id: fixer\): on it/);
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

test("DM turn prompt distinguishes current reply from cross-chat messages", () => {
  const prompt = buildDmTurnPrompt({ bot: reviewer, chatId: "reviewer", userName: "ray", cliPath: cli, newMessages: [] });
  assert.match(prompt, /\/h\/bin\/herdr-bot message <bot-id> "<message>"/);
  assert.match(prompt, /\/h\/bin\/herdr-bot message <room-id> "<message>"/);
  assert.match(prompt, /Use say only for the chat whose turn is currently open/);
  assert.match(prompt, /Do not send acknowledgement-only messages back and forth/);
  assert.match(prompt, /Use say only for this DM turn/);
});

test("room turn prompt distinguishes the active room from other chats", () => {
  const prompt = buildRoomTurnPrompt({ room: { id: "room-x-1", name: "x", description: "" }, member: reviewer, peers: [fixer], newMessages: [], cliPath: cli });
  assert.match(prompt, /Use say for this room/);
  assert.match(prompt, /Use message only for a different DM or room/);
});

test("bot relay prompt identifies the requester and explains both handoffs", () => {
  const prompt = buildDmTurnPrompt({
    bot: reviewer,
    chatId: "reviewer",
    userName: "ray",
    cliPath: cli,
    newMessages: [{ speaker: { kind: "member", id: "bot-a", name: "Ava" }, content: "Please review the change" }],
  });
  assert.match(prompt, /Ava \(bot id: bot-a\): Please review the change/);
  assert.match(prompt, /Only after it succeeds, say in your current chat/);
  assert.match(prompt, /send the result back to the requesting bot's id/);
  assert.match(prompt, /summarize the received result to the user/);
  assert.equal(formatGroupLine({ speaker: { kind: "member", id: "bot-a", name: "Ava" }, content: "Done" }, "bot-a"), "Ava (bot id: bot-a) (you): Done");
});
