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

## Sidebar "Working" row layout fix (2026-09-09, fifth pass)

- `production.css` (block 23): while a bot is `isRunning`, the sidebar row swaps its usual
  `.sand-agent-item__preview` (small, single-line, ellipsis-clamped) for `SidebarAgentActivity`'s
  `.sand-agent-item__activity` span -- whose only recovered rule was a text colour (the component's
  own comment notes the private activity styling wasn't recovered). With no font-size or
  wrap/clamp, the full message rendered at the ambient body size and pushed the row (and the whole
  list under it) taller for as long as the bot was working. Matched it to `.sand-agent-item__preview`'s
  sizing/clamping, keeping the accent colour.

## Sidebar last-message preview markdown stripping (2026-09-09, sixth pass)

- `renderer/src/production/model.ts`: `derivedLastMessage`'s "text" branch used the raw stored
  entry text; the hover card's `previewTextFromLastEntry` (which strips markdown syntax down to
  plain text) was already there but only wired to the hover card, not the row itself. A reply
  opening with `## Heading` or a markdown list showed the literal `##`/`-` in the sidebar row.
  Routed the row through the same stripper.

## Composer send button + top padding fix (2026-09-09, seventh pass)

- `production.css` (block 9): the send button lives inside `.sand-prompt-actions-trailing` (a
  sibling of the mic button), not a direct child of `.sand-prompt-actions-row` -- the earlier
  selector never matched, so it fell back to its own recovered atomic classes, which render it
  square. Retargeted the selector and gave it the same round-pill treatment as the mic button.
