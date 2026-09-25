import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getSchema } from "@tiptap/core";
import { Window } from "happy-dom";
import {
  prioritizeEveryone,
  projectMentionMembers,
  computeMentionCandidates,
  selectEditorSuggestion,
} from "../src/recovered/features/conversation/workspace/editor-suggestion-provider.ts";

test("mention chip shows the current avatar and a tinted label", async () => {
  const server = await createServer({ configFile: "renderer/vite.config.ts", server: { hmr: false, middlewareMode: true } });
  try {
    const { MentionChip } = await server.ssrLoadModule("/src/recovered/features/conversation/workspace/mention-chip.tsx");
    const html = renderToStaticMarkup(createElement(MentionChip, {
      id: "reviewer", label: "Reviewer", identity: { color: "blue", shape: "circle", dataUrl: null },
    }));
    assert.match(html, /class="sand-mention"/);
    assert.match(html, /sand-agent-avatar/);
    assert.match(html, /@Reviewer/);
    assert.match(html, /--mention-color:/);
    assert.match(html, /data-size="xs"/);
    const missingIdentity = createElement(MentionChip, { id: "removed-agent", label: "Former teammate", identity: null });
    const fallback = renderToStaticMarkup(missingIdentity);
    assert.equal(renderToStaticMarkup(missingIdentity), fallback);
    assert.match(fallback, /sand-agent-avatar/);
    assert.match(fallback, /@Former teammate/);
  } finally {
    await server.close();
  }
});

test("read-only transcript resolves mention avatars from the current roster", async () => {
  const server = await createServer({ configFile: "renderer/vite.config.ts", server: { middlewareMode: true } });
  try {
    const { ConversationTranscript } = await server.ssrLoadModule("/src/recovered/features/conversation/workspace/transcript.tsx");
    const entry = {
      kind: "message", id: "m1", role: "user", author: "You", text: "@Reviewer", timestampMs: 0,
      richText: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "reviewer", label: "Reviewer" } }] }] }),
    };
    const html = renderToStaticMarkup(createElement(ConversationTranscript, {
      entries: [entry],
      resolveMentionIdentity: (id: string) => id === "reviewer" ? { color: "blue", shape: "circle", dataUrl: "data:image/png;base64,AAA" } : null,
    }));
    assert.match(html, /data-avatar-kind="photo"/);
    assert.match(html, /@Reviewer/);
    const removed = renderToStaticMarkup(createElement(ConversationTranscript, { entries: [entry], resolveMentionIdentity: () => null }));
    assert.match(removed, /sand-agent-avatar/);
    assert.doesNotMatch(removed, /data-avatar-kind="photo"/);
  } finally {
    await server.close();
  }
});

test("editor mention JSON keeps only stable identity and label", async () => {
  const server = await createServer({ configFile: "renderer/vite.config.ts", server: { middlewareMode: true } });
  try {
    const { createPromptEditorExtensions } = await server.ssrLoadModule("/src/recovered/features/conversation/workspace/rich-text-editor.tsx");
    const schema = getSchema(createPromptEditorExtensions("", { mention: { getMembers: () => [], resolveMentionIdentity: () => ({ color: "blue", shape: "circle", dataUrl: "data:image/png;base64,AAA" }) } }));
    const mention = schema.nodes.mention.create({ id: "reviewer", label: "Reviewer" });
    assert.deepEqual(JSON.parse(JSON.stringify(mention.toJSON())), { type: "mention", attrs: { id: "reviewer", label: "Reviewer" } });
  } finally {
    await server.close();
  }
});

