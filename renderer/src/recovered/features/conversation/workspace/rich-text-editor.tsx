import { Extension, Node as TiptapNode, mergeAttributes, type Editor, type NodeViewRenderer } from "@tiptap/core";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Link } from "@tiptap/extension-link";
import { Mention } from "@tiptap/extension-mention";
import { useEditor, EditorContent, type EditorContentProps } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Suggestion, type SuggestionMatch, type SuggestionOptions } from "@tiptap/suggestion";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { EmojiEntry } from "../cards/transcript-card/emoji-catalog";
import type { EditorMcpSuggestion, EditorMentionSuggestion, EditorSuggestionEntry, EditorWorkflowSuggestion } from "./editor-suggestion-provider";

// Immutable editor closure: e9n/hft in index-UbX-y3il.js. The package graph
// is intentionally owned by B6; this leaf only imports the released graph.
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5948307
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5691168
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4509894 (Mention listbox)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5658486 (Mention listbox)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4519947 (Emoji listbox)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5671435 (Emoji listbox)
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4527319 (Pull request listbox)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5680957 (Pull request listbox)
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5641204 (Reference a skill label)

const PROMPT_PARAGRAPH_CLASS = "sand-1gslohp sand-14l7nz5 sand-1yf7rl7 sand-at24cr sand-j3b58b";
const PROMPT_EMPTY_EDITOR_CLASS = "is-editor-empty";
const MENTION_PLUGIN_KEY = new PluginKey("sand-mention-suggestion");
const WORKFLOW_PLUGIN_KEY = new PluginKey("sand-workflow-suggestion-@");
const PR_PLUGIN_KEY = new PluginKey("sand-pr-reference-suggestion");
const EMOJI_PLUGIN_KEY = new PluginKey("sand-emoji-suggestion");
const PromptLink = Link.extend({
  inclusive() {
    return false;
  }
});

export interface PromptEditorPrReference {
  readonly prNumber: number;
  readonly title?: string | null;
  readonly url?: string | null;
}

export interface PromptEditorProviders {
  readonly mention?: {
    getMembers(query?: string): readonly EditorMentionSuggestion[];
    getWorkflows?(query?: string): readonly EditorWorkflowSuggestion[];
    getMcpReferences?(): readonly EditorMcpSuggestion[];
    getRecents?(): readonly { readonly category: string; readonly id: string }[];
    recordRecent?(value: { readonly category: string; readonly id: string }): void;
    resolveSkillIcon?(value: EditorWorkflowSuggestion | EditorMcpSuggestion): unknown;
    onOpenChange?(open: boolean): void;
    onVisibleChange?(visible: boolean): void;
  };
  readonly workflow?: {
    getWorkflows(query?: string): readonly EditorWorkflowSuggestion[];
    getActions?(): readonly EditorWorkflowSuggestion[];
    resolveSkillIcon?(value: EditorWorkflowSuggestion | EditorMcpSuggestion): unknown;
    onOpenChange?(open: boolean): void;
    onVisibleChange?(visible: boolean): void;
  };
  readonly emoji?: {
    getRows(query: string): readonly EmojiEntry[];
    getRecents?(): readonly string[];
    recordRecent?(id: string): void;
    onOpenChange?(open: boolean): void;
    onVisibleChange?(visible: boolean): void;
  };
  readonly prReference?: {
    getCandidates(): readonly PromptEditorPrReference[];
    onOpenChange?(open: boolean): void;
    onVisibleChange?(visible: boolean): void;
  };
}

export interface PromptEditorControls {
  focus(): void;
  blur(): void;
  clear(): void;
  restore(value: { readonly prompt: string; readonly richText?: string }): void;
  insertText(value: string): void;
  getJSON(): Record<string, unknown>;
}

export interface PromptEditorChange {
  readonly prompt: string;
  readonly richText?: string;
}

export interface PromptRichTextEditorProps {
  readonly prompt: string;
  readonly richText?: string;
  readonly scopeKey?: string;
  readonly clearGeneration?: number;
  readonly disabled?: boolean;
  readonly placeholder: string;
  readonly providers?: PromptEditorProviders;
  readonly canSubmit: boolean;
  onChange(change: PromptEditorChange): void;
  onSubmit(): void | Promise<void>;
  onEscape(): void;
  onPasteFiles(files: File[]): void;
  onControls?(controls: PromptEditorControls | null): void;
}

interface SuggestionRow {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  readonly kind?: string;
  readonly value: unknown;
}

