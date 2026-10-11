import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hostReferenceFiles, sweepStagedAttachments } from "../src/staged-attachment-sweep.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

test("sweepStagedAttachments: deletes only old, unreferenced files, and only inside staged/", async () => {
  const temp = makeTempHome();
  try {
    const stagedDir = join(temp.home, "staged");
    mkdirSync(stagedDir, { recursive: true });
    const orphan = join(stagedDir, "11111111-orphan.png");
    const referencedByTranscript = join(stagedDir, "22222222-in-transcript.png");
    const referencedBySettings = join(stagedDir, "33333333-in-draft.png");
    for (const path of [orphan, referencedByTranscript, referencedBySettings]) writeFileSync(path, "x");
    const sibling = join(temp.home, "not-staged.png"); // outside staged/ -- must never be touched
    writeFileSync(sibling, "x");

    const botsDir = join(temp.home, "bots", "bot-1");
    mkdirSync(botsDir, { recursive: true });
    writeFileSync(join(botsDir, "transcript.jsonl"), `{"content":"see attached\\n\\n(attached: ${referencedByTranscript})"}\n`);
    const settingsPath = join(temp.home, "herdr-bot-desktop.json");
    writeFileSync(settingsPath, JSON.stringify({ "persist:composer-draft:agent-1": JSON.stringify({ attachments: [{ path: referencedBySettings }] }) }));
    const referenceFiles = [...(await hostReferenceFiles(temp.home)), settingsPath];

    // Freshly created: nothing is more than 7 days old yet, so nothing is swept regardless of reference.
    const tooSoon = await sweepStagedAttachments({ stagedDir, referenceFiles, now: Date.now });
    assert.deepEqual(tooSoon.removed, []);

    // 8 days later: the orphan is swept, both referenced files survive, and the sibling outside
    // staged/ is never touched.
    const eightDaysLater = () => Date.now() + WEEK_MS + 24 * 60 * 60 * 1000;
    const swept = await sweepStagedAttachments({ stagedDir, referenceFiles, now: eightDaysLater });
    assert.deepEqual(swept.removed, [orphan]);
    const remaining = new Set(readdirSync(stagedDir));
    assert.equal(remaining.has("11111111-orphan.png"), false);
    assert.equal(remaining.has("22222222-in-transcript.png"), true);
    assert.equal(remaining.has("33333333-in-draft.png"), true);
    assert.equal(readdirSync(temp.home).includes("not-staged.png"), true);
  } finally {
    temp.cleanup();
  }
});

test("sweepStagedAttachments: a missing staged directory is a no-op, not an error", async () => {
  const temp = makeTempHome();
  try {
    const result = await sweepStagedAttachments({ stagedDir: join(temp.home, "staged"), referenceFiles: [], now: Date.now });
    assert.deepEqual(result.removed, []);
  } finally {
    temp.cleanup();
  }
});

test("hostReferenceFiles: lists every bot's and room's transcript, skipping missing groups", async () => {
  const temp = makeTempHome();
  try {
    mkdirSync(join(temp.home, "bots", "a"), { recursive: true });
    mkdirSync(join(temp.home, "rooms", "r"), { recursive: true });
    const files = await hostReferenceFiles(temp.home);
    assert.deepEqual(new Set(files), new Set([
      join(temp.home, "bots", "a", "transcript.jsonl"),
      join(temp.home, "rooms", "r", "transcript.jsonl"),
    ]));
  } finally {
    temp.cleanup();
  }
});
