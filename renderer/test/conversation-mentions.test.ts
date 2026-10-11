import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMentions } from "../src/features/conversation/mentions.ts";

const MEMBERS = [
  { id: "atlas", name: "Atlas" },
  { id: "forge", name: "Forge" },
  { id: "forge-prime", name: "Forge Prime" },
];

test("plain text with no mentions is a single text token", () => {
  assert.deepEqual(parseMentions("hello world", MEMBERS), [{ type: "text", value: "hello world" }]);
});

test("recognizes a mention in the middle of text", () => {
  assert.deepEqual(parseMentions("@Forge takes 1-2, I'll draft 3.", MEMBERS), [
    { type: "mention", id: "forge", name: "Forge" },
    { type: "text", value: " takes 1-2, I'll draft 3." },
  ]);
});

test("prefers the longest matching candidate (Forge Prime over Forge)", () => {
  assert.deepEqual(parseMentions("@Forge Prime, ship it", MEMBERS), [
    { type: "mention", id: "forge-prime", name: "Forge Prime" },
    { type: "text", value: ", ship it" },
  ]);
});

test("@everyone resolves to id: null regardless of case", () => {
  assert.deepEqual(parseMentions("@everyone look here", MEMBERS), [
    { type: "mention", id: null, name: "everyone" },
    { type: "text", value: " look here" },
  ]);
  assert.deepEqual(parseMentions("@Everyone", MEMBERS), [{ type: "mention", id: null, name: "everyone" }]);
});

test("does not match inside an email-like token or a longer word", () => {
  assert.deepEqual(parseMentions("ping ray@forge.dev please", MEMBERS), [{ type: "text", value: "ping ray@forge.dev please" }]);
  assert.deepEqual(parseMentions("@Forgery is not a member", MEMBERS), [{ type: "text", value: "@Forgery is not a member" }]);
});

test("multiple mentions in one string", () => {
  assert.deepEqual(parseMentions("@Atlas plan it, @Forge build it", MEMBERS), [
    { type: "mention", id: "atlas", name: "Atlas" },
    { type: "text", value: " plan it, " },
    { type: "mention", id: "forge", name: "Forge" },
    { type: "text", value: " build it" },
  ]);
});

test("empty string yields no tokens", () => {
  assert.deepEqual(parseMentions("", MEMBERS), []);
});
