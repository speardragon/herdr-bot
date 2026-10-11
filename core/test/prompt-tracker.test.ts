import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../src/config.ts";
import { HostEvents } from "../src/host-events.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { parseBlockedPrompt } from "../src/herdr/blocked-prompt.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { PromptTracker } from "../src/services/prompt-tracker.ts";
import { SayInbox } from "../src/bots/say-inbox.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import type { BotRuntime } from "../src/herdr/types.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile } from "./helpers/fixtures.ts";
import { ASK_SINGLE_SCREEN, UNKNOWN_FORM_SCREEN } from "./helpers/prompt-screens.ts";

const OFFLINE: BotRuntime = { status: "offline", paneId: null, workspaceId: null, sessionId: null, kind: null, prompt: null };

function blocked(prompt: ReturnType<typeof parseBlockedPrompt>): BotRuntime {
  return { status: "blocked", paneId: "w1:p1", workspaceId: "w1", sessionId: "s1", kind: "claude", prompt };
}

function harness() {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BOT_USER_NAME: "ray" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  profiles.save(sampleProfile({ id: "reviewer", name: "Reviewer" }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const events = new HostEvents();
  const seen: { family: string; payload: unknown }[] = [];
  events.on("transcript", (payload) => seen.push({ family: "transcript", payload }));
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: () => false });
  const tracker = new PromptTracker({ chat, inbox: new SayInbox(), profiles });
  return { temp, chat, tracker, seen };
}

/** A fresh PromptTracker sharing the same (already-written-to) ChatService/home -- simulates the app
 * restarting: #open/#reconciled are per-instance, so this one must rediscover state purely from disk. */
function restarted(h: ReturnType<typeof harness>) {
  return new PromptTracker({ chat: h.chat, inbox: new SayInbox(), profiles: new ProfileStore(h.temp.home) });
}

function promptEntries(chat: ChatService, chatId: string) {
  return chat.transcript(chatId).readAll().filter((entry) => entry.kind === "prompt");
}

test("two 'unknown' prompts for the same bot patch the same card instead of appending a new one", () => {
  const h = harness();
  try {
    const first = parseBlockedPrompt(UNKNOWN_FORM_SCREEN)!;
    assert.equal(first.kind, "unknown");
    h.tracker.onRuntimeChange("reviewer", blocked(first), OFFLINE);
    assert.equal(promptEntries(h.chat, "reviewer").length, 1);

    // A different raw screen (a volatile line changed) -> a different signature, still "unknown".
    const second = parseBlockedPrompt(UNKNOWN_FORM_SCREEN.replace("/Users/me/Desktop/repo", "/Users/me/Desktop/repo2"))!;
    assert.equal(second.kind, "unknown");
    assert.notEqual(first.signature, second.signature);
    h.tracker.onRuntimeChange("reviewer", blocked(second), blocked(first));

    const cards = promptEntries(h.chat, "reviewer");
    assert.equal(cards.length, 1, "the transcript must still hold exactly one prompt card, not a new one per refresh");
    assert.equal(cards[0]!.status, "pending");
    assert.deepEqual((cards[0]!.prompt as { signature: string }).signature, second.signature);

    // A third, identical-to-second refresh must not rewrite the file at all.
    const path = h.chat.transcript("reviewer").path;
    const before = readFileSync(path, "utf8");
    h.tracker.onRuntimeChange("reviewer", blocked(second), blocked(second));
    assert.equal(readFileSync(path, "utf8"), before, "an unchanged refresh must not rewrite the transcript");
  } finally {
    h.temp.cleanup();
  }
});

test("an 'unknown' prompt that resolves into a real question still closes the old card and appends a new one", () => {
  const h = harness();
  try {
    const unknown = parseBlockedPrompt(UNKNOWN_FORM_SCREEN)!;
    h.tracker.onRuntimeChange("reviewer", blocked(unknown), OFFLINE);
    const question = parseBlockedPrompt(ASK_SINGLE_SCREEN)!;
    assert.equal(question.kind, "question");
    h.tracker.onRuntimeChange("reviewer", blocked(question), blocked(unknown));

    const cards = promptEntries(h.chat, "reviewer");
    assert.equal(cards.length, 2, "a kind change must close the old card and append a fresh one");
    assert.equal(cards[0]!.status, "resolved");
    assert.equal(cards[1]!.status, "pending");
  } finally {
    h.temp.cleanup();
  }
});

test("reconciling a still-blocked card left pending by a previous run does not rewrite the transcript", () => {
  const h = harness();
  try {
    const prompt = parseBlockedPrompt(ASK_SINGLE_SCREEN)!;
    // Write the pending card directly (as a previous run would have left it on disk), without going
    // through a tracker, so this one has no in-memory #open bookkeeping for it at all.
    h.chat.appendPrompt("reviewer", { id: "reviewer", name: "Reviewer" }, prompt);
    const path = h.chat.transcript("reviewer").path;
    const before = readFileSync(path, "utf8");
    const seenBefore = h.seen.length;

    const freshTracker = restarted(h);
    // The pane is still blocked on the exact same form: #reconcileOnce resumes tracking the stored
    // entry, and the same-signature branch in onRuntimeChange patches `prompt: next` where `next`
    // deep-equals what is already on disk -- this must not rewrite the file or emit an event.
    freshTracker.onRuntimeChange("reviewer", { status: "blocked", paneId: "w1:p1", workspaceId: "w1", sessionId: "s1", kind: "claude", prompt }, OFFLINE);

    assert.equal(readFileSync(path, "utf8"), before, "reconciling an unchanged pending card must not rewrite the transcript");
    assert.equal(h.seen.length, seenBefore, "reconciling an unchanged pending card must not emit a transcript 'updated' event");
    assert.equal(promptEntries(h.chat, "reviewer").length, 1);
    assert.equal(promptEntries(h.chat, "reviewer")[0]!.status, "pending");
  } finally {
    h.temp.cleanup();
  }
});

test("recording the same answer twice does not rewrite the transcript the second time", () => {
  const h = harness();
  try {
    const prompt = parseBlockedPrompt(ASK_SINGLE_SCREEN)!;
    h.tracker.onRuntimeChange("reviewer", blocked(prompt), OFFLINE);
    const answer = { action: "option" as const, key: prompt.options[0]!.key };
    h.tracker.recordAnswer("reviewer", answer, prompt);
    const path = h.chat.transcript("reviewer").path;
    const afterFirst = readFileSync(path, "utf8");
    h.tracker.recordAnswer("reviewer", answer, prompt);
    assert.equal(readFileSync(path, "utf8"), afterFirst, "recording the same answer again must not rewrite the file");
  } finally {
    h.temp.cleanup();
  }
});
