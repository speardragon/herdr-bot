import type { ComposerReplyTarget } from "./reply-preview";
import {
  createReplyThreadController,
  type ReplySelection,
  type ReplyTargetResolution,
  type ReplyThreadController,
  type ReplyThreadScope
} from "./reply-thread-controller";
import {
  createTranscriptPaginationController,
  type TranscriptHistoryFetcher,
  type TranscriptHistoryPage,
  type TranscriptPaginationRootHandoff,
  type TranscriptPaginationSnapshot
} from "./pagination";
import type { ComposerSubmission } from "./submission";
import type { ConversationTranscriptEntry, ComposerDraft, TranscriptMessage, TranscriptReplyPreview } from "./model";
import type { FindInChatController, FindInChatTranscriptHandle } from "./find-in-chat-controller";
import {
  createReactionFeedAdapter,
  type ReactionFeedAdapter,
  type TranscriptFeedSource,
} from "../cards/transcript-card/reaction-feed";
import type { ReactionActionController } from "../cards/transcript-card/reaction-actions";

// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5323918
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5306234
// @evidence src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=5692943

export interface ConversationWorkspaceControllerOptions {
  accountSlot?: string | null;
  agentId?: string | null;
  fetchTranscriptPage: TranscriptHistoryFetcher;
  pageLimit?: number;
  onNavigateReply?(targetId: string, isInScope: boolean): void;
  onRestoreReplyFocus?(): void;
  onReplySelectionChange?(selection: ReplySelection | null): void;
  onStartThread?(entry: TranscriptMessage): void;
  /** Root-owned find state/DOM handle. Omitted keeps find unmounted. */
  findInChat?: {
    readonly controller: FindInChatController;
    readonly transcriptHandle: FindInChatTranscriptHandle;
  };
  /**
   * Optional exact transcript feed/controller pair. The workspace owns both
   * lifecycles; omitted keeps reactions unmounted.
   */
  reactionFeed?: {
    readonly feed: TranscriptFeedSource;
    readonly controller: ReactionActionController;
  };
}

export interface ConversationWorkspaceTranscriptProps {
  resolveReplyPreview(targetId: string): TranscriptReplyPreview | null;
  isReplyTargetInScope(targetId: string): boolean;
  onOpenReply(targetId: string, isInScope: boolean): void;
  onReply(entry: TranscriptMessage): void;
  onStartThread?(entry: TranscriptMessage): void;
}

export interface ConversationWorkspaceComposerProps {
  replyTarget?: ComposerReplyTarget;
  onClearReplyTarget(): void;
}

export interface ConversationWorkspaceController {
  getReplyController(): ReplyThreadController;
  getTranscriptPagination(): TranscriptPaginationRootHandoff;
  getSnapshot(): TranscriptPaginationSnapshot;
  subscribe(listener: () => void): () => void;
  getTranscriptProps(): ConversationWorkspaceTranscriptProps;
  getComposerProps(): ConversationWorkspaceComposerProps;
  getFindController(): FindInChatController | null;
  getFindTranscriptHandle(): FindInChatTranscriptHandle | null;
  getReactionFeedAdapter(): ReactionFeedAdapter | null;
  installInitialPage(page: TranscriptHistoryPage): boolean;
  loadOlder(): Promise<void>;
  replaceReplyEntries(entries: readonly ConversationTranscriptEntry[]): void;
  prependReplyEntries(entries: readonly ConversationTranscriptEntry[]): void;
  appendReplyEntries(entries: readonly ConversationTranscriptEntry[]): void;
  resolveReply(targetId: string): ReplyTargetResolution;
  selectReply(targetId: string): boolean;
  clearReply(): void;
  applyReplyToDraft(draft: ComposerDraft): ComposerDraft;
  projectSubmission(submission: ComposerSubmission): ComposerSubmission;
  projectForkSubmission(submission: ComposerSubmission, rootId: string): ComposerSubmission;
  send<T>(submission: ComposerSubmission, dispatch: (submission: ComposerSubmission) => T | Promise<T>): T | Promise<T>;
  setScope(accountSlot: string | null, agentId: string | null): void;
  dispose(): void;
}