export function promptEditorContent(prompt: string, richText?: string): Record<string, unknown> {
  if (richText != null && richText.length > 0) {
    try {
      const parsed: unknown = JSON.parse(richText);
      if (typeof parsed === "object" && parsed != null && (parsed as { type?: unknown }).type === "doc") return parsed as Record<string, unknown>;
    } catch {
      // Invalid persisted JSON falls back to the plain prompt, matching rVe.
    }
  }
  return {
    type: "doc",
    content: prompt.split("\n").map((line) => ({
      type: "paragraph",
      ...(line.length === 0 ? {} : { content: [{ type: "text", text: line }] })
    }))
  };
}

function linkHref(node: import("@tiptap/pm/model").Node): string | null {
  for (const mark of node.marks) if (mark.type.name === "link" && typeof mark.attrs.href === "string") return mark.attrs.href;
  return null;
}

function linkTextMatches(text: string, href: string): boolean {
  const normalized = text.trim();
  return normalized === href || normalized === `https://${href}` || normalized === `http://${href}` || normalized === `mailto:${href}`;
}

function serializePromptNode(node: import("@tiptap/pm/model").Node, parent?: import("@tiptap/pm/model").Node, index = 0): string {
  if (node.isText) {
    const text = node.text ?? "";
    const href = linkHref(node);
    if (href == null || linkTextMatches(text, href)) return text;
    const next = parent != null && index + 1 < parent.childCount ? parent.child(index + 1) : null;
    return next != null && linkHref(next) === href ? text : `${text} (${href})`;
  }
  if (node.type.name === "hardBreak") return "\n";
  const toText = node.type.spec.toText;
  if (typeof toText === "function") return toText({ node });
  let text = "";
  node.forEach((child, offset, childIndex) => {
    if (node.type.name === "doc" && childIndex > 0) text += "\n";
    text += serializePromptNode(child, node, childIndex);
    void offset;
  });
  return text;
}

export function promptEditorText(editor: Editor): string {
  return serializePromptNode(editor.state.doc);
}

function simpleNodeView(className: string, text: (node: { attrs: Record<string, unknown> }) => string): NodeViewRenderer {
  return ({ node }: { node: { attrs: Record<string, unknown> } }) => {
    const dom = document.createElement("span");
    dom.className = className;
    dom.dataset.type = className === "sand-mention" ? "mention" : className === "sand-workflow-chip" ? "workflow-reference" : "pr-reference";
    dom.textContent = text(node);
    return { dom };
  };
}

const PromptMention = Mention.extend({
  selectable: true,
  addNodeView() {
    return simpleNodeView("sand-mention", (node) => `@${String(node.attrs.label ?? node.attrs.id ?? "")}`);
  }
});

const WorkflowReference = TiptapNode.create({
  name: "workflowReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-id"), renderHTML: (attributes: Record<string, unknown>) => typeof attributes.id === "string" ? { "data-id": attributes.id } : {} },
      label: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-label"), renderHTML: (attributes: Record<string, unknown>) => typeof attributes.label === "string" ? { "data-label": attributes.label } : {} },
      iconId: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-icon-id"), renderHTML: (attributes: Record<string, unknown>) => typeof attributes.iconId === "string" ? { "data-icon-id": attributes.iconId } : {} },
      iconUrl: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-icon-url"), renderHTML: (attributes: Record<string, unknown>) => typeof attributes.iconUrl === "string" ? { "data-icon-url": attributes.iconUrl } : {} }
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="workflow-reference"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "workflow-reference", class: "sand-workflow-chip" }), `@${node.attrs.label ?? ""}`];
  },
  renderText({ node }) {
    return `@${node.attrs.label ?? ""}`;
  },
  addNodeView() {
    return simpleNodeView("sand-workflow-chip", (node) => `@${String(node.attrs.label ?? "")}`);
  }
});

const PullRequestReference = TiptapNode.create({
  name: "prReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      prNumber: { default: null, parseHTML: (element: HTMLElement) => { const value = Number(element.getAttribute("data-pr-number")); return Number.isInteger(value) && value > 0 ? value : null; }, renderHTML: (attributes: Record<string, unknown>) => typeof attributes.prNumber === "number" ? { "data-pr-number": String(attributes.prNumber) } : {} },
      title: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-title"), renderHTML: (attributes: Record<string, unknown>) => typeof attributes.title === "string" ? { "data-title": attributes.title } : {} },
      url: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("data-url"), renderHTML: (attributes: Record<string, unknown>) => typeof attributes.url === "string" ? { "data-url": attributes.url } : {} }
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="pr-reference"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "pr-reference" }), formatPullRequestReference(node.attrs.prNumber)];
  },
  renderText({ node }) {
    return formatPullRequestReference(node.attrs.prNumber);
  },
  addNodeView() {
    return simpleNodeView("sand-pr-reference", (node) => formatPullRequestReference(node.attrs.prNumber));
  }
});

