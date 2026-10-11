import { test } from "node:test";
import assert from "node:assert/strict";
import { dmHeaderPhrase, workingOnlyPresence } from "../src/features/conversation/header-status.ts";

test("dmHeaderPhrase: working only, never needsApproval or idle", () => {
  assert.equal(dmHeaderPhrase("working"), "working");
  assert.equal(dmHeaderPhrase("needsApproval"), null);
  assert.equal(dmHeaderPhrase(null), null);
});

test("workingOnlyPresence: drops needsApproval members, keeps order of the rest", () => {
  const presence = [
    { name: "Forge", phrase: "needsApproval" as const },
    { name: "Lens", phrase: "working" as const },
    { name: "Atlas", phrase: "working" as const },
  ];
  assert.deepEqual(workingOnlyPresence(presence), [
    { name: "Lens", phrase: "working" },
    { name: "Atlas", phrase: "working" },
  ]);
});

test("workingOnlyPresence: empty in, empty out", () => {
  assert.deepEqual(workingOnlyPresence([]), []);
});