- Tiptap renders each line as a `<p>` with no reset, so it kept the browser's default paragraph
  margin (1em top) and inherited the default 16px font-size (vs. the app's 14px base) instead of
  its own -- together showing as extra empty space above the typed text and a taller composer than
  intended. Zeroed the paragraph margin and set the field's font-size explicitly.

## Inline code text colour (2026-09-09, eighth pass)

- `production.css` (block 24): inline `<code>` had a background tint (color-mix over the body text
  colour) but no text colour of its own, from the recovered atomic classes, so it rendered as plain
  body-coloured text on a grey chip -- missing the coral/pink Notion (and the shipped app) use for
  inline code. Added `color: #eb5757`, scoped to `.sand-message-prose code`; fenced code blocks get
  an explicit override back to their own grey (`#d9ded4`) via a more specific selector so they
  aren't caught by the broader rule.

## Send button icon centering (2026-09-09, ninth pass)

- `production.css` (block 9 addendum): the mic/arrow-up crossfade toggle inside the send button
  only ever had `opacity` on its two icons (from the recovered atomic classes) -- the hidden one
  still occupied inline layout space next to the visible one, pushing the visible icon off-centre
  within its span. Stacked both icons absolutely inside a fixed-size relative span so only the
  visible one's position matters.

## Pixel alignment pass (2026-09-09, tenth pass)

A full CDP measurement sweep of the DM view, the room view, the New dialog and an 820x620 window,
comparing every rect against the neighbour it is supposed to line up with. Fixes, by cause:

- `transcript.tsx` `assistantTextBlocks`: a paragraph run collected every line up to the next block,
  the blank separator lines included, and joined them verbatim. `.sand-message-prose p` renders
  `white-space: pre-wrap`, so those blanks survived as real line boxes -- every markdown paragraph
  was 20px taller than its text and carried an empty leading (and often trailing) line. Trim blank
  lines at both ends of the run.
- `production.css` (25e): with that blank line gone, nothing separated markdown blocks at all --
  every recovered block class carries explicit `margin-top: 0` / `margin-bottom: 0`, so headings,
  paragraphs, lists, quotes and tables ran flush. Give the prose flex column one 8px block gap,
  zero the code figure's own margin (it would stack on the gap) and reset the first/last margins so
  the gap stays off the bubble's 8px padding. That last reset also fixes 18px of padding under a
  trailing code block against 8px above it.
- `ProductionRenderer.tsx` / `sidebar.tsx` / `resizeSidebar`: the sidebar width is persisted from a
  drag and was never rounded (271.3515625px here), so the entire chat column -- its header hairline,
  its text -- sat on a half-pixel grid. Round at the three places the value becomes layout.
- `production.css` (25a): the recovered sidebar header is 50px and the recovered chat header 51px,
  so the two bottom hairlines met at the column divider 1px apart. Match the chat header.
- `production.css` (25b): `.sand-agent-item__name` / `__preview` had no line-height, so a Hangul row
  (17px line box) sat 1px above a Latin one (15px) and its preview 1px below -- adjacent rows in the
  same list did not share a baseline. Fixed line boxes, sized to clear Hangul without clipping.
- `production.css` (23 addendum): same for `.sand-agent-item__activity`, which swaps in while a bot
  is working -- it was 13px against the preview's 15px, so the row's text shifted as a bot started.
- `production.css` (25c): the Channels button nests its icon inside the label span, so the button's
  own `gap` never applied and the glyph touched the "C".
- `production.css` (25d): the composer's attach and mic buttons are sized by a recovered atomic class
  with a fourfold `:not(#\#)` boost, so block 9's 34px never applied and both rendered 24px.
  Bottom-aligned in the row that put their centres 5px below the 34px send button's, and the mic
  jumped down 5px the moment the send button appeared. Match the boost.
- `production.css` (25g): the Search and Plugins buttons centred their labels, the only two controls
  in the sidebar that did; every row above and below starts its content at x=20. Block 8 had already
  tried to left-align them and lost to the same specificity boost. Collapsed sidebars keep centring.
- `production.css` (account block): the footer avatar was 30px against the rows' 34px at the same
  left edge, so the two avatar columns' centres were 2px apart; its label sat 1px off the rows'
  names. 34px, `gap: 9px` and `padding: 4px 8px` keep the row height and line both columns up.
- `production.css` (plugins block): `.sand-agents-sidebar__plugins-entry` had an 8px gutter against
  the 12px the search box, the rows and the account row all use, so the Plugins button was 4px wider
  than everything else on both sides.
- `production.css` (dialog): `.sand-new-chat-dialog .ui-select-trigger` was a second, higher-specificity
  copy of block 15's select recipe, so block 15 never governed: selects were 34px tall with a 10px
  text inset against the inputs' 37px and 12px, and the Agent select's badge sat 16px from its label.
  Dropped the duplicate; both are now 38px (an even content box, so an 18px badge and a 14px label
  centre on a whole pixel). The footer's 16px padding put "Start bot" 4px past the fields' right
  edge; the title had no line-height, which made the dialog 530.5px tall and centred it on a
  half-pixel; the form's 14px top margin did not match the title's 12px.

Not changed, and why: `.sand-chat-input-dock`'s 8px/18px vertical padding, `.sand-chat-header__controls`'
2px gap against the sidebar cluster's 3px, and the transcript's 24px/8px padding are recovered
upstream values, not ours.

### Settings dialog (same pass)

Reachable from the account menu, and badly broken before this pass -- both causes are ours or a
recovered specificity boost, not upstream layout:

- `production.css` (25h): block 15 gave every `.ui-select-trigger` `width: 100%`. In the New dialog
  the trigger is the only item on its grid row and would stretch anyway, but the Settings rows are
  `display: flex` with the label and the control as siblings: 100% resolved against the whole row, so
  each trigger covered its own label ("Follow System" over "Theme", "Auto-detect (Asia/Seoul)" over
  "Timezone") and squeezed "Execution on Local Computer" to one word per line. The trigger now sizes
  to its content; `width: 100%` is scoped to the two New-dialog rows that need it.
- `production.css` (25i): `.sand-settings-panel__close` asks for `position: absolute; top: 11px;
  right: 14px`, but SandIconButton's atomic `position: relative` carries a threefold `:not(#\#)`
  boost and won, so the button sat in normal flow at the panel's top-left and the now-relative
  `right` offset pushed it 14px out over the nav column, half-clipped. Boosted to absolute.

### Noted, not changed

- `.sand-room-message__gutter` collapses to `22x0` on bubbles that carry no avatar. Harmless with
  `align-items: flex-end` and today's bubble heights (a bubble is never shorter than the 22px
  avatar), but a shorter bubble would let the avatar overflow above the row.