export function createConversationWorkspaceController(options: ConversationWorkspaceControllerOptions): ConversationWorkspaceController {
  const listeners = new Set<() => void>();
  let disposed = false;
  const emit = () => {
    if (disposed) return;
    for (const listener of [...listeners]) listener();
  };
  const notifySelection = (selection: ReplySelection | null) => {
    options.onReplySelectionChange?.(selection);
    emit();
  };
  const replyController = createReplyThreadController({
    scope: { accountSlot: options.accountSlot ?? null, agentId: options.agentId ?? null },
    onSelectionChange: notifySelection,
    onNavigate: options.onNavigateReply,
    onRestoreFocus: options.onRestoreReplyFocus
  });
  const paginationController = createTranscriptPaginationController({
    accountSlot: options.accountSlot,
    agentId: options.agentId,
    fetchPage: options.fetchTranscriptPage,
    pageLimit: options.pageLimit
  });
  const findInChat = options.findInChat ?? null;
  const reactionFeedAdapter = options.reactionFeed == null
    ? null
    : createReactionFeedAdapter({
      scope: { accountSlot: options.accountSlot ?? null, agentId: options.agentId ?? null },
      feed: options.reactionFeed.feed,
      controller: options.reactionFeed.controller,
    });
  const syncReplyEntries = () => replyController.replaceEntries(paginationController.getSnapshot().entries);
  const unsubscribePagination = paginationController.subscribe(() => {
    const snapshot = paginationController.getSnapshot();
    syncReplyEntries();
    emit();
  });

  const clearReply = () => replyController.clearReply();
  const transcriptProps: ConversationWorkspaceTranscriptProps = {
    resolveReplyPreview(targetId) {
      const resolution = replyController.resolve(targetId);
      return resolution.status === "resolved" ? resolution.preview : null;
    },
    isReplyTargetInScope(targetId) {
      return replyController.resolve(targetId).isInScope;
    },
    onOpenReply(targetId) {
      replyController.navigate(targetId);
    },
    onReply(entry) {
      replyController.selectReply(entry.id);
    },
    ...(options.onStartThread == null ? {} : { onStartThread: (entry: TranscriptMessage) => options.onStartThread?.(entry) })
  };

  return {
    getReplyController: () => replyController,
    getTranscriptPagination: () => paginationController,
    getSnapshot: () => paginationController.getSnapshot(),
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getTranscriptProps: () => transcriptProps,
    getComposerProps() {
      const selection = replyController.getSelection();
      return {
        ...(selection == null ? {} : { replyTarget: { targetId: selection.targetId, preview: selection.preview } }),
        onClearReplyTarget: clearReply
      };
    },
    getFindController: () => findInChat?.controller ?? null,
    getFindTranscriptHandle: () => findInChat?.transcriptHandle ?? null,
    getReactionFeedAdapter: () => reactionFeedAdapter,
    installInitialPage(page) {
      return paginationController.installInitialPage(page);
    },
    loadOlder: () => paginationController.loadOlder(),
    replaceReplyEntries: (entries) => replyController.replaceEntries(entries),
    prependReplyEntries: (entries) => replyController.prependEntries(entries),
    appendReplyEntries: (entries) => replyController.appendEntries(entries),
    resolveReply: (targetId) => replyController.resolve(targetId),
    selectReply: (targetId) => replyController.selectReply(targetId),
    clearReply,
    applyReplyToDraft: (draft) => replyController.applyReplyToDraft(draft),
    projectSubmission: (submission) => replyController.projectSubmission(submission),
    projectForkSubmission(submission, rootId) {
      const scope = replyController.getScope();
      if (rootId.length === 0 || scope.agentId == null || submission.agentId !== scope.agentId) return { ...submission };
      return { ...submission, replyToId: rootId, isFork: true };
    },
    send(submission, dispatch) {
      const projected = replyController.projectSubmission(submission);
      // The shipped composer clears replyTargetId before invoking sendPrompt.
      replyController.clearReply();
      return dispatch(projected);
    },
    setScope(accountSlot, agentId) {
      replyController.setScope({ accountSlot, agentId });
      paginationController.setScope(accountSlot, agentId);
      reactionFeedAdapter?.setScope({ accountSlot, agentId });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribePagination();
      paginationController.dispose();
      reactionFeedAdapter?.dispose();
      options.reactionFeed?.controller.dispose();
      replyController.dispose();
      listeners.clear();
    }
  };
}