function formatPullRequestReference(value: unknown): string {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? `#${number}` : "#";
}

function rowLabel(row: SuggestionRow): string {
  return row.subtitle == null ? row.label : `${row.label} — ${row.subtitle}`;
}

type SuggestionMatchInput = Parameters<NonNullable<SuggestionOptions<unknown>["findSuggestionMatch"]>>[0];

const SUGGESTION_CONTEXT_LIMIT = 200;
const SUGGESTION_QUERY_LIMIT = 50;
const SUGGESTION_PUNCTUATION = String.raw`,\+\*\?\$\@\|#{}\(\)\^\-\[\]\\!%'"~=<>:;`;

function escapeSuggestionChar(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findSpaceSuggestionMatch({ char, $position }: SuggestionMatchInput): SuggestionMatch {
  const position = $position.pos;
  const before = $position.nodeBefore?.isText ? $position.nodeBefore.text : undefined;
  if (!before) return null;
  const context = before.length > SUGGESTION_CONTEXT_LIMIT ? before.slice(-SUGGESTION_CONTEXT_LIMIT) : before;
  const contextStart = position - context.length;
  const after = $position.nodeAfter?.isText ? ($position.nodeAfter.text ?? "") : "";
  const continuationEnd = after.search(/\s/);
  const continuation = continuationEnd === -1 ? after : after.slice(0, continuationEnd);
  const searchable = context + continuation;
  const escapedChar = escapeSuggestionChar(char);
  const token = `[^${escapedChar}${SUGGESTION_PUNCTUATION}\\s]`;
  const boundary = `(?:\\.[ |$]| |[${SUGGESTION_PUNCTUATION}/]|)`;
  const multiWord = new RegExp(`(^|\\s|\\()(${escapedChar}((?:${token}${boundary}){0,120}))$`);
  const singleWord = new RegExp(`(^|\\s|\\()(${escapedChar}((?:${token}){0,${SUGGESTION_QUERY_LIMIT}}))$`);
  const match = multiWord.exec(searchable) ?? singleWord.exec(searchable);
  if (match == null || match.index == null) return null;
  const leadOffset = match.index + match[1]!.length;
  const from = contextStart + leadOffset;
  const to = from + match[2]!.length;
  if (from >= position || to < position || match[3]!.length > SUGGESTION_QUERY_LIMIT) return null;
  return { range: { from, to }, query: match[3]!, text: match[2]! };
}

export function findEmojiSuggestionMatch({ $position }: SuggestionMatchInput): SuggestionMatch {
  const position = $position.pos;
  const before = $position.nodeBefore?.isText ? $position.nodeBefore.text : undefined;
  if (!before) return null;
  const context = before.length > SUGGESTION_CONTEXT_LIMIT ? before.slice(-SUGGESTION_CONTEXT_LIMIT) : before;
  const contextStart = position - context.length;
  const after = $position.nodeAfter?.isText ? ($position.nodeAfter.text ?? "") : "";
  const continuationEnd = after.search(/[^a-z0-9_+\-]/i);
  const continuation = continuationEnd === -1 ? after : after.slice(0, continuationEnd);
  const match = new RegExp(`(^|[^\\p{L}\\p{N}_:/])(:([a-z0-9_+\\-]{0,${SUGGESTION_QUERY_LIMIT}}))$`, "iu").exec(context + continuation);
  if (match == null || match[3]!.length < 2) return null;
  const from = contextStart + match.index! + match[1]!.length;
  const to = from + match[2]!.length;
  if (from >= position || to < position) return null;
  return { range: { from, to }, query: match[3]!, text: match[2]! };
}

function collapseDomSelectionToEnd(): void {
  if (typeof window === "undefined") return;
  const selection = window.getSelection();
  if (selection != null && selection.rangeCount > 0) selection.collapseToEnd();
}

let suggestionListboxId = 0;

function createSuggestionRenderer(className: string, optionClassName: string, ariaLabel: string, onSelect: (value: unknown) => void, onOpenChange?: (open: boolean) => void, onVisibleChange?: (visible: boolean) => void, emptyMessage?: (query: string) => string | null) {
  let wrapper: HTMLDivElement | null = null;
  let element: HTMLUListElement | null = null;
  let rows: SuggestionRow[] = [];
  let activeIndex = 0;
  let query = "";
  let select = onSelect;
  let visible = false;
  let escapeDismissed = false;
  let activeEditor: Pick<Editor, "on" | "off"> | null = null;
  const onEditorBlur = () => {
    visible = false;
    if (wrapper != null) wrapper.style.display = "none";
    onVisibleChange?.(false);
    onOpenChange?.(false);
  };
  const setVisible = (next: boolean) => {
    visible = next;
    if (wrapper != null) wrapper.style.display = next ? "block" : "none";
    onVisibleChange?.(next);
  };
  const listboxId = `${className}-${++suggestionListboxId}`;
  const render = () => {
    if (element == null) return;
    element.replaceChildren();
    element.setAttribute("aria-activedescendant", rows.length === 0 ? "" : `${listboxId}-option-${activeIndex}`);
    const empty = emptyMessage?.(query) ?? null;
    if (rows.length === 0) {
      if (empty == null) return;
      const message = document.createElement("li");
      message.setAttribute("role", "status");
      message.textContent = empty;
      element.append(message);
      return;
    }
    rows.forEach((row, index) => {
      const option = document.createElement("li");
      option.className = optionClassName;
      option.setAttribute("role", "presentation");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${optionClassName}-button`;
      button.id = `${listboxId}-option-${index}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === activeIndex));
      button.textContent = rowLabel(row);
      const activate = (event: MouseEvent) => {
        event.preventDefault();
        select(row.value);
        collapseDomSelectionToEnd();
      };
      button.addEventListener("mousedown", activate);
      button.addEventListener("click", (event) => { if (event.detail === 0) select(row.value); });
      button.addEventListener("pointermove", () => { activeIndex = index; render(); });
      option.append(button);
      element?.append(option);
    });
  };
  const dismiss = () => {
    setVisible(false);
    wrapper?.remove();
    wrapper = null;
    element = null;
    onOpenChange?.(false);
  };
  return {
    onStart(props: { items: readonly SuggestionRow[]; query?: string; command?: (value: unknown) => void; clientRect?: (() => DOMRect | null) | null; editor?: Pick<Editor, "on" | "off"> }) {
      rows = [...props.items];
      query = props.query ?? "";
      select = props.command ?? onSelect;
      activeIndex = 0;
      escapeDismissed = false;
      activeEditor = props.editor ?? null;
      activeEditor?.on("blur", onEditorBlur);
      wrapper = document.createElement("div");
      wrapper.style.position = "fixed";
      wrapper.style.top = "0";
      wrapper.style.left = "0";
      wrapper.style.zIndex = "2000";
      element = document.createElement("ul");
      element.className = className;
      element.setAttribute("role", "listbox");
      element.setAttribute("aria-label", ariaLabel);
      element.id = listboxId;
      wrapper.append(element);
      document.body.append(wrapper);
      render();
      const rect = props.clientRect?.();
      if (rect != null && wrapper != null) {
        wrapper.style.left = `${Math.round(rect.left)}px`;
        wrapper.style.top = `${Math.round(rect.bottom)}px`;
      }
      setVisible(true);
      onOpenChange?.(rows.length > 0);
    },
    onUpdate(props: { items: readonly SuggestionRow[]; query?: string; command?: (value: unknown) => void; clientRect?: (() => DOMRect | null) | null; editor?: Pick<Editor, "on" | "off"> }) {
      rows = [...props.items];
      query = props.query ?? query;
      select = props.command ?? select;
      activeIndex = Math.min(activeIndex, Math.max(0, rows.length - 1));
      render();
      const rect = props.clientRect?.();
      if (rect != null && wrapper != null) {
        wrapper.style.left = `${Math.round(rect.left)}px`;
        wrapper.style.top = `${Math.round(rect.bottom)}px`;
      }
      if (escapeDismissed) {
        setVisible(false);
        onOpenChange?.(false);
        return;
      }
      setVisible(true);
      onOpenChange?.(rows.length > 0);
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === "ArrowDown" || props.event.key === "ArrowUp") {
        props.event.preventDefault();
        const delta = props.event.key === "ArrowDown" ? 1 : -1;
        activeIndex = rows.length === 0 ? 0 : (activeIndex + delta + rows.length) % rows.length;
        render();
        return true;
      }
      if (props.event.key === "Enter" || props.event.key === "Tab") {
        if (rows.length === 0) return false;
        props.event.preventDefault();
        select(rows[activeIndex]!.value);
        collapseDomSelectionToEnd();
        return true;
      }
      if (props.event.key === "Escape") {
        props.event.stopPropagation();
        escapeDismissed = true;
        dismiss();
        return false;
      }
      return false;
    },
    onExit() {
      activeEditor?.off("blur", onEditorBlur);
      activeEditor = null;
      dismiss();
    }
  };
}

