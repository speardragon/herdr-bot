import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyBotFormState, validateBotForm } from "../src/features/dialogs/bot-form.ts";
import type { BotFormState } from "../src/features/dialogs/bot-form.ts";
import { canToggleMember, MAX_ROOM_MEMBERS, toggleMember, validateRoomForm } from "../src/features/dialogs/room-form.ts";
import { resolveBotFormDefaults } from "../src/features/dialogs/quick-create-defaults.ts";
import { diffLaunchSettings, launchSettingsFormFromFacts } from "../src/features/dialogs/launch-settings-diff.ts";
import { findProvider, providerSupportsModel, providerSupportsReasoning, PROVIDERS } from "../src/features/dialogs/provider-catalog.ts";
import type { BotFacts } from "../src/data/types.ts";

function botForm(patch: Partial<BotFormState> = {}): BotFormState {
  return { name: "Code Reviewer", persona: "", provider: "claude", cwd: "/Users/ray/work/shop", permissionMode: "ask", model: null, reasoningEffort: null, adoptPaneId: null, ...patch };
}

// ---- provider-catalog ----

test("provider-catalog: exposes exactly the 5 curated providers", () => {
  assert.deepEqual(
    PROVIDERS.map((p) => p.id),
    ["claude", "codex", "grok", "gemini", "opencode"],
  );
});

test("provider-catalog: model is meaningful for all 5, reasoning only for claude/codex/grok", () => {
  assert.equal(providerSupportsModel("claude"), true);
  assert.equal(providerSupportsModel("gemini"), true);
  assert.equal(providerSupportsReasoning("claude"), true);
  assert.equal(providerSupportsReasoning("codex"), true);
  assert.equal(providerSupportsReasoning("grok"), true);
  assert.equal(providerSupportsReasoning("gemini"), false);
  assert.equal(providerSupportsReasoning("opencode"), false);
});

test("provider-catalog: grok has no icon slug (falls back to a monogram)", () => {
  assert.equal(findProvider("grok").iconSlug, null);
});

test("provider-catalog: coloured marks carry their brand colour, black marks follow the text colour", () => {
  assert.equal(findProvider("claude").iconColor, "#D97757");
  assert.equal(findProvider("gemini").iconColor, "#8E75B2");
  assert.equal(findProvider("codex").iconColor, null);
  assert.equal(findProvider("opencode").iconColor, null);
});

test("provider-catalog: unknown id falls back to the default provider", () => {
  assert.equal(findProvider("not-a-real-kind").id, "claude");
  assert.equal(findProvider(undefined).id, "claude");
});

// ---- bot-form ----

test("bot-form: empty name is invalid", () => {
  const result = validateBotForm(botForm({ name: "   " }), { exists: true, isHome: false }, false);
  assert.equal(result.nameError, "required");
  assert.equal(result.canSubmit, false);
});

test("bot-form: empty cwd is invalid (not adopting)", () => {
  const result = validateBotForm(botForm({ cwd: "" }), null, false);
  assert.equal(result.cwdError, "required");
  assert.equal(result.canSubmit, false);
});

test("bot-form: a cwd that doesn't exist on disk is invalid", () => {
  const result = validateBotForm(botForm(), { exists: false, isHome: false }, false);
  assert.equal(result.cwdError, "not-found");
  assert.equal(result.canSubmit, false);
});

test("bot-form: a valid cwd with no directory check yet (still loading) does not block submit", () => {
  const result = validateBotForm(botForm(), null, false);
  assert.equal(result.cwdError, null);
  assert.equal(result.canSubmit, true);
});

test("bot-form: home directory requires confirmation unless allowHomeCwd is set", () => {
  const blocked = validateBotForm(botForm({ cwd: "/Users/ray" }), { exists: true, isHome: true }, false);
  assert.equal(blocked.needsHomeConfirmation, true);
  assert.equal(blocked.canSubmit, false);

  const confirmed = validateBotForm(botForm({ cwd: "/Users/ray" }), { exists: true, isHome: true }, true);
  assert.equal(confirmed.needsHomeConfirmation, false);
  assert.equal(confirmed.canSubmit, true);
});

test("bot-form: adopting a running agent skips every cwd rule", () => {
  const result = validateBotForm(botForm({ cwd: "", adoptPaneId: "w1:p1" }), { exists: false, isHome: true }, false);
  assert.equal(result.cwdError, null);
  assert.equal(result.needsHomeConfirmation, false);
  assert.equal(result.canSubmit, true);
});

test("bot-form: emptyBotFormState seeds launch fields from the resolved defaults", () => {
  const state = emptyBotFormState({ cwd: "/Users/ray/work/shop", provider: "codex", permissionMode: "auto" });
  assert.equal(state.name, "");
  assert.equal(state.cwd, "/Users/ray/work/shop");
  assert.equal(state.provider, "codex");
  assert.equal(state.permissionMode, "auto");
});

