# features/dialogs

Owns every modal and slide-in panel: New bot/room (quick-create + Advanced form), Settings, bot info
panel (incl. the avatar color picker), room info panel (incl. member management -- designed fresh, see
"Gaps" below), delete confirmation, a relaunch confirmation, home-folder confirmation, and the
onboarding/empty-state quick-create flow.

## Entry points (call these, don't reach into this folder's internals)

```ts
import { useDialogs } from "../dialogs/useDialogs.tsx";

const dialogs = useDialogs(); // any component inside <DialogHost> (i.e. basically anywhere in the app)
dialogs.openNewChatMenu();       // quick-create landing (main column, not a modal)
dialogs.openNewBotDialog();      // Advanced form, Bot tab
dialogs.openNewRoomDialog();     // Advanced form, Room tab
dialogs.openSettings();
dialogs.openBotInfo(chatId);     // safe to call from the sidebar, a context menu, anywhere
dialogs.openRoomInfo(chatId);    // same
dialogs.confirmDelete({ id, name });
```

`openBotInfo`/`openRoomInfo` do **not** call `useInfoPanel()` directly -- `PanelHost` only wraps the main
column (see `shell/AppShell.tsx`), so a call site outside it (a sidebar row's context menu) would crash.
They write to `dialogs-store.ts`'s tiny module-singleton store instead; `DialogsPanelSync.tsx` (mounted
once inside `PanelHost`) is the only thing that turns that into a real `useInfoPanel().open(...)` call.

Shortcuts owned here (`DialogsSlot.tsx`, mounted once by `App.tsx`): **⌘N** new, **⌘,** settings, **⌘I**
toggle the info panel for the active chat (added so the panel is reachable independently of other call
sites that also use `useDialogs()` -- e.g. the header's click target, the sidebar's "Edit Profile" menu
item).

## Integration with `shell/AppShell.tsx`

