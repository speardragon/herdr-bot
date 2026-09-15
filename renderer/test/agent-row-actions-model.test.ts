import { test } from "node:test";
import assert from "node:assert/strict";
import { agentRowActions, isDeleteAgentAction, isTogglePinAction } from "../src/production/agent-row-actions-model.ts";

// herdr-bot: the sidebar row menu is 고정/고정 해제 · Bot 이름 변경 · 프로필 편집 · 삭제. Only the two
// toggles (pin, delete) live in this model; AgentRowActions.tsx turns `onTogglePin != null` into
// `includePin` and `onRequestDelete != null` into `includeDelete`, so these lock that gating.
test("agentRowActions: includePin false never yields a pin/unpin action", () => {
  const actions = agentRowActions({ isPinned: false, includePin: false });
  assert.equal(actions.some(isTogglePinAction), false);
});

test("agentRowActions: includePin true yields Pin when unpinned, Unpin when pinned", () => {
  const unpinned = agentRowActions({ isPinned: false, includePin: true });
  assert.deepEqual(unpinned.filter(isTogglePinAction).map((action) => action.id), ["pin-agent"]);
  const pinned = agentRowActions({ isPinned: true, includePin: true });
  assert.deepEqual(pinned.filter(isTogglePinAction).map((action) => action.id), ["unpin-agent"]);
});

test("agentRowActions: the full menu is pin then delete, and nothing else", () => {
  const actions = agentRowActions({ isPinned: false, includePin: true, includeDelete: true });
  assert.deepEqual(actions.map((action) => action.id), ["pin-agent", "delete-agent"]);
  assert.equal(actions.filter(isDeleteAgentAction).length, 1);
  assert.deepEqual(agentRowActions({}), [], "no callbacks wired -> empty menu (AgentRowActions then never opens)");
});