test("bot-form: emptyBotFormState accepts a null permissionMode default (agent's default)", () => {
  const state = emptyBotFormState({ cwd: "/Users/ray/work/shop", provider: "codex", permissionMode: null });
  assert.equal(state.permissionMode, null);
});

// ---- room-form ----

test("room-form: canToggleMember allows unchecking even at the cap", () => {
  const six = ["a", "b", "c", "d", "e", "f"];
  assert.equal(canToggleMember(six, "a"), true);
  assert.equal(canToggleMember(six, "g"), false);
});

test("room-form: toggleMember is a no-op past the cap", () => {
  const six = ["a", "b", "c", "d", "e", "f"];
  assert.deepEqual(toggleMember(six, "g"), six);
  assert.deepEqual(toggleMember(six, "a"), ["b", "c", "d", "e", "f"]);
  assert.deepEqual(toggleMember(["a"], "b"), ["a", "b"]);
});

test("room-form: MAX_ROOM_MEMBERS is 6", () => {
  assert.equal(MAX_ROOM_MEMBERS, 6);
});

test("room-form: requires a name and at least one member", () => {
  assert.equal(validateRoomForm({ name: "", goal: "", memberIds: [] }).canSubmit, false);
  assert.equal(validateRoomForm({ name: "Auth refactor", goal: "", memberIds: [] }).memberError, "required");
  assert.equal(validateRoomForm({ name: "Auth refactor", goal: "", memberIds: ["forge"] }).canSubmit, true);
});

// ---- quick-create-defaults ----

test("quick-create-defaults: settings fields override host defaults field by field", () => {
  const hostDefaults = { cwd: "/Users/ray/work/shop", provider: "claude", permissionMode: "ask" as const, homeDir: "/Users/ray" };
  const resolved = resolveBotFormDefaults(hostDefaults, { defaultWorkingFolder: "/Users/ray/work/other", defaultProvider: null, defaultPermissionMode: "auto" });
  assert.equal(resolved.cwd, "/Users/ray/work/other");
  assert.equal(resolved.provider, "claude");
  assert.equal(resolved.permissionMode, "auto");
});

test("quick-create-defaults: null settings falls back to host defaults for cwd/provider, but to null (agent's default) for permissionMode -- never host.permissionMode", () => {
  const hostDefaults = { cwd: "/Users/ray/work/shop", provider: "claude", permissionMode: "ask" as const, homeDir: "/Users/ray" };
  assert.deepEqual(resolveBotFormDefaults(hostDefaults, null), { cwd: hostDefaults.cwd, provider: hostDefaults.provider, permissionMode: null });
});

test("quick-create-defaults: an explicit AppSettings.defaultPermissionMode: null is passed through as agent's default, not coalesced to the host's default", () => {
  const hostDefaults = { cwd: "/Users/ray/work/shop", provider: "claude", permissionMode: "auto" as const, homeDir: "/Users/ray" };
  const resolved = resolveBotFormDefaults(hostDefaults, { defaultWorkingFolder: null, defaultProvider: null, defaultPermissionMode: null });
  assert.equal(resolved.permissionMode, null);
});

// ---- launch-settings-diff ----

function botFacts(patch: Partial<BotFacts> = {}): BotFacts {
  return { provider: "claude", status: "idle", paneId: "w1:p1", cwd: "/Users/ray/work/shop", adopted: false, permissionMode: "ask", model: null, reasoningEffort: "medium", onboarding: null, pendingPrompt: null, ...patch };
}

test("launch-settings-diff: no changes returns null", () => {
  const facts = botFacts();
  assert.equal(diffLaunchSettings(facts, launchSettingsFormFromFacts(facts)), null);
});

test("launch-settings-diff: only the touched field is included", () => {
  const facts = botFacts();
  const edited = { ...launchSettingsFormFromFacts(facts), permissionMode: "auto" as const };
  assert.deepEqual(diffLaunchSettings(facts, edited), { permissionMode: "auto" });
});

test("launch-settings-diff: clearing model to null is a real, included change", () => {
  const facts = botFacts({ model: "sonnet" });
  const edited = { ...launchSettingsFormFromFacts(facts), model: null };
  assert.deepEqual(diffLaunchSettings(facts, edited), { model: null });
});

test("launch-settings-diff: clearing permissionMode to null (agent's default) is a real, included change", () => {
  const facts = botFacts({ permissionMode: "ask" });
  const edited = { ...launchSettingsFormFromFacts(facts), permissionMode: null };
  assert.deepEqual(diffLaunchSettings(facts, edited), { permissionMode: null });
});

test("launch-settings-diff: a null cwd on the original normalizes to empty string for comparison", () => {
  const facts = botFacts({ cwd: null });
  assert.equal(launchSettingsFormFromFacts(facts).cwd, "");
  assert.equal(diffLaunchSettings(facts, launchSettingsFormFromFacts(facts)), null);
});
