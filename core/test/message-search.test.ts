import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { hostPaths } from "../src/config.ts";
import { searchMessages, type MessageSearchChat } from "../src/services/message-search.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

function writeTranscript(path: string, lines: readonly unknown[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
}

function userMessage(id: string, seq: number, timestampMs: number, content: string): unknown {
  return { id, kind: "message", seq, timestampMs, content, role: "user", author: { id: "user", name: "Ray" } };
}

function botMessage(id: string, seq: number, timestampMs: number, content: string, author: { id: string; name: string }): unknown {
  return { id, kind: "send-message", seq, timestampMs, message: { type: "text", content }, author };
}

function notice(id: string, seq: number, timestampMs: number, content: string): unknown {
  return { id, kind: "notice", seq, timestampMs, content };
}

test("searchMessages: case-insensitive substring match across a bot DM and a room, newest first", async () => {
  const temp = makeTempHome();
  try {
    writeTranscript(hostPaths.botTranscript(temp.home, "reviewer"), [
      userMessage("e1", 1, 1_000, "restart the server when ready"),
      botMessage("e2", 2, 2_000, "Done, I RESTARTED the server.", { id: "reviewer", name: "Reviewer" }),
    ]);
    writeTranscript(hostPaths.roomTranscript(temp.home, "room-team"), [
      botMessage("e3", 1, 3_000, "no mention of the word here", { id: "coder", name: "Coder" }),
    ]);
    const chats: MessageSearchChat[] = [
      { id: "reviewer", name: "Reviewer", isGroup: false },
      { id: "room-team", name: "Team", isGroup: true },
    ];
    const hits = await searchMessages(temp.home, chats, "restart");
    assert.equal(hits.length, 2);
    assert.equal(hits[0]!.entryId, "e2", "newest match first");
    assert.equal(hits[0]!.role, "assistant");
    assert.equal(hits[0]!.agentId, "reviewer");
    assert.equal(hits[1]!.entryId, "e1");
    assert.equal(hits[1]!.role, "user");
  } finally {
    temp.cleanup();
  }
});

test("searchMessages: Korean substring matches, notices/prompts are excluded, and a blank query returns nothing", async () => {
  const temp = makeTempHome();
  try {
    writeTranscript(hostPaths.botTranscript(temp.home, "bot-2"), [
      botMessage("e1", 1, 1_000, "재시작 테스트 완료했습니다.", { id: "bot-2", name: "코더" }),
      notice("e2", 2, 2_000, "재시작 안내 메시지"),
      { id: "e3", kind: "prompt", seq: 3, timestampMs: 3_000, prompt: { question: "재시작할까요?" }, status: "pending" },
    ]);
    const chats: MessageSearchChat[] = [{ id: "bot-2", name: "코더", isGroup: false }];
    const hits = await searchMessages(temp.home, chats, "재시작");
    assert.equal(hits.length, 1, "only the \"message\"/\"send-message\" entry counts -- notice/prompt are excluded");
    assert.equal(hits[0]!.entryId, "e1");
    assert.match(hits[0]!.snippet, /재시작/);

    assert.deepEqual(await searchMessages(temp.home, chats, ""), []);
    assert.deepEqual(await searchMessages(temp.home, chats, "   "), []);
  } finally {
    temp.cleanup();
  }
});

test("searchMessages: a corrupt line is skipped and a missing transcript file is skipped, not fatal", async () => {
  const temp = makeTempHome();
  try {
    const path = hostPaths.botTranscript(temp.home, "bot-a");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(userMessage("e1", 1, 1_000, "find me"))}\nnot valid json\n\n`, "utf8");
    const chats: MessageSearchChat[] = [
      { id: "bot-a", name: "A", isGroup: false },
      { id: "bot-ghost", name: "Ghost", isGroup: false }, // no transcript file on disk at all
    ];
    const hits = await searchMessages(temp.home, chats, "find me");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.agentId, "bot-a");
  } finally {
    temp.cleanup();
  }
});

test("searchMessages: caps at 50 results even when more match", async () => {
  const temp = makeTempHome();
  try {
    const lines = Array.from({ length: 60 }, (_, i) => userMessage(`e${i}`, i + 1, 1_000 + i, "needle in every line"));
    writeTranscript(hostPaths.botTranscript(temp.home, "bot-many"), lines);
    const hits = await searchMessages(temp.home, [{ id: "bot-many", name: "Many", isGroup: false }], "needle");
    assert.equal(hits.length, 50);
    assert.equal(hits[0]!.entryId, "e59", "newest first");
  } finally {
    temp.cleanup();
  }
});

test("searchMessages: the snippet truncates around the match with ellipses, and author falls back to the chat name", async () => {
  const temp = makeTempHome();
  try {
    const long = `${"x".repeat(100)} needle ${"y".repeat(100)}`;
    writeTranscript(hostPaths.botTranscript(temp.home, "bot-a"), [userMessage("e1", 1, 1_000, long)]);
    const hits = await searchMessages(temp.home, [{ id: "bot-a", name: "A", isGroup: false }], "needle");
    assert.equal(hits.length, 1);
    assert.ok(hits[0]!.snippet.startsWith("…"));
    assert.ok(hits[0]!.snippet.endsWith("…"));
    assert.ok(hits[0]!.snippet.includes("needle"));
    assert.ok(hits[0]!.snippet.length < long.length);
  } finally {
    temp.cleanup();
  }
});

test("searchMessages: the snippet drops markdown code and emphasis markers so the palette shows plain text", async () => {
  const temp = makeTempHome();
  try {
    writeTranscript(hostPaths.botTranscript(temp.home, "bot-a"), [
      botMessage("e1", 1, 1_000, "every 429 carries `Retry-After` and **must** be honored\n```ts\nres.setHeader(\"Retry-After\")\n```", { id: "bot-a", name: "A" }),
    ]);
    const hits = await searchMessages(temp.home, [{ id: "bot-a", name: "A", isGroup: false }], "retry-after");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.snippet, "every 429 carries Retry-After and must be honored res.setHeader(\"Retry-After\")");
  } finally {
    temp.cleanup();
  }
});
