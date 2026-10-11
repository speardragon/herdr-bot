# features/conversation

Owns: the chat header, the room presence strip, the transcript (message bubbles, markdown, reactions,
notices, prompt/approval/question cards, late/held/stale badges, the typing indicator), and the
message-level hover actions (react/reply/more).

## Resolved decisions

- **DM/room header subtitle never shows "needs approval", only "working".** In a room, the header can
  read "Lens working" even while the presence strip below it lists "Forge needs approval"; a
  blocked/delegating bot DM's header has **no** subtitle at all. See `header-status.ts`'s module doc for
  the full reasoning -- `dmHeaderPhrase`/`workingOnlyPresence` implement it, `HeaderSlot.tsx` uses them.
- **Presence-strip avatars get a status *ring*, not the `Avatar` primitive's corner dot.** The ring is
  drawn in *that member's own persona color*, dashed for needs-approval, solid for working, no ring for
  idle. See `PresenceStrip.tsx`.
- **Structured notices (bot renamed / bot delegated) are rebuilt from their `event` field through this
  app's own i18n catalog, not shown as the host's raw `content`.** Reading `core/src/model/
  bot-system-events.ts` directly shows the host writes **every** structured notice's `content` in fixed
  Korean regardless of UI locale -- so "don't localize" only applies to the *other* kind of notice (no
  `event` field at all, e.g. the late-reply-completion line), which really has nothing to rebuild from and
  renders verbatim. See `notice-view.ts`'s module doc and `Notice.tsx`.
- **Attachments have no dedicated entry field at all.** `message.send`'s `attachmentPaths` get appended
  as plain `(attached: <path>)` lines onto the message's own `content` (`core/src/host.ts`'s
  `withAttachments`) -- `attachments.ts#splitAttachments` strips them back out before markdown-rendering
  the rest, and `Attachments.tsx` previews/downloads each path via `useBridge().attachments`.
- **Mentions**: a user message's `richText` (the composer's Tiptap `{type:"doc",...}` JSON, see
  `rich-text.ts`'s module doc) is rendered when present (`MarkdownView`'s `richText` prop, parsed by
  `parseRichTextBlocks`); its `mention` nodes (`attrs:{id,label,everyone}`) resolve straight to a chip.
  When `richText` is absent (no mentions in the message, or a bot's `send-message` which never has one)
  mentions are parsed from the plain text instead (`mentions.ts`/`markdown.ts#expandMentionsInBlocks`),
  against the chat's current member list -- there is no @-mention-candidate RPC, and anything that reaches
  the host without going through the composer (CLI-sent messages, older stored data, etc) is plain
  `@Name` text with no richText at all, so this fallback stays load-bearing. Either path, `MentionChip.tsx`
  resolves the mentioned bot's avatar live from `useChats()` on every render (so a renamed/recolored bot's
  older mentions stay current), never from anything frozen into the message.