function mentionSuggestion(providers: PromptEditorProviders["mention"]): Omit<SuggestionOptions<EditorSuggestionEntry>, "editor"> {
  return {
    char: "@",
    pluginKey: MENTION_PLUGIN_KEY,
    allowSpaces: true,
    allowedPrefixes: null,
    findSuggestionMatch: findSpaceSuggestionMatch,
    items: ({ query }) => {
      const members = providers?.getMembers(query) ?? [];
      const workflows = providers?.getWorkflows?.(query).filter((entry) => entry.trigger != null) ?? [];
      const mcpReferences = providers?.getMcpReferences?.() ?? [];
      return [...members, ...workflows, ...mcpReferences] as EditorSuggestionEntry[];
    },
    command: ({ editor, range, props }) => {
      const entry = props as EditorSuggestionEntry;
      providers?.recordRecent?.({ category: entry.category, id: entry.id });
      if (entry.insert.type === "mention") {
        editor.chain().focus().insertContentAt(range, [{ type: "mention", attrs: { id: entry.insert.id, label: entry.insert.label } }, { type: "text", text: " " }]).run();
      } else {
        editor.chain().focus().insertContentAt(range, [{ type: "workflowReference", attrs: { id: entry.insert.id, label: entry.insert.label, iconId: entry.insert.iconId ?? null, iconUrl: entry.insert.iconUrl ?? null } }, { type: "text", text: " " }]).run();
      }
      collapseDomSelectionToEnd();
    },
    render: () => {
      let renderer: ReturnType<typeof createSuggestionRenderer> | null = null;
      return {
        onStart: (props) => {
          renderer = createSuggestionRenderer("sand-mention-listbox", "sand-mention-option", "Mention", (value) => props.command(value), providers?.onOpenChange, providers?.onVisibleChange, (query) => query.trim().length > 0 ? `No matches for "${query.trim()}"` : "Nothing to mention yet");
          renderer.onStart({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: entry.id, label: entry.label, subtitle: entry.subtitle, value: entry })) });
        },
        onUpdate: (props) => renderer?.onUpdate({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: entry.id, label: entry.label, subtitle: entry.subtitle, value: entry })) }),
        onKeyDown: (props) => renderer?.onKeyDown(props) ?? false,
        onExit: () => renderer?.onExit()
      };
    }
  };
}

