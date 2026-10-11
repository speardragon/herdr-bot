# features/palette

Owns: the ⌘K command palette -- search across chat names and message content, the
All/Messages/Bots/Groups/Actions tab strip, ⌘-digit row shortcuts, and the Actions tab's static list
(New bot, New room, Settings, ...).

## What's built

`PaletteSlot.tsx` is mounted once by `App.tsx`. ⌘K opens it; `features/sidebar`'s Search
button opens it too, via `palette-bus.ts`'s `requestPaletteOpen()` (a module-level pub/sub, no
shared-state edits needed).

- **Tabs** (`tabs.ts`'s `visibleTabs()`): All and Messages and Actions always show; Bots/Groups only
  show when the workspace actually has a chat of that kind. This is a **structural** decision (does
  the kind exist at all), not a per-keystroke one -- a query with zero current bot matches still shows
  the Bots tab if any bot chat exists anywhere. Decided this way to always show all 5 tabs for an empty
  query, without inventing a query-dependent flicker.
- **Results per tab**:
  - **All** (empty query): every chat, newest-activity-first (same order as the sidebar).
  - **All** (non-empty query): chat-name/description matches (`filter-chats.ts`, client-side over the
    already-loaded `useChats()` list -- **not** the `chat.search` RPC, so results stay reactive to live
    chat updates the RPC's one-shot snapshot wouldn't catch) **then** message hits, each group sorted
    newest-first; this merge order (chats before messages) is a deliberate design choice.
  - **Messages**: `message.search` hits only, debounced 150ms, stale-response-guarded (see the
    `useEffect` in `PaletteSlot.tsx` -- `cancelled` flag + the effect only runs while `open`).
  - **Bots** / **Groups**: `filterChatsByKind`.
  - **Actions**: the static `PALETTE_ACTIONS` list (`actions.ts`), filtered by resolved (translated)
    label text, not the i18n key.
- **⌘-digit / arrows / Enter**: handled in one `onKeyDown` on the **scrim** (`PaletteSlot.tsx`'s
  `onPaletteKeyDown`), not on the `<input>`. A tab strip button is a real `<button>` and takes real DOM
  focus on click -- if the handler only lived on the input, ⌘-digit/arrows would stop working the
  moment a user clicked a tab. The scrim always receives the bubbled event regardless of which inner
  element has focus. Escape lives in the same handler for the same reason.
- **Jump-to-message** (`data/jump-target.ts`): selecting a message result calls
  `setActiveChatId(hit.chatId)` then `requestJumpToMessage(hit.chatId, hit.entryId)`. This is a shared
  **module-level store outside React** (same `useSyncExternalStore` pattern as
  `data/store/create-store.ts`), under `data/` rather than `data/store/*`'s reducer-driven state since
  it's transient UI state, not host-synced data. `features/conversation/Transcript.tsx` subscribes with
  `useJumpTarget(chatId)`: when it matches the chat being rendered, it loads older pages until `entryId`
  is present if necessary, scrolls it into view, applies a momentary highlight, then calls
  `clearJumpTarget()`. The monotonically increasing `token` field lets a repeat selection of the *same*
  entry re-trigger the scroll/highlight even before `clearJumpTarget()` has run.
- **Actions' New bot / New room / Settings**: call `useDialogs().openNewBotDialog()` /
  `.openNewRoomDialog()` / `.openSettings()` directly (`features/dialogs/useDialogs.tsx`) -- distinct
  actions/dialogs, not a synthesized shortcut.
- **Toggle theme**: `useTheme().setPreference(resolved === "dark" ? "light" : "dark")` -- a real,
  already-wired hook.

## Hooks to use

- `useChats()` -- the full chat list (not hidden-filtered; a chat hidden from the sidebar is still
  reachable here by design, see `features/sidebar/README.md`).
- `useStoreContext().client.call("message.search", { query })` for message hits.
- `useActiveChat().setActiveChatId(id)` to jump to a chat on selection.
- `useBridge()` for `.platform` (mod-key detection, matching `shell/shortcuts.ts`'s own logic).
- `useT()` -- add keys to `./i18n.ts` (tab labels, subtitle templates, etc.).

## Extension points

- **Actions tab**: add a new `PaletteActionDef` to `actions.ts` and an icon/behavior case in
  `PaletteResultRow.tsx` / `PaletteSlot.tsx`'s `runAction`.
- **Subtitle copy**: `subtitle.ts`'s `messageHitSubtitle()` classifies a hit as `room` /
  `dmFromBot` / `dmFromYou`; `./i18n.ts`'s `palette.subtitle.*` keys hold the actual templates. The KO
  "{author}이(가) 나에게" particle choice (이 vs 가) isn't grammatically resolved for every possible bot
  name.

## Tests

Pure modules, each with its own `renderer/test/palette-*.test.ts`: `filter-chats.ts`,
`highlight-snippet.ts`, `relative-time.ts`, `subtitle.ts`, `tabs.ts`, `actions.ts`, `palette-bus.ts`.
Roving-index arithmetic (`list-nav.ts`) lives in `features/sidebar` and is shared, with its own
`sidebar-list-nav.test.ts`. `data/jump-target.ts`'s non-React parts have their own
`renderer/test/data-jump-target.test.ts`.