test("Backspace replaces a mention with its @ trigger without persisting trigger metadata", async () => {
  const browser = new Window({ url: "http://localhost" });
  const previous = { window: globalThis.window, document: globalThis.document, KeyboardEvent: globalThis.KeyboardEvent };
  Object.assign(globalThis, { window: browser, document: browser.document, KeyboardEvent: browser.KeyboardEvent });
  const server = await createServer({ configFile: "renderer/vite.config.ts", server: { middlewareMode: true } });
  try {
    const { createPromptEditorExtensions } = await server.ssrLoadModule("/src/recovered/features/conversation/workspace/rich-text-editor.tsx");
    const { Editor } = await import("@tiptap/core");
    const editor = new Editor({
      extensions: createPromptEditorExtensions(""),
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "reviewer", label: "Reviewer" } }] }] },
      injectCSS: false,
    });
    try {
      editor.commands.setTextSelection(2);
      editor.commands.keyboardShortcut("Backspace");
      assert.deepEqual(JSON.parse(JSON.stringify(editor.getJSON())), { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "@" }] }] });
    } finally {
      editor.destroy();
    }
  } finally {
    await server.close();
    Object.assign(globalThis, previous);
    await browser.happyDOM.abort();
  }
});

test("everyone stays first after recency ranking", () => {
  assert.deepEqual(prioritizeEveryone([{ id: "a" }, { id: "__everyone__" }, { id: "b" }])
    .map(item => item.id), ["__everyone__", "a", "b"]);
});

test("prioritizeEveryone is a no-op when everyone is absent", () => {
  assert.deepEqual(prioritizeEveryone([{ id: "a" }, { id: "b" }]).map(item => item.id), ["a", "b"]);
});

test("projectMentionMembers carries avatar data, not just the name", () => {
  const [entry] = projectMentionMembers([
    { id: "bot-1", name: "Fixer", avatarDataUrl: "data:image/png;base64,AAA", avatarShape: "cloud", avatarColor: "#123456" },
  ], false);
  assert.equal(entry.icon.type, "agent");
  assert.equal(entry.icon.agentId, "bot-1");
  assert.equal(entry.icon.name, "Fixer");
  assert.equal(entry.icon.dataUrl, "data:image/png;base64,AAA");
  assert.equal(entry.icon.shape, "cloud");
  assert.equal(entry.icon.color, "#123456");
});

test("projectMentionMembers avatar fields default to null when absent", () => {
  const [entry] = projectMentionMembers([{ id: "bot-1", name: "Fixer" }], false);
  assert.equal(entry.icon.dataUrl, null);
  assert.equal(entry.icon.shape, null);
  assert.equal(entry.icon.color, null);
});

test("everyone entry always inserts as plain 'everyone', regardless of its display label", () => {
  const [everyone] = projectMentionMembers([
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ], true);
  assert.equal(everyone.id, "__everyone__");
  assert.equal(everyone.insert.type, "mention");
  assert.equal(everyone.insert.id, "__everyone__");
  assert.equal(everyone.insert.label, "everyone");
  // Search terms 전체/everyone/all must all resolve to the everyone entry.
  assert.ok(everyone.keywords.includes("전체"));
  assert.ok(everyone.keywords.includes("everyone"));
  assert.ok(everyone.keywords.includes("all"));
});

test("everyone appears even for a single-member scope (DM), matching the actual delivery of one bot", () => {
  const [everyone, ...rest] = projectMentionMembers([{ id: "solo", name: "Solo" }], true);
  assert.equal(everyone.id, "__everyone__");
  assert.deepEqual(rest.map((entry) => entry.id), ["solo"]);
});

test("everyone's icon is a fixed generic mark, never composited from the scope's actual members", () => {
  const group = projectMentionMembers([{ id: "m1", name: "M1" }, { id: "m2", name: "M2" }], true);
  assert.deepEqual(group[0]!.icon, { type: "everyone" });

  const dm = projectMentionMembers([{ id: "solo", name: "Solo" }], true);
  assert.deepEqual(dm[0]!.icon, { type: "everyone" });
});

test("everyone is omitted for an empty roster (0-member guidance case)", () => {
  assert.deepEqual(projectMentionMembers([], true), []);
});

test("duplicate display names with different ids are both kept, distinguished by id", () => {
  const entries = projectMentionMembers([
    { id: "bot-a", name: "Fixer" },
    { id: "bot-b", name: "Fixer" },
  ], false);
  assert.deepEqual(entries.map((entry) => entry.id), ["bot-a", "bot-b"]);
  assert.deepEqual(entries.map((entry) => entry.insert.id), ["bot-a", "bot-b"]);
});

