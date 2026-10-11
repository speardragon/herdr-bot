# features/sidebar

Owns: the chat list, the "New chat" entry point, the Search button (opens the command palette, see
`features/palette`), the Settings entry point, the resizable/icon-rail sidebar content, the row context
menu (Pin/Rename/Edit Profile/Delete), and inline rename.

## What's built

`SidebarSlot.tsx` renders the full chat list (names, avatars, last-message preview, timestamps, unread
dot, status dot, selection), split into pinned/unpinned groups (`order-chats.ts`), plus:

- **New "+" / Settings buttons** (header + footer, and the rail-mode footer pair) call
  `useDialogs().openNewChatMenu()` / `.openSettings()` directly (see "Wired to `features/dialogs`"
  below).
- **Search button** calls `palette-bus.ts`'s `requestPaletteOpen()` to open the command palette
  (`features/palette`) rather than owning any filter UI itself -- it's a button, not a live-filter
  input.
- **Row** (`SidebarRow.tsx`): a `<div role="option">`, not a `<button>` -- inline rename needs a nested
  `<input>`, which is invalid inside a real `<button>` and breaks the input's own typing/Space/focus.
  Enter/Space activation and focus styling are hand-rolled to match. Rename commits via
  `chat.updateProfile({chatId, name})` (the real host then emits its own `이름 변경됨: <name>` rename
  notice).
- **Context menu** (`SidebarRowMenu.tsx`): Pin/Unpin (`usePins().togglePin`), Rename (starts
  `SidebarRow`'s local rename state), **Edit Profile** (`useDialogs().openBotInfo` /
  `.openRoomInfo`, the same bot/room info panel the header's click target opens), **Hide from sidebar /
  Show in sidebar** (`chat.setHidden` -- this app's own addition, with no other UI surface for it
  anywhere else), **Open in herdr** for a bot (`bot.focus`), and **Delete**
  (`useDialogs().confirmDelete({id, name})`, a real confirmation).
  - **Important**: `SidebarRowMenu` is rendered as a **sibling** of the row's own div (see the
    `<>...</>` in `SidebarRow.tsx`), not nested inside it. `Popover`/`Menu` portal to `document.body`,
    but React replays event bubbling for a portaled subtree along the **React tree**, not the DOM tree
    -- a menu item nested inside the row's JSX would still fire the row's `onClick` (e.g. clicking
    "Pin" would also select/open that chat). Keep any future per-row floating UI as a sibling, not a
    child, of the clickable row element.
- **Hidden chats**: `order-chats.ts`'s `visibleChats()` drops `isHiddenFromSidebar` chats from the
  list **except** the currently active one (so hiding the chat you're looking at doesn't strand you --
  a deliberate design decision). The command palette is unaffected -- it searches
  the full, unfiltered `useChats()` list, so a hidden chat is still reachable via ⌘K.
- **"Pinned" section label**: shown above the pinned group (hidden in rail mode) -- a reasonable default
  for pinned section/ordering.
- **Rail mode** (`mode === "rail"`): search button, pinned-section label, and the header's "+" are
  conditionally not rendered (not just CSS-hidden); the "+" and a gear-only Settings icon move to the
  rail's own footer (`.hb-sidebar-rail-footer`), both plain icon buttons. The drag-strip
  header (44px, `hb-drag` + `hb-no-drag` on its own button) is shell-owned sizing/positioning is from
  `shell/useSidebarLayout.ts` -- this file only renders differently per `mode`.
- **Keyboard navigation**: the row list is `role="listbox"`, rows are `role="option"` with
  `tabIndex={0}`; ArrowUp/Down/Home/End move real DOM focus between rows (`list-nav.ts`'s `moveIndex`),
  same pattern as `primitives/Menu.tsx`. Enter/Space activates the focused row.

## Props

```ts
SidebarSlot({ mode: "expanded" | "rail" })
```

`mode` is shell-owned (see `shell/useSidebarLayout.ts`) -- don't duplicate the resize/rail-snap logic
here, just render differently per mode. The resize handle itself lives in `shell/AppShell.tsx` and is
mounted in both modes, so dragging it out from the collapsed rail past the snap threshold
(`shell/sidebar-width.ts`'s `resolveSidebarDrag`) expands back to a labeled sidebar, not just ⌘B
(`shell.toggleSidebar`) -- the same drag handle works both directions.

## Wired to `features/dialogs`

Every entry point into a dialog or panel goes through `useDialogs()` (`features/dialogs/useDialogs.tsx`)
directly, not a synthesized shortcut or a local stand-in:

- Header/footer/rail "+" -> `dialogs.openNewChatMenu()` (the quick-create landing, which is
  where "Create a new Bot" vs. "Create a group chat" actually get distinguished -- not at the "+" click
  itself).
- Settings button -> `dialogs.openSettings()`.
- Row context menu's Edit Profile -> `dialogs.openBotInfo(chat.id)` / `.openRoomInfo(chat.id)`.
- Row context menu's Delete -> `dialogs.confirmDelete({id, name})` (a real confirmation).

The palette's Actions tab (`features/palette/actions.ts`) calls `openNewBotDialog()`/`openNewRoomDialog()`
directly too, so "New bot" and "New room" are distinct actions there as well.

## Hooks to use (don't reach into `data/store/*` directly)

- `useChats()` -- every chat, sorted newest-activity-first.
- `useActiveChat()` -- `{ activeChatId, setActiveChatId }`, shared with the main column.
- `useChat(id)` / `useChatMembers(chat)` -- one chat / a room's resolved members.
- `useStatus(chat)` -- `{ dot, phrase, sidebarWaitingReason, presence }` (see `data/status.ts`).
- `usePins()` -- `{ pinnedChatIds, isPinned, togglePin }`, wired into `SidebarRowMenu`'s Pin/Unpin item.
- `useT()` -- `{ t, locale, setLocale }`. Add new keys to `./i18n.ts` (`en`/`ko`), never to
  `src/i18n/*` or another feature's file.
- `useDialogs()` -- `features/dialogs/useDialogs.tsx`, see "Wired to `features/dialogs`" above.

## Extension points

- **Shortcuts**: register any sidebar-specific shortcut with `useShortcut(id, combo, handler)` from
  `shell/ShortcutsProvider.tsx`.

## Tests

Pure logic this feature depends on already has `node --test` coverage: `data/status.ts`,
`data/room-avatar.ts`, `data/avatar-colors.ts`, `data/format-time.ts`, `shell/sidebar-width.ts`.
`order-chats.ts` (pinning/visibility) and `list-nav.ts` (roving-index arithmetic, shared
with `features/palette`) each have their own `renderer/test/sidebar-*.test.ts`.
