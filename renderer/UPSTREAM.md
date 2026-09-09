# Upstream

Forked from https://github.com/b-nnett/grok-bot-0.18-reconstructed at commit `a9f633e09d49a85829b8236331b9e21f7e612634` (`frontend/` + 3 files from `source/shared`).

Local modifications are listed in docs/superpowers/plans/2026-09-08-herdr-bot-desktop.md (Global Constraints).

## Task 5 modifications

- `renderer/src/production/evidence.ts`: rebranded three `UI_TEXT` values (`copyright`, `feedbackIntroduction`, `title`) to `herdr-bot`.
- `renderer/src/production/runtime-assets.ts`: resolves runtime asset URLs against `renderer/public/assets` in both dev (`/assets/`) and production (relative to the emitted module).
- `renderer/src/recovered/features/conversation/cards/transcript-card/emoji-catalog.ts`: `loadShippedEmojiCatalog` now degrades to `EMPTY_EMOJI_CATALOG` instead of rejecting when the unshippable emoji data chunks fail to load.
- `renderer/public/assets/*` (18 files) + `scripts/make-placeholder-assets.mjs`: generated placeholder stand-ins for the hashed upstream assets (app icon, plugin logos, onboarding wallpaper), which are not redistributable.

## Task 6 modifications

- `renderer/src/production/NewChatDialog.tsx` (new): the "New" dialog (Bot / Room tabs) for spawning or adopting bots and creating rooms, composed entirely from existing `recovered/ui/*` primitives.
- `renderer/src/production/ProductionRenderer.tsx`: sidebar "New" and command-palette "New chat" now open `NewChatDialog` instead of immediately creating a "New chat" agent; added `createBotFromDialog` (`createAgent` with `herdrBot`), `createRoomFromDialog` (`createGroup`), and `listAdoptable` (`herdrBot.listAdoptable`) handlers, plus the dialog's render-tree mount and a `new:chat` command-palette entry.
- `renderer/src/production/production.css`: appended `.sand-new-chat-dialog__*` styles for the new dialog.

## Task 7 modifications

- `renderer/src/recovered/features/conversation/cards/transcript-card/protocol.ts`: `TranscriptCardEntryBase` carries an optional `author: { id, name }` (the room member who said this), projected from the host's transcript entry.
- `renderer/src/recovered/features/conversation/cards/transcript-card/views/send-message-text.tsx`: renders a `.sand-message__author` label above the message content when `entry.author` is present and differs from the chat's own `scope.agentId` (i.e. inside a room, not a 1:1 chat).
- `renderer/src/recovered/features/conversation/workspace/chat-header.tsx`: replaced the computer-icon header control with an "Open in herdr" `SandIconButton` (terminal icon) for bot (non-group) chats, wired via a new `onOpenInHerdr` prop; `ComputerHeaderControl` import and the `isComputerActive`/`onToggleInfo` props are left in place (unused) to minimize upstream diff.
- `renderer/src/production/ProductionRenderer.tsx`: passes `onOpenInHerdr` to `ConversationAgentHeader`, calling coordinator `herdrBot.focus { id }` for the active bot agent.
- `renderer/src/production/production.css`: appended `.sand-message__author` style.

## UI parity + chat switching fixes (2026-09-09)

Found by inspecting the live renderer over CDP against the real Grok Bot 0.18 window; details in `docs/superpowers/plans/2026-09-08-herdr-bot-desktop-followups.md`.