test("computeMentionCandidates: group scope only offers current members plus everyone", () => {
  const roster = [
    { id: "m1", name: "Member One" },
    { id: "m2", name: "Member Two" },
    { id: "outsider", name: "Outsider" },
    { id: "room-1", name: "Room", isGroup: true },
  ];
  const result = computeMentionCandidates({ isGroup: true, id: "room-1", memberIds: ["m1", "m2"] }, roster, "");
  assert.deepEqual(result.map((entry) => entry.id), ["__everyone__", "m1", "m2"]);
});

test("computeMentionCandidates: DM scope is limited to the counterpart bot plus everyone", () => {
  const roster = [
    { id: "bot-1", name: "Bot One" },
    { id: "bot-2", name: "Bot Two" },
  ];
  const result = computeMentionCandidates({ isGroup: false, id: "bot-1", memberIds: [] }, roster, "");
  assert.deepEqual(result.map((entry) => entry.id), ["__everyone__", "bot-1"]);
});

test("computeMentionCandidates excludes non-member and non-group bots", () => {
  const roster = [
    { id: "m1", name: "Member One" },
    { id: "not-a-member", name: "Not A Member" },
    { id: "a-group", name: "A Group", isGroup: true },
  ];
  const result = computeMentionCandidates({ isGroup: true, id: "room-1", memberIds: ["m1"] }, roster, "");
  assert.deepEqual(result.map((entry) => entry.id), ["__everyone__", "m1"]);
});

test("computeMentionCandidates: non-empty search shows matches only, with everyone staying on top when it matches", () => {
  const roster = [
    { id: "m1", name: "Fixer" },
    { id: "m2", name: "Reviewer" },
  ];
  const scope = { isGroup: true, id: "room-1", memberIds: ["m1", "m2"] };
  assert.deepEqual(computeMentionCandidates(scope, roster, "fix").map((entry) => entry.id), ["m1"]);
  assert.deepEqual(computeMentionCandidates(scope, roster, "everyone").map((entry) => entry.id), ["__everyone__"]);
  assert.deepEqual(computeMentionCandidates(scope, roster, "전체").map((entry) => entry.id), ["__everyone__"]);
  assert.deepEqual(computeMentionCandidates(scope, roster, "all").map((entry) => entry.id), ["__everyone__"]);
});

test("computeMentionCandidates: an empty group roster yields no candidates (0-member guidance)", () => {
  const result = computeMentionCandidates({ isGroup: true, id: "room-1", memberIds: [] }, [
    { id: "outsider", name: "Outsider" },
  ], "");
  assert.deepEqual(result, []);
});

test("existing keyboard behaviour (ArrowDown/ArrowUp/Enter/Escape) is unchanged", () => {
  const entries = [
    { id: "__everyone__", category: "assistants" as const, key: "a", label: "everyone", keywords: [], icon: { type: "everyone" as const }, isGroup: false, insert: { type: "mention" as const, id: "__everyone__", label: "everyone" } },
    { id: "m1", category: "assistants" as const, key: "b", label: "Fixer", keywords: [], icon: { type: "agent" as const }, isGroup: false, insert: { type: "mention" as const, id: "m1", label: "Fixer" } },
  ];
  assert.deepEqual(selectEditorSuggestion(entries, 0, "ArrowDown"), { kind: "move", activeIndex: 1 });
  assert.deepEqual(selectEditorSuggestion(entries, 1, "ArrowDown"), { kind: "move", activeIndex: 0 });
  assert.deepEqual(selectEditorSuggestion(entries, 0, "Enter"), { kind: "select", entry: entries[0] });
  assert.deepEqual(selectEditorSuggestion(entries, 0, "Escape"), { kind: "dismiss" });
  assert.deepEqual(selectEditorSuggestion([], 0, "Escape"), { kind: "dismiss" });
});