- `assistantTextBlocks`' paragraph trimming has no unit test: the renderer workspace has no test
  runner at all (`npm test` covers core, cli and desktop), and the function lives in a `.tsx` file
  that `node --test` cannot strip. Verified live instead.

## Settings dialog restyle + two-character user avatar (2026-09-09, eleventh pass)

Restyled after the shipped Grok Bot settings sheet (screenshot supplied by the user). Layout/markup
untouched; everything is `production.css` block 26 scoped under `.sand-settings-dialog`, plus one
helper.

- `recovered/features/account/session/initials.ts` (herdr-bot addition, tested in
  `renderer/test/account-initials.test.ts` -- the first renderer test; the root `npm test` glob now
  includes `renderer/test`): `accountInitials(name)` returns two characters -- the first of each of
  the first two words ("창룡 강" -> "창강", "Donald Duck" -> "DD") or the first two of a lone word
  ("ray" -> "RA"), Latin upper-cased. Used by the Settings account card (`panels.tsx`) and the
  sidebar footer (`menu.tsx`) in place of the single `slice(0, 1)` initial. Both avatars are now a
  grey (`--cursor-bg-secondary`) circle with primary-colour text; the footer one was a blue rounded
  square.
- Dialog 900x660 (was 860x620), 14px base. Nav column 200px, `--cursor-bg-chrome`, items 32px with
  a 16px icon and an 8px-radius `--cursor-bg-secondary` pill on the active one; the title is a plain
  18px heading with no rule beneath it and the panel is a flex column (the body no longer subtracts
  a 54px magic number).
- Groups: 13px secondary label indented 8px, then ONE 12px-radius `--cursor-bg-tertiary` card per
  group. Rows (`label`, `.sand-settings-row`, `.sand-account-card`, `.sand-auto-review`, the usage
  cards) lose their own border/radius/background; consecutive rows are separated by a hairline inset
  14px from both edges (`::before`), and only the first/last row carry the card's corner radius
  (longhands, so a one-row card keeps all four). Row height 52px, 12px/14px padding; copy is
  14px/600 over 13px secondary.
- Controls hug their content on the right: select pills 28px, 8px radius, `--cursor-bg-secondary`,
  no border, no 148px floor (view.css's blanket "every non-kit <button> is a bordered secondary
  button" rule needed a `:not(#\#)` to beat -- it was also what boxed the nav items and the
  switches). `SandSwitch` renders its toggle before the label; the sheet puts it after, so the
  toggle gets `order: 1`. Its on-colour is an inline `var(--cursor-bg-accent)`, redefined on the
  switch to `--cursor-text-primary` (black, as in the sheet) rather than fought with `!important`;
  the off-track read `--cursor-bg-tertiary`, the card colour itself, so that is redefined locally
  to a 22% mix of the text colour.
- Account card: 44px avatar, 15px/600 name, 14px secondary detail with the copy-email button on
  the same line (the body grid was single-column, which stacked the button under the email).
- `.sand-auto-review` is a `<section>` nested in the Agent group; the card-row reset outranked its
  plain-class padding override, so its toggle row was double-padded and its label copy ran inline.
- Updates tab: the dev-only "Refresh Anyway" button lives between two rows; it becomes a
  right-aligned pill and the row after it starts a new card. `scrollbar-gutter: stable` keeps card
  widths identical between tabs that scroll and tabs that do not.
- `production.css` (27): every `sentiment="danger"` SandButton rendered white text on nothing --
  the kit's base class list carries a threefold-boosted `background-color: transparent` and the
  danger variant classes only set a plain `background`. Surfaced as an unreadable "Reset" in
  Settings > Updates; the fix is app-wide.
- Not changed: one `npm test` run showed a single failure that did not reproduce on two immediate
  re-runs (the core suite has timing-based tests noted in the core follow-ups); unrelated to the
  renderer.
- Auto-review ON state: the rules editor's toolbar is a bare `<div>` (text field + behaviour select
  + "Add Rule"); the field is block-level, so the other two wrapped beneath it at three heights
  (38/28/24). Now one 28px flex row with the field taking the slack.