- **`prompt.answer`'s multi-select semantics**: `multiSelect` (checkbox options for *one* question) and
  `progress` (step N of M in a sequential multi-question wizard) are orthogonal flags on the same
  `PendingPrompt`. Since `action:"next"` carries no key/value data, each checkbox toggle must be its own
  live `action:"option"` round-trip (so the host's own `option.checked` state stays the source of truth);
  "Next"/"Cancel" only submit the *advance/abort* signal. See `PromptCard.tsx`.

## What's already wired

- `HeaderSlot.tsx` / `PresenceStrip.tsx` -- real title/avatar/status from the store; the click target
  opens the bot/room info panel via `useDialogs().openBotInfo`/`.openRoomInfo` (`features/dialogs`),
  toggling closed via `useInfoPanel().close()` when already open; a bot DM also gets an explicit "Open in
  herdr" icon button (`bot.focus`) since nothing else in the UI binds that RPC to a control.
- `TranscriptSlot.tsx` is now a thin mount point; `Transcript.tsx` owns scrolling/rendering,
  `MessageBubble.tsx`/`Notice.tsx`/`PromptCard.tsx`/`DateSeparator.tsx` own one row kind each.

## Hooks to use

- `useChat(id)` / `useChatMembers(chat)` -- the open chat + (for a room) its resolved members.
- `useStatus(chat)` -- `dot`/`phrase` (DM) or `presence` (room members' non-idle status, already
  ordered).
- `useTranscript(chatId)` -- `{ entries, loadingOlder, loaded, loadOlder() }`. `entries` is ascending by
  `seq`, already deduped/merged.
- `useT()` -- add keys to `./i18n.ts`.
- `useMarkRead(chatId, chat, loaded, entries)` (this folder) -- marks read through the newest loaded
  `seq` whenever the window is focused+visible (`chat.markRead` is the only way to clear
  `hasUnread`).

## Cross-feature coordination (shared `data/` stores)

Both of these are single shared modules under `renderer/src/data/`, imported by both sides so the two
features never need a private bridge between them:

- **`data/jump-target.ts`** -- palette → transcript. `features/palette/PaletteSlot.tsx` calls
  `requestJumpToMessage(chatId, entryId)` (after `setActiveChatId`) when a message search result is
  selected; `Transcript.tsx` reads `useJumpTarget(chatId)`, pages older history until the entry is loaded,
  then scrolls it into view and flashes a highlight, then calls `clearJumpTarget()`.
- **`data/reply-target.ts`** -- transcript → composer. `setReplyTarget(chatId, {entryId, authorName,
  preview})`, `useReplyTarget(chatId)` (returns `{target, clear}`), `clearReplyTarget(chatId)`. The hover
  "Reply" action (`HoverActions.tsx`) calls `setReplyTarget`; `features/composer/ComposerSlot.tsx` imports
  the same module to render a quote strip above the input, pass `replyTo: entryId` to `message.send`, and
  clear on send/cancel.

The info panel seam (dialogs → header) needs no bridge module at all: `HeaderSlot.tsx`'s click
target calls `useDialogs().openBotInfo`/`.openRoomInfo` directly (see "What's already wired" above).

## Extension points

- **Hover actions / reactions**: `message.react` toggles a reaction; the quick-pick row
  (`ReactionPicker.tsx`) is a UI-owned static emoji list (no host catalog).
- **Prompt cards**: `PendingPrompt` lives on `ChatSummary.bot.pendingPrompt` (live) and on a
  `kind:"prompt"` transcript entry (historical) -- `prompt-card-state.ts#derivePromptCardView` compares
  signatures and derives `live | answered | inert | hidden`. Answer via `prompt.answer`.
- **Threads**: `HoverActions.tsx`'s "Start a thread" calls `transcript.thread` but does not yet open a
  dedicated thread view (no reply-count field exists anywhere, so there is nothing to
  badge; a real thread *panel* UI is out of scope for now).
- **Markdown**: `markdown.ts` is a small hand-rolled AST parser (paragraphs, bold/italic, inline code,
  fenced code blocks, lists, links, blockquotes, headings) -- never `dangerouslySetInnerHTML`.
  `MarkdownView.tsx` renders it; links are scheme-checked (`http(s)`/`mailto` only) and open via
  `useBridge().openExternal`.

## Tests

Every pure module in this folder (`entry-shapes`, `attachments`, `mentions`, `markdown`, `rich-text`,
`group-messages`, `date-separator-label`, `format-duration`, `scroll-anchor`, `prompt-card-state`,
`header-status`, `notice-view`) has `node --test` coverage in `renderer/test/conversation-*.test.ts`, kept
free of JSX/DOM. `data/status.ts`/`data/transcript-merge.ts` (shared) have their own coverage too.

## Known gaps / deliberately out of scope

- A dedicated thread *view* (opening `transcript.thread`'s result in its own panel) -- "Start a thread"
  currently just issues the call; nothing renders its result yet.
- The reaction picker's "More emoji" row is a second static list (~20 common emoji), not a full native
  emoji picker -- there is no host emoji catalog to build a real one from.
- Multi-question wizard round-tripping (`action:"next"` advancing to a second question) is only
  exercisable against a real blocked bot -- the browser dev harness's fake `prompt.answer` always clears
  the prompt on the first call, so that specific flow could only be checked by reasoning about
  `docs/app-api.md` + `core/src/herdr/blocked-prompt.ts`, not by driving it live.
