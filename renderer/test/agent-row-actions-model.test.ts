import { test } from "node:test";
import assert from "node:assert/strict";
import { agentRowActions, isTogglePinAction } from "../src/production/agent-row-actions-model.ts";

// herdr-bot (task 3, plan §2.2 "정렬 우선권을 적용하지 않고 관련 편집 메뉴를 감춘다"): the recent-order
// screen stops passing onTogglePin to ConversationSidebar, which AgentRowActions.tsx turns into
// `includePin: onTogglePin != null`. This locks the gate that fix depends on at the model level --
// full per-row DOM menu rendering (including the "Move to section" submenu, which is gated in
// AgentRowActions.tsx itself rather than this model) is deferred to Task 8.
test("agentRowActions: includePin false (as when onTogglePin is unwired) never yields a pin/unpin action", () => {
  const actions = agentRowActions({ isHidden: false, isPinned: false, includePin: false });
  assert.equal(actions.some(isTogglePinAction), false);
});

test("agentRowActions: includePin true yields Pin when unpinned, Unpin when pinned", () => {
  const unpinned = agentRowActions({ isHidden: false, isPinned: false, includePin: true });
  assert.deepEqual(unpinned.filter(isTogglePinAction).map((action) => action.id), ["pin-agent"]);
  const pinned = agentRowActions({ isHidden: false, isPinned: true, includePin: true });
  assert.deepEqual(pinned.filter(isTogglePinAction).map((action) => action.id), ["unpin-agent"]);
});
