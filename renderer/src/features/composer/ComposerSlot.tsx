/**
 * Compose-and-send: a Tiptap rich-text editor (mentions, Enter-to-send, IME-safe,
 * auto-growing/scrolling), staged attachments, a reply-target preview bar, and a per-chat draft that
 * survives switching chats. See this folder's README for the architecture/contracts (richText wire
 * format, reply-target cross-feature contract, mention-routing plain-text requirement).
 */
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { ArrowUp, Plus } from "lucide-react";
import { useBridge } from "../../data/BridgeContext.tsx";
import { useChat, useChatMembers } from "../../data/hooks/useChat.ts";
import { useStoreContext } from "../../data/store/StoreProvider.tsx";
import { useT } from "../../i18n/TranslationProvider.tsx";
import { IconButton, Spinner, useToast } from "../../primitives/index.ts";
import { AttachmentChips } from "./AttachmentChips.tsx";
import { attachmentErrorMessageKey, validateAttachmentCandidate } from "./attachment-validation.ts";
import { ComposerSendKeymap } from "./composer-keymap.ts";
import { decodeDraft, encodeDraft } from "./draft-codec.ts";
import type { ComposerDraftState, StagedAttachmentDraft } from "./draft-codec.ts";
import { ComposerMention } from "./mention-extension.tsx";
import type { MentionMember } from "./mention-candidates.ts";
import { createMentionSuggestion } from "./mention-suggestion.ts";
import { placeholderKey } from "./placeholder.ts";
import { buildMessagePayload, isDocEmpty } from "./rich-text.ts";
import type { DocNode, MentionNameResolver } from "./rich-text.ts";
import { ReplyPreviewBar } from "./ReplyPreviewBar.tsx";
import { useReplyTarget } from "../../data/reply-target.ts";
import styles from "./ComposerSlot.module.css";

export interface ComposerSlotProps {
  readonly chatId: string;
}

