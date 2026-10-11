import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveNoticeView } from "../src/features/conversation/notice-view.ts";
import type { TranscriptEntry } from "../src/data/types.ts";

test("renamed notice derives from the structured event, not the raw (host-Korean) content", () => {
  const entry: TranscriptEntry = { id: "n1", kind: "notice", seq: 1, timestampMs: 0, content: "이름 변경됨: Forge", event: { type: "bot-renamed", oldName: "Old", newName: "Forge" } };
  assert.deepEqual(deriveNoticeView(entry), { kind: "renamed", oldName: "Old", newName: "Forge" });
});

test("delegation notice derives from the structured event", () => {
  const entry: TranscriptEntry = {
    id: "n2",
    kind: "notice",
    seq: 1,
    timestampMs: 0,
    content: "메시지 보냄: Forge",
    event: { type: "bot-message-sent", targetChatId: "forge", targetName: "Forge", targetKind: "bot" },
  };
  assert.deepEqual(deriveNoticeView(entry), { kind: "delegated", targetChatId: "forge", targetName: "Forge", targetKind: "bot" });
});

test("a plain notice (no event) renders its content verbatim", () => {
  const entry: TranscriptEntry = { id: "n3", kind: "notice", seq: 1, timestampMs: 0, content: "Forge이(가) 늦게 응답을 완료했습니다" };
  assert.deepEqual(deriveNoticeView(entry), { kind: "plain", text: "Forge이(가) 늦게 응답을 완료했습니다" });
});
