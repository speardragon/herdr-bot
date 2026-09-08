import type { EmojiCatalogStore } from "../cards/transcript-card/emoji-catalog";
import {
  createEditorSuggestionController,
  type EditorSuggestionCategory,
  type EditorMcpSuggestion,
  type EditorMentionSuggestion,
  type EditorSuggestionEntry,
  type EditorSuggestionController,
  type EditorSuggestionSource,
  type EditorWorkflowSuggestion,
} from "./editor-suggestion-provider";
import type { PromptEditorProviders } from "./rich-text-editor";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4508081
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4511230
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=4498307
// @evidence recovered/frontend/app/assets/index-UbX-y3il.js#byteOffset=5643283
// The mounted composer only has the released mention/workflow/emoji producer
// families. PR, MCP, and app actions intentionally have no current producer.

export interface EditorSuggestionRecentsState {
  get(): {
    readonly mentionRecents: readonly { readonly category: EditorSuggestionCategory; readonly id: string }[];
    readonly emojiRecents: readonly string[];
  };
  recordEmojiRecent?(emoji: string): void;
}

export interface ComposerEditorSuggestionAdapter {
  readonly controller: EditorSuggestionController;
  readonly providers: PromptEditorProviders;
  setScope(scope: { readonly accountKey: string | null; readonly agentId: string | null; readonly allowEveryone?: boolean }): void;
  refresh(): Promise<void>;
  dispose(): void;
}

function snapshotEntries(controller: EditorSuggestionController): readonly EditorSuggestionEntry[] {
  return controller.getSnapshot().entries;
}

/** Resolves only icon fields already carried by the typed workflow projection. */
export function resolveEditorSkillIcon(value: EditorWorkflowSuggestion | EditorMcpSuggestion): { readonly iconId?: string; readonly iconUrl?: string } | null {
  const iconId = value.icon.iconId;
  const iconUrl = value.icon.iconUrl;
  return iconId == null && iconUrl == null ? null : {
    ...(iconId == null ? {} : { iconId }),
    ...(iconUrl == null ? {} : { iconUrl }),
  };
}

export function createComposerEditorSuggestionAdapter(input: {
  readonly source: EditorSuggestionSource;
  readonly catalogStore: EmojiCatalogStore;
  readonly recents?: EditorSuggestionRecentsState;
}): ComposerEditorSuggestionAdapter {
  const controller = createEditorSuggestionController(input.source);
  const providers: PromptEditorProviders = {
    mention: {
      getMembers: (query = "") => controller.mentionRows(query).filter((entry): entry is EditorMentionSuggestion => entry.category === "assistants"),
      getWorkflows: (query = "") => controller.mentionRows(query).filter((entry): entry is EditorWorkflowSuggestion => entry.category === "automations"),
      resolveSkillIcon: resolveEditorSkillIcon,
      getRecents: () => input.recents?.get().mentionRecents ?? [],
      recordRecent: (value) => {
        const entry = snapshotEntries(controller).find((candidate) => candidate.category === value.category && candidate.id === value.id);
        if (entry != null) controller.recordMentionRecent(entry);
      },
    },
    workflow: {
      getWorkflows: (query = "") => controller.workflowRows(query),
      resolveSkillIcon: resolveEditorSkillIcon,
    },
    emoji: {
      getRows: (query) => {
        const snapshot = input.catalogStore.getSnapshot();
        if (snapshot.status === "ready") return controller.emojiRows(snapshot.catalog, query);
        if (snapshot.status === "idle") void input.catalogStore.load().catch(() => {});
        return [];
      },
      getRecents: () => input.recents?.get().emojiRecents ?? [],
      recordRecent: (id) => {
        controller.recordEmojiRecent(id);
        input.recents?.recordEmojiRecent?.(id);
      },
    },
  };

  return {
    controller,
    providers,
    setScope(scope) {
      const state = input.recents?.get();
      controller.setScope(scope, state == null ? undefined : {
        mention: state.mentionRecents,
        emoji: state.emojiRecents,
      });
    },
    async refresh() {
      await controller.refresh();
    },
    dispose() {
      controller.dispose();
    },
  };
}