function workflowSuggestion(providers: PromptEditorProviders["workflow"]): Omit<SuggestionOptions<EditorWorkflowSuggestion>, "editor"> {
  return {
    char: "/",
    pluginKey: WORKFLOW_PLUGIN_KEY,
    allowSpaces: true,
    allowedPrefixes: null,
    findSuggestionMatch: findSpaceSuggestionMatch,
    items: ({ query }) => [...(providers?.getWorkflows(query) ?? []), ...(providers?.getActions?.() ?? [])].filter((entry) => entry.trigger == null),
    command: ({ editor, range, props }) => {
      const entry = props as EditorWorkflowSuggestion;
      editor.chain().focus().insertContentAt(range, [{ type: "workflowReference", attrs: { id: entry.id, label: entry.label, iconId: entry.insert.iconId ?? null, iconUrl: entry.insert.iconUrl ?? null } }, { type: "text", text: " " }]).run();
      collapseDomSelectionToEnd();
    },
    render: () => {
      let renderer: ReturnType<typeof createSuggestionRenderer> | null = null;
      return {
        onStart: (props) => {
          renderer = createSuggestionRenderer("sand-workflow-listbox", "sand-workflow-option", "Reference a skill", (value) => props.command(value), providers?.onOpenChange, providers?.onVisibleChange, (query) => query.trim().length > 0 ? `No matches for "${query.trim()}"` : "Nothing to reference yet");
          renderer.onStart({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: entry.id, label: entry.label, subtitle: entry.subtitle, value: entry })) });
        },
        onUpdate: (props) => renderer?.onUpdate({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: entry.id, label: entry.label, subtitle: entry.subtitle, value: entry })) }),
        onKeyDown: (props) => renderer?.onKeyDown(props) ?? false,
        onExit: () => renderer?.onExit()
      };
    }
  };
}

