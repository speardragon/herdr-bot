import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createControlHandler } from "../src/control/handlers.ts";
import { createCoordinatorDispatcher } from "../src/coordinator/dispatcher.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile } from "./helpers/fixtures.ts";

test("self profile edits persist, publish updates, and interoperate with UI edits", async () => {
  const temp = makeTempHome();
  try {
    const config = resolveConfig({ HERDR_BOT_HOME: temp.home });
    const profiles = new ProfileStore(temp.home);
    profiles.save(sampleProfile({ id: "a", name: "A", herdr: { paneId: "w1:p1", workspaceId: "w1", sessionId: null } }));
    profiles.save(sampleProfile({ id: "b", name: "B", herdr: { paneId: "w1:p2", workspaceId: "w1", sessionId: null } }));
    const host = createHost(config, { socketPath: null, ensureSession: null });
    const call = createControlHandler(host);
    const updates: unknown[] = [];
    host.events.on("agent-upserted", (event) => updates.push(event));
    const edited = await call("profile.update", { paneId: "w1:p1", name: "레이", title: "리뷰", description: "짧게 답변" });
    assert.deepEqual(edited, { id: "a", name: "레이", title: "리뷰", description: "짧게 답변" });
    assert.equal(profiles.get("a")?.name, "레이");
    assert.equal(profiles.get("b")?.name, "B");
    assert.equal(updates.length, 1);
    await assert.rejects(call("profile.update", { paneId: "w1:p1", id: "b", name: "wrong" }));
    await assert.rejects(call("profile.update", { paneId: "unknown", name: "wrong" }));
    await assert.rejects(call("profile.update", { paneId: "w1:p1", name: " " }));
    const dispatch = createCoordinatorDispatcher(host);
    const result = await dispatch("updateAgent", { id: "a", profile: { name: "UI name", title: "", description: "" } });
    assert.equal(result.status, "ok");
    assert.deepEqual(await call("profile.get", { paneId: "w1:p1" }), { id: "a", name: "UI name", title: "", description: "" });
    assert.deepEqual(host.roster.memberIdFor("a"), { id: "a", name: "UI name", description: "" });
  } finally {
    temp.cleanup();
  }
});
