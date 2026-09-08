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