function prSuggestion(providers: PromptEditorProviders["prReference"]): Omit<SuggestionOptions<PromptEditorPrReference>, "editor"> {
  return {
    char: "#",
    pluginKey: PR_PLUGIN_KEY,
    allowSpaces: true,
    allowedPrefixes: null,
    findSuggestionMatch: findSpaceSuggestionMatch,
    items: ({ query }) => (providers?.getCandidates() ?? []).filter((candidate) => String(candidate.prNumber).includes(query.trim()) || (candidate.title ?? "").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8),
    command: ({ editor, range, props }) => {
      const candidate = props as PromptEditorPrReference;
      editor.chain().focus().insertContentAt(range, [{ type: "prReference", attrs: candidate }, { type: "text", text: " " }]).run();
      collapseDomSelectionToEnd();
    },
    render: () => {
      let renderer: ReturnType<typeof createSuggestionRenderer> | null = null;
      return {
        onStart: (props) => {
          renderer = createSuggestionRenderer("sand-pr-listbox", "sand-pr-option", "Pull request", (value) => props.command(value), providers?.onOpenChange, providers?.onVisibleChange);
          renderer.onStart({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: String(entry.prNumber), label: `#${entry.prNumber}`, subtitle: entry.title ?? undefined, value: entry })) });
        },
        onUpdate: (props) => renderer?.onUpdate({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: String(entry.prNumber), label: `#${entry.prNumber}`, subtitle: entry.title ?? undefined, value: entry })) }),
        onKeyDown: (props) => renderer?.onKeyDown(props) ?? false,
        onExit: () => renderer?.onExit()
      };
    }
  };
}

function emojiExtension(providers: PromptEditorProviders["emoji"]): Extension {
  return Extension.create({
    name: "sandEmojiSuggestion",
    addProseMirrorPlugins() {
      return [Suggestion({
        editor: this.editor,
        char: ":",
        pluginKey: EMOJI_PLUGIN_KEY,
        allowSpaces: false,
        allowedPrefixes: null,
        findSuggestionMatch: findEmojiSuggestionMatch,
        items: ({ query }) => providers?.getRows(query).slice(0, 96) ?? [],
        command: ({ editor, range, props }) => {
          const entry = props as EmojiEntry;
          providers?.recordRecent?.(entry.id);
          editor.chain().focus().insertContentAt(range, `${entry.native} `).run();
          collapseDomSelectionToEnd();
        },
        render: () => {
          let renderer: ReturnType<typeof createSuggestionRenderer> | null = null;
          return {
            onStart: (props) => {
              renderer = createSuggestionRenderer("sand-emoji-listbox", "sand-emoji-option", "Emoji", (value) => props.command(value), providers?.onOpenChange, providers?.onVisibleChange);
              renderer.onStart({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: entry.id, label: `${entry.native} ${entry.name}`, value: entry })) });
            },
            onUpdate: (props) => renderer?.onUpdate({ editor: props.editor, query: props.query, command: props.command, clientRect: props.clientRect, items: props.items.map((entry) => ({ id: entry.id, label: `${entry.native} ${entry.name}`, value: entry })) }),
            onKeyDown: (props) => renderer?.onKeyDown(props) ?? false,
            onExit: () => renderer?.onExit()
          };
        }
      })];
    }
  });
}

const ScrollCaretIntoView = Extension.create({
  name: "sandScrollCaretIntoView",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("sand-scroll-caret-into-view"),
      appendTransaction(transactions, _oldState, state) {
        return transactions.some((transaction) => transaction.docChanged) && state.selection.empty && !transactions.some((transaction) => transaction.scrolledIntoView)
          ? state.tr.scrollIntoView()
          : null;
      }
    })];
  }
});

function macLineMotionAction(event: KeyboardEvent, isMac: boolean): { alter: "extend" | "move"; direction: "forward" | "backward" } | null {
  if (!isMac || !event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key !== "a" && key !== "e") return null;
  return { alter: event.shiftKey ? "extend" : "move", direction: key === "e" ? "forward" : "backward" };
}

function lineBoundary(parent: import("@tiptap/pm/model").Node, offset: number, direction: "forward" | "backward"): number {
  const hardBreak = parent.type.schema.nodes.hardBreak;
  if (direction === "backward") {
    let boundary = 0;
    parent.forEach((node, position) => {
      if (hardBreak != null && node.type === hardBreak && position + node.nodeSize <= offset) boundary = position + node.nodeSize;
    });
    return boundary;
  }
  let boundary = parent.content.size;
  let found = false;
  parent.forEach((node, position) => {
    if (!found && hardBreak != null && node.type === hardBreak && position >= offset) {
      boundary = position;
      found = true;
    }
  });
  return boundary;
}