export function ComposerSlot({ chatId }: ComposerSlotProps) {
  const chat = useChat(chatId);
  const members = useChatMembers(chat);
  const { client, drafts, store } = useStoreContext();
  const bridge = useBridge();
  const { t } = useT();
  const toast = useToast();
  const replyHandle = useReplyTarget(chatId);

  const [sending, setSending] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [attachments, setAttachmentsState] = useState<readonly StagedAttachmentDraft[]>([]);

  // Refs below exist so the editor's extensions (built once, see `useEditor(..., [])`) and the
  // Suggestion plugin's `items()` (created once by Tiptap, see mention-suggestion.ts) always read the
  // *current* chatId/members/callbacks without needing to recreate the editor on every render.
  const chatIdRef = useRef(chatId);
  const attachmentsRef = useRef<readonly StagedAttachmentDraft[]>([]);
  const membersRef = useRef<readonly MentionMember[]>([]);
  const placeholderRef = useRef("");
  const sendRef = useRef<() => void>(() => {});
  const stageFilesRef = useRef<(files: FileList | readonly File[] | null | undefined) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function persistDraft(doc: DocNode): void {
    drafts.set(chatIdRef.current, encodeDraft({ doc, attachments: attachmentsRef.current }));
  }

  function setAttachments(next: readonly StagedAttachmentDraft[]): void {
    attachmentsRef.current = next;
    setAttachmentsState(next);
    persistDraft(editor.getJSON() as unknown as DocNode);
  }

  async function stageFiles(files: FileList | readonly File[] | null | undefined): Promise<void> {
    if (files == null) return;
    for (const file of Array.from(files)) {
      const rejection = validateAttachmentCandidate({ size: file.size });
      if (rejection != null) {
        toast.show(t(attachmentErrorMessageKey(rejection)));
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await bridge.attachments.stage(file.name, bytes);
        if (!result.ok) {
          toast.show(t(attachmentErrorMessageKey(result.reason)));
          continue;
        }
        setAttachments([...attachmentsRef.current, { path: result.path, filename: file.name, size: file.size }]);
      } catch {
        toast.show(t(attachmentErrorMessageKey("failed")));
      }
    }
  }

  async function removeAttachment(path: string): Promise<void> {
    setAttachments(attachmentsRef.current.filter((attachment) => attachment.path !== path));
    try {
      await bridge.attachments.discard(path);
    } catch {
      // Best-effort: the chip is already gone from the UI either way, and a leaked staged file on disk
      // is harmless (never referenced by a sent message).
    }
  }

  async function send(): Promise<void> {
    if (sending) return;
    const activeChatId = chatIdRef.current;
    const doc = editor.getJSON() as unknown as DocNode;
    if (isDocEmpty(doc) && attachmentsRef.current.length === 0) return;

    setSending(true);
    try {
      const resolveMentionName: MentionNameResolver = (id) => store.getState().chats.find((candidate) => candidate.id === id)?.name ?? null;
      const payload = buildMessagePayload(doc, resolveMentionName);

      let attachmentPaths: string[] | undefined;
      if (attachmentsRef.current.length > 0) {
        const committed = await bridge.attachments.commit(attachmentsRef.current.map((attachment) => attachment.path));
        if (committed == null) {
          toast.show(t(attachmentErrorMessageKey("failed")));
          return;
        }
        attachmentPaths = committed;
      }

      const replyTo = replyHandle.target?.entryId;
      await client.call("message.send", {
        chatId: activeChatId,
        text: payload.text,
        ...(payload.richText == null ? {} : { richText: payload.richText }),
        ...(replyTo == null ? {} : { replyTo }),
        ...(attachmentPaths == null ? {} : { attachmentPaths }),
        clientNonce: crypto.randomUUID(),
      });

      editor.commands.clearContent(true);
      setAttachments([]);
      drafts.clear(activeChatId);
      replyHandle.clear();
      setHasContent(false);
    } catch {
      toast.show(t("composer.send.error"));
    } finally {
      setSending(false);
    }
  }

  const editor = useEditor(
    {
      extensions: [
        Document,
        Paragraph,
        Text,
        HardBreak,
        UndoRedo,
        Placeholder.configure({ placeholder: () => placeholderRef.current }),
        ComposerMention.configure({ suggestion: createMentionSuggestion({ getMembers: () => membersRef.current }) }),
        ComposerSendKeymap.configure({ onSend: () => sendRef.current() }),
      ],
      editorProps: {
        attributes: { class: styles["hb-composer-editable"] ?? "", "aria-label": t("composer.input.ariaLabel") },
        // Files win over Tiptap's default paste/drop handling (which would otherwise try to insert
        // whatever text representation the OS gives a dropped/pasted file); anything else -- plain text,
        // markdown-looking text -- falls through to the default, which is exactly "paste ... sensibly"
        // for a schema with no formatting marks to preserve.
        handlePaste: (_view, event) => {
          const files = event.clipboardData?.files;
          if (files == null || files.length === 0) return false;
          event.preventDefault();
          void stageFilesRef.current(files);
          return true;
        },
        handleDrop: (_view, event) => {
          const files = event.dataTransfer?.files;
          if (files == null || files.length === 0) return false;
          event.preventDefault();
          void stageFilesRef.current(files);
          return true;
        },
      },
      onUpdate: ({ editor: updated }) => {
        const doc = updated.getJSON() as unknown as DocNode;
        setHasContent(!isDocEmpty(doc));
        persistDraft(doc);
      },
    },
    [],
  );

  // Keep the two callbacks the editor's (once-built) extensions close over up to date, without ever
  // recreating the editor itself.
  useEffect(() => {
    sendRef.current = () => void send();
  });
  useEffect(() => {
    stageFilesRef.current = (files) => void stageFiles(files);
  });

  useEffect(() => {
    membersRef.current = members.map((member) => ({ id: member.id, name: member.name, avatarColor: member.avatarColor }));
  }, [members]);

  // Placeholder tracks the chat's CURRENT name/kind -- a rename updates it immediately rather than
  // waiting for the next keystroke. `updateState` forces Placeholder's decoration to recompute even
  // though no transaction happened (the ref alone wouldn't trigger a redraw on its own).
  useEffect(() => {
    placeholderRef.current = chat == null ? "" : t(placeholderKey(chat.kind), { chatName: chat.name });
    editor.view.updateState(editor.view.state);
  }, [editor, chat?.kind, chat?.name, t]);

  // Restore this chat's draft on switching chats. Keyed on `chatId` alone -- deliberately
  // NOT on `chat` (a `ChatSummary` object that changes identity on almost any unrelated update, e.g. a
  // new message arriving) -- so activity in the open chat never resets an in-progress draft.
  useEffect(() => {
    chatIdRef.current = chatId;
    const decoded: ComposerDraftState = decodeDraft(drafts.get(chatId));
    editor.commands.setContent(decoded.doc as unknown as JSONContent, { emitUpdate: false });
    attachmentsRef.current = decoded.attachments;
    setAttachmentsState(decoded.attachments);
    setHasContent(!isDocEmpty(decoded.doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chatId drives this, not `drafts`/`editor` identity
  }, [chatId]);

  useEffect(() => {
    editor.setEditable(!sending);
  }, [editor, sending]);

  if (chat == null) return null;

  const canSend = (hasContent || attachments.length > 0) && !sending;

  return (
    <div className={styles["hb-composer-wrap"]}>
      {replyHandle.target != null && <ReplyPreviewBar target={replyHandle.target} onClear={replyHandle.clear} />}
      {/* One unified bordered card holds both the staged-attachment chip row and the text/send row --
          they share a single outer rounded border, not two separate floating pills. */}
      <div
        className={styles["hb-composer-card"]}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          // A drop landing inside the editable area is already handled by `editorProps.handleDrop`
          // above; only act here for a drop elsewhere on the card (the attachment row, the padding).
          if (editor.view.dom.contains(event.target as Node)) return;
          event.preventDefault();
          void stageFiles(event.dataTransfer?.files);
        }}
      >
        <AttachmentChips attachments={attachments} onRemove={(path) => void removeAttachment(path)} />
        <form
          className={styles["hb-composer"]}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className={styles["hb-composer-file-input"]}
            onChange={(event) => {
              // Snapshot into a plain array BEFORE clearing `value` -- `event.target.files` is a *live*
              // FileList tied to the input, so resetting `value` (to allow re-selecting the same file
              // later) empties it too, taking a same-reference `files` variable down with it.
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void stageFiles(files);
            }}
          />
          <IconButton aria-label={t("composer.attach")} onClick={() => fileInputRef.current?.click()} disabled={sending}>
            <Plus size={20} />
          </IconButton>
          <EditorContent editor={editor} className={styles["hb-composer-editor"]} />
          <button type="submit" className={styles["hb-composer-send"]} aria-label={t("composer.send")} disabled={!canSend}>
            {sending ? <Spinner size={16} label={t("composer.send")} /> : <ArrowUp size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
