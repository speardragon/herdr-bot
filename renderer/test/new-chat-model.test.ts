import { test } from "node:test";
import assert from "node:assert/strict";
import { addDraftMember, removeDraftMember, canCreateGroup } from "../src/production/new-chat-model.ts";

test("group chips toggle membership without duplicates", () => {
  const draft = { requestId: "request-1", mode: "group" as const, query: "", memberIds: [] };
  const one = addDraftMember(draft, "a");
  assert.deepEqual(addDraftMember(one, "a").memberIds, ["a"]);
  const two = addDraftMember(one, "b");
  assert.equal(canCreateGroup(two), true);
  assert.equal(canCreateGroup(removeDraftMember(two, "a")), false);
});