const MacEmacsLineMotion = Extension.create({
  name: "sandMacEmacsLineMotion",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("sand-mac-emacs-line-motion"),
      props: {
        handleKeyDown: (view, event) => {
          const action = macLineMotionAction(event, typeof navigator !== "undefined" && /mac/i.test(navigator.platform));
          if (action == null) return false;
          const { state } = view;
          const head = state.selection.$head;
          if (!head.parent.isTextblock) return false;
          const offset = lineBoundary(head.parent, head.parentOffset, action.direction);
          const position = head.start() + offset;
          const anchor = action.alter === "extend" ? state.selection.anchor : position;
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, anchor, position)).scrollIntoView());
          return true;
        }
      }
    })];
  }
});

export function createPromptEditorExtensions(placeholder: string, providers?: PromptEditorProviders) {
  const mention = providers?.mention;
  const workflow = providers?.workflow;
  const prReference = providers?.prReference;
  const workflowNode = WorkflowReference.extend({
    addProseMirrorPlugins() {
      return workflow == null ? [] : [Suggestion({ editor: this.editor, ...workflowSuggestion(workflow) })];
    }
  });
  const prNode = PullRequestReference.extend({
    addProseMirrorPlugins() {
      return prReference == null ? [] : [Suggestion({ editor: this.editor, ...prSuggestion(prReference) })];
    }
  });
  const extensions = [
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      link: false,
      orderedList: false,
      paragraph: { HTMLAttributes: { class: PROMPT_PARAGRAPH_CLASS } },
      strike: false,
      undoRedo: { newGroupDelay: 100 }
    }),
    PromptLink.configure({ openOnClick: false, defaultProtocol: "https" }),
    ScrollCaretIntoView,
    MacEmacsLineMotion,
    Placeholder.configure({ placeholder, emptyEditorClass: PROMPT_EMPTY_EDITOR_CLASS, showOnlyWhenEditable: false }),
    PromptMention.configure({
      HTMLAttributes: { class: "sand-mention" },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id ?? ""}`,
      renderHTML: ({ options, node }) => ["span", mergeAttributes({ "data-type": "mention" }, options.HTMLAttributes), `@${node.attrs.label ?? node.attrs.id ?? ""}`],
      suggestion: mentionSuggestion(mention)
    }),
    workflowNode,
    prNode
  ];
  if (providers?.emoji != null) extensions.push(emojiExtension(providers.emoji));
  return extensions;
}

function filesFromClipboard(event: globalThis.ClipboardEvent): File[] {
  const files: File[] = [];
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file != null) files.push(file);
  }
  return files;
}

function isPromptEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

// Immutable r9n global clipboard bridge: when focus is outside the prompt,
// Cmd/Ctrl+V restores editor focus and document paste inserts text or stages
// files; focused editor paste remains owned by ProseMirror's native path.
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4742034
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5953061

export function PromptRichTextEditor({ prompt, richText, scopeKey = "", clearGeneration = 0, disabled = false, placeholder, providers, canSubmit, onChange, onSubmit, onEscape, onPasteFiles, onControls }: PromptRichTextEditorProps) {
  const callbacks = useRef({ canSubmit, onChange, onSubmit, onEscape, onPasteFiles });
  callbacks.current = { canSubmit, onChange, onSubmit, onEscape, onPasteFiles };
  const extensions = useMemo(() => createPromptEditorExtensions(placeholder, providers), [placeholder, providers]);
  const initialContent = useMemo(() => promptEditorContent(prompt, richText), []);
  const previousExternalContent = useRef({ prompt, richText });
  const clearFence = useRef<{ generation: number; before: string } | null>(null);
  const scopeFence = useRef<{ scopeKey: string; before: string } | null>(null);
  const observedScopeKey = useRef(scopeKey);
  const observedClearGeneration = useRef(clearGeneration);
  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: false,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "sand-prompt-field",
        spellcheck: "false",
        "aria-label": "Prompt",
        "aria-multiline": "true",
        role: "textbox"
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing) return false;
        if (event.key === "Escape") {
          event.preventDefault();
          callbacks.current.onEscape();
          return true;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          if (callbacks.current.canSubmit) void callbacks.current.onSubmit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = filesFromClipboard(event);
        if (files.length === 0) return false;
        event.preventDefault();
        callbacks.current.onPasteFiles(files);
        return true;
      }
    },
    onUpdate: ({ editor: current, transaction }) => {
      const fence = clearFence.current;
      if (fence != null) {
        if (fence.generation !== observedClearGeneration.current) {
          clearFence.current = null;
        } else {
          // A queued pre-clear transaction can run after the accepted send has
          // already cleared the persisted draft. Do not let that old document
          // resurrect it; a document that differs from the captured value is a
          // genuine post-clear edit and remains user-owned.
          if (JSON.stringify(current.getJSON()) === fence.before) return;
          if (transaction.getMeta("sand-field-cleared") === true) return;
          clearFence.current = null;
        }
      }
      const scopedFence = scopeFence.current;
      if (scopedFence != null) {
        if (JSON.stringify(current.getJSON()) === scopedFence.before) return;
        if (transaction.getMeta("sand-field-cleared") === true) return;
        if (transaction.getMeta("uiEvent") == null) return;
        scopeFence.current = null;
      }
      const text = promptEditorText(current);
      const json = current.isEmpty ? undefined : JSON.stringify(current.getJSON());
      callbacks.current.onChange({ prompt: text, ...(json == null ? {} : { richText: json }) });
    }
  });

  // This runs during render so the fence is installed before the child
  // editor's external-content effect can observe the accepted empty draft.
  if (observedClearGeneration.current !== clearGeneration) {
    observedClearGeneration.current = clearGeneration;
    if (editor != null) clearFence.current = { generation: clearGeneration, before: JSON.stringify(editor.getJSON()) };
  }
  if (observedScopeKey.current !== scopeKey) {
    observedScopeKey.current = scopeKey;
    clearFence.current = null;
    if (editor != null) scopeFence.current = { scopeKey, before: JSON.stringify(editor.getJSON()) };
  }

  useEffect(() => {
    if (editor == null) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (editor == null || disabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "v") return;
      if (isPromptEditingTarget(event.target) || isPromptEditingTarget(document.activeElement)) return;
      editor.commands.focus("end");
      editor.view.focus();
    };
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isPromptEditingTarget(event.target) || isPromptEditingTarget(document.activeElement)) return;
      const files = filesFromClipboard(event);
      if (files.length > 0) {
        event.preventDefault();
        onPasteFiles(files);
        return;
      }
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (text.length === 0) return;
      event.preventDefault();
      editor.commands.focus("end");
      editor.view.pasteText(text, event);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("paste", onPaste);
    };
  }, [disabled, editor, onPasteFiles]);

  useEffect(() => {
    if (editor == null) return;
    const previous = previousExternalContent.current;
    previousExternalContent.current = { prompt, richText };
    const expected = promptEditorContent(prompt, richText);
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(expected)) return;
    const wasPopulated = previous.prompt.length > 0 || (previous.richText?.length ?? 0) > 0;
    const isEmpty = prompt.length === 0 && (richText == null || richText.length === 0);
    if (wasPopulated && isEmpty) {
      clearFence.current = { generation: clearGeneration, before: JSON.stringify(editor.getJSON()) };
      editor.chain().command(({ tr }) => {
        tr.setMeta("sand-field-cleared", true);
        return true;
      }).clearContent(false).focus("end").run();
      return;
    }
    editor.commands.setContent(expected, { emitUpdate: false });
    editor.commands.focus("end");
  }, [clearGeneration, editor, prompt, richText, scopeKey]);

  useEffect(() => {
    if (editor == null) return;
    const controls: PromptEditorControls = {
      focus: () => editor.commands.focus("end"),
      blur: () => editor.view.dom.blur(),
      clear: () => {
        clearFence.current = { generation: clearGeneration, before: JSON.stringify(editor.getJSON()) };
        editor.chain().command(({ tr }) => { tr.setMeta("sand-field-cleared", true); return true; }).clearContent(false).focus("end").run();
      },
      restore: (value) => { editor.commands.setContent(promptEditorContent(value.prompt, value.richText), { emitUpdate: false }); editor.commands.focus("end"); },
      insertText: (value) => {
        const before = editor.state.doc.textBetween(0, editor.state.selection.from, "\n");
        const needsSpace = before.length > 0 && !/\s$/.test(before) && !/^\s/.test(value);
        editor.chain().focus().insertContent(`${needsSpace ? " " : ""}${value}`).run();
      },
      getJSON: () => editor.getJSON() as Record<string, unknown>
    };
    onControls?.(controls);
    return () => onControls?.(null);
  }, [editor, onControls]);

  const contentProps: EditorContentProps = { editor };
  return <EditorContent {...contentProps} />;
}

export type PromptEditorRef = RefObject<PromptEditorControls | null>;