1. `useMainColumnOverride()` governs the main column's render: `{mainOverride != null ? mainOverride :
   activeChatId == null ? <existing empty state/> : (...)}`. This is needed because both the "+"
   quick-create landing and the zero-bots onboarding card render directly **in the main column itself**,
   not a modal. The shell's own default "Select a chat" copy is untouched and still renders when neither
   override case applies.
2. `<DialogsPanelSync />` is the first child inside `<PanelHost>`, and `<BotOnboardingBanner
   chatId={activeChatId} />` sits right before `<HeaderSlot>`. Both render `null` most of the time; see
   above.

The sidebar's "New chat"/"New bot"/"New room"/"Settings" buttons (`features/sidebar`,
`features/palette`'s Actions tab) and the conversation header's info-panel click target
(`features/conversation/HeaderSlot.tsx`) call `useDialogs()` directly -- see those folders' READMEs for
the call sites.

## The two hosts (already wired, don't duplicate)

- **`useDialogHost()`** (`shell/DialogHost.tsx`) -- centered modal, wraps the whole app, safe to call
  from anywhere. Only one at a time (no stack) -- a second `.open()` while one is showing replaces it.
- **`useInfoPanel()`** (`shell/PanelHost.tsx`) -- the right-side sliding panel. Only wraps the main
  column; use `useDialogs().openBotInfo/openRoomInfo` instead of calling this directly from outside it.

## What's built

- **New menu** (`NewChatMenu.tsx`): quick actions (Create a new Bot / Create a group chat / Advanced
  setup) + every bot, ⌘1-⌘9. "Create a new Bot" swaps in `QuickCreateBot.tsx` (same component as
  onboarding) right there in the main column; the other two actions close this view and open the real
  `NewDialog.tsx` modal (there is no separate "minimal" room form; the Bot form only exists in its
  Advanced shape).
- **New dialog** (`NewDialog.tsx` + `NewBotForm.tsx`/`NewRoomForm.tsx`): Bot/Room tabs, provider picker
  with icons (`ProviderSelect.tsx`, Simple Icons SVGs from `public/provider-icons/`, a monogram badge for
  Grok which has none), working-directory field with live `directory.list` validation + suggestions
  (`DirectoryField.tsx`), model/reasoning selects gated by `provider-catalog.ts`'s capability flags,
  "adopt a running agent" (`AdoptAgentSection.tsx`, designed fresh since no UI entry point exists for it
  elsewhere), an inline home-directory confirmation step (not a nested dialog -- `DialogHost` has no
  stack, so this had to live inside the same form), and real inline host error display (`invalid_args`,
  `bot_exists`, `home_cwd_requires_confirmation`, etc. -- whatever `AppApiError.message` says).
- **Settings dialog** (`SettingsDialog.tsx`): Language/Appearance (commit immediately, no Save button),
  Defaults (working folder/provider/permission mode), app version + "Check for updates" (there's no way
  to force an "available" state for testing; both states are implemented from the `UpdateStatus` type,
  but only the non-available one has been visually verified).
- **Bot info panel** (`BotInfoPanel.tsx`): avatar + "Change color" popover (`ColorSwatches.tsx`, 11
  swatches, no shape picker), name/label/description (autosave on blur), Notifications toggle
  (`ToggleSwitch.tsx`, a feature-local control -- no `Switch` primitive exists), launch settings with a
  relaunch confirmation (`RelaunchConfirmDialog.tsx` -- **note**: launch-setting changes are not applied
  silently; a confirmation step is deliberate here), "Open in herdr" (`bot.focus`), a
  setup-in-progress/failed banner (`BotOnboardingBanner.tsx`), and delete. Adopted bots (`bot.adopted`)
  get their launch-settings section replaced with a note instead of dead controls.
- **Room info panel** (`RoomInfoPanel.tsx`): name/description (autosave), a Members section with per-
  member remove and an "Add" button (`AddMembersDialog.tsx`, reusing `MemberChecklist.tsx` from the
  creation form) -- **this entire section is designed from scratch**: `room.setMembers` exists but there
  is no other UI surface for it anywhere in the app.
- **Delete confirmation** (`DeleteConfirmDialog.tsx`): identical for bot/room; clears `activeChatId` if
  the deleted chat was open. Both info panels separately watch their own chat via `useChat(id)` and
  self-close (`useInfoPanel().close()`) the moment it disappears, so a delete triggered from *anywhere*
  (this dialog, a future sidebar context menu) closes an open panel on that chat.
- **Onboarding** (`OnboardingEmptyState.tsx` + `QuickCreateBot.tsx`): zero-bots main-column state, and the
  bot setup/failed-retry banner above. The EN button reads "Get started" (KO mirrors it, "시작하기").

## Known gaps

- **Room member management**: no UI surface existed anywhere else; designed fresh (see above). The
  6-member cap is enforced in both the creation form and the add-members dialog, client-side, mirroring
  the host's own `too_many_members` rejection.
- **"Hide" action**: `chat.setHidden` has no UI entry point in this folder -- it's the sidebar row context
  menu's own addition (`features/sidebar/SidebarRowMenu.tsx`), not a `useDialogs()` call.
- **"Update available" UI**: implemented but not visually verified (see Settings dialog above).
- **Edge case**: the onboarding card only shows when nothing is active (`activeChatId == null`, in
  `useMainColumnOverride.tsx`) -- an open room stays visible regardless of how many bots exist, even if
  the only bot was just deleted.

## Tests

`renderer/test/dialogs-forms.test.ts` -- pure logic, zero DOM: `provider-catalog.ts` (the 5 curated
providers + model/reasoning capability flags), `bot-form.ts` (name/cwd/home-confirmation validation,
adopt-mode bypass), `room-form.ts` (member cap toggle/validate), `quick-create-defaults.ts` (Settings
overlay on host defaults), `launch-settings-diff.ts` (touched-fields-only diffing, tri-state
model/reasoning clearing). 21 tests, all passing alongside the existing 407.