- `renderer/src/production/production.css`: appended a "Grok Bot 0.18 look parity" block. The titlebar drag cover (`.sand-cover-drag`) no longer intercepts clicks and the header controls are `app-region: no-drag`; sidebar header controls sit right of the traffic lights; the sidebar column paints chrome behind the plugins/account rows and the aside is pinned to the 1fr grid row; the duplicate titlebar title and the "Connected" transport dot are hidden; message bubbles take their `max-width` on the fit-content anchor (the old bubble-level `calc(100% - 82px)` collapsed user bubbles to a few pixels), user bubbles are right-aligned and inverted, the transcript and composer span the chat width; recovered dark-theme literals (`#20231f`, `#bfe86b`, …) are tokenised; the chat header identity reads as the title; active sidebar rows are highlighted; the composer is one pill row `[attach | editor | mic/send]` and the tiptap placeholder finally has a rule; the New dialog gets the same elevated surface and select styling as the settings dialog (OverlayDialog only positions its panel).
- `renderer/src/production/ProductionRenderer.tsx`: the sidebar column div carries `className="sand-sidebar-column"`; `openAgent` bumps `openAgentRequestGenerationRef` only when it actually issues `openAgentTail` (the auto-open effect re-entered while the first fetch was in flight and its early return made the in-flight reply look stale, so switching chats showed an empty, load-pending transcript).
- `renderer/src/recovered/features/conversation/workspace/rich-text-editor.tsx`: `createPromptEditorExtensions` accepts `string | (() => string)`; `PromptRichTextEditor` feeds the Placeholder extension through a ref and dispatches an empty transaction when the placeholder prop changes (`useEditor` keeps its first extension set, so the placeholder stayed on the first chat's name).
- `renderer/src/recovered/features/conversation/workspace/agent-avatar.tsx`: bots without an explicit `avatarShape` render as `cloud` (row and group composite alike), matching the shipped Grok Bot look; the hash fallback in `character.tsx` is untouched.

- `renderer/src/production/AgentRowActions.tsx` + `production.css` (block 12): the agent-row context menu is rebuilt as grouped icon rows (organise · edit · copy · remove) with hairline separators and a red Delete, matching the shipped Grok Bot menu. Row rules use the same `:not(#\#)` specificity boost the recovered utilities use, otherwise `.sand-l56j7k` keeps the labels centred.
- `production.css`: the delete/feedback confirm buttons set their fill with the same `:not(#\#)` boost as the utilities (the label was white on a transparent fill, so the Delete button was invisible), and a `:root` fallback block defines the tokens the recovered code references but the shipped palette never defines (`--cursor-border-secondary`, `--cursor-text-on-color`, `--cursor-bg-scrim`, spinner timings, `--sand-font-weight-*`, `--sand-window-controls-block`).

## Room/DM polish + New Bot dialog redesign (2026-09-09, second pass)

- `renderer/src/production/production.css`: hid the three-button hover toolbar (`.sand-message-hover-actions`, along with the right-click "more actions" menu and reaction picker it hosts); tightened message spacing so consecutive same-sender bubbles sit ~3px apart and a sender/turn change gets ~14px (`.sand-message-action-anchor` margin, `.sand-transcript-row`'s legacy fixed 22px zeroed); gave every dropdown-style control (`.ui-select-trigger`) the same height/border/radius as text fields plus a chevron; unified label-above spacing for both `SandField`-wrapped inputs and the New dialog's beside-a-select rows (`[data-component="field"]`, `.sand-new-chat-dialog__row`); styled the working-directory autocomplete popover and the agent-kind monogram badge.
- `renderer/src/recovered/features/conversation/workspace/transcript-adjacency.ts`: `entrySemantics` for `send-message` cards now groups by author id (`assistant:<id>`) instead of a hardcoded `"assistant"` bucket — otherwise two different bots posting back to back in a room were treated as one uninterrupted run (no visual break, and the per-message author label logic below never got a second chance to fire).
- `.../views/send-message-text.tsx`: the author label now shows only at `adjacency.isGroupStart` (once per run) instead of on every bubble.
- `renderer/src/recovered/ui/sand-floating-primitives.tsx`: `SandSelect`'s trigger button now renders the selected option's `leading` node (previously only the list rows did), so a leading badge/icon actually appears once chosen.
- `renderer/src/production/NewChatDialog.tsx`: dropped the Id field (derived from Name via `suggestBotId`, deduped client-side against existing agent ids with a `-2`, `-3`, ... suffix on collision); the Source row (spawn vs. adopt) only renders when there is at least one adoptable agent; Agent options carry a colour-coded monogram badge (no third-party CLI logos ship in this repo); Working directory is a live autocomplete (text field + popover of matching subdirectories) backed by two new coordinator methods, and submit is blocked while the typed directory doesn't exist.
- `core/src/services/directory-browser.ts` (new) + `core/src/coordinator/dispatcher.ts`: `herdrBot.listDirectories` resolves `~`/relative input against the host's home dir and lists matching subdirectories (directories only, dotfiles hidden unless typed, capped at 50); `herdrBot.defaults` returns the host's configured default cwd/kind so the dialog no longer opens with an empty, non-functional working-directory field.

## Room message identity + text selection + sidebar alignment (2026-09-09, third pass)

- `renderer/public/assets/agent-kinds/*.svg` (new): real brand marks for Claude, Codex (OpenAI's
  mark), Gemini, and OpenCode -- Simple Icons glyphs (CC0 1.0), see `NOTICE.md` alongside them for
  the source and licence. No Grok/xAI glyph exists there, so that kind keeps a monogram badge.
- `renderer/src/production/NewChatDialog.tsx`: the Agent select's badge renders the real icon
  (masked white over the kind's colour chip) where one exists.
- `.../conversation/cards/transcript-card/views/send-message-text.tsx`: a room message (author id
  differs from the chat's own agent id) now renders in a two-column row -- a fixed-width avatar
  gutter (populated only on the first bubble of that sender's run) and a content column carrying
  the coloured author name above the bubble. The avatar/shape/colour come from the actual bot
  profile via the new `authorAvatar` leaf provider (falls back to the same hash-derived look the
  sidebar uses when a bot has no explicit override) -- not a copy that could drift from the
  sidebar's own avatar.
- `.../transcript-card/views/shared.tsx`: `TranscriptCardLeafProviders` gained `authorAvatar`,
  wired in `ProductionRenderer.tsx` from the live `agents` list.
- `.../onboarding/signed-in/character.tsx`: exported `resolvePersonaColorHex` (the `.dark` swatch
  for a resolved persona colour) so non-avatar UI can match an agent's avatar colour without
  duplicating the palette.
- `production.css`: neutralised the "computer" (sandboxed browser-use) feature's stylesheet, whose
  unscoped `:root { user-select: none }` was disabling text selection for the entire app, messages
  included; restored to `text`. Also un-did a padding-top-only quirk (present on the shared "md"
  button size class for pixel-exact fidelity elsewhere) that was pushing the sidebar Search and
  Plugins button labels a few px below centre.

## Slack-style room message grouping (2026-09-09, fourth pass)

- `.../workspace/transcript-adjacency.ts`: grouping is now also time-gated (`RUN_TIME_WINDOW_MS`,
  5 minutes) -- a same-author run breaks after enough silence even with no other boundary. Added
  `isAssistantRunEnd` (the shipped `isGroupEnd` field deliberately excludes assistant rows for
  reasons unrelated to this, so this is a parallel herdr-bot-owned field, not a repurposing of it).
- `.../transcript-card/views/shared.tsx`: `TranscriptCardAdjacency` gained `isAssistantRunEnd`.
- `.../transcript-card/views/send-message-text.tsx` + `production.css` (block 19): matches Slack --
  the author name labels only the *first* bubble of a run; the avatar anchors the *last* bubble and
  sits at its bottom edge (`align-items: flex-end` on the row), not the top of the first.
