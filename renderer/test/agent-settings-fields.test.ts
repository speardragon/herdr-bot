import { test } from "node:test";
import assert from "node:assert/strict";
import { agentSettingsFields } from "../src/recovered/features/agent-info/settings/fields.ts";

// herdr-bot: AgentSettingsPanel (settings/view.tsx) is presentational and there is no DOM harness,
// so the one piece of logic in it -- which fields a bot vs a group gets -- is locked here.

test("a bot's settings show name, the optional label, then description (reference order)", () => {
  const fields = agentSettingsFields(false);
  assert.deepEqual(fields.map((field) => field.key), ["name", "title", "description"]);
  assert.deepEqual(fields.map((field) => field.labelKo), ["이름", "레이블 (선택사항)", "설명"]);
  assert.equal(fields[1]!.placeholderKo, "리서치, 마케팅, 관리");
  assert.equal(fields[1]!.isRequired, false);
});

test("a group's settings have no label field and a group-specific description placeholder", () => {
  const fields = agentSettingsFields(true);
  assert.deepEqual(fields.map((field) => field.key), ["name", "description"]);
  assert.equal(fields[1]!.placeholderKo, "이 그룹의 역할");
  assert.equal(fields[1]!.isMultiline, true);
});

test("only the name is required, and only the description is multiline, for both kinds", () => {
  for (const isGroup of [false, true]) {
    const fields = agentSettingsFields(isGroup);
    assert.deepEqual(fields.filter((field) => field.isRequired).map((field) => field.key), ["name"]);
    assert.deepEqual(fields.filter((field) => field.isMultiline).map((field) => field.key), ["description"]);
  }
});
