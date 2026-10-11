# herdr-bot app API

This is the contract between herdr-bot's host (`core/`) and its UI: a small RPC + event protocol
designed around exactly what herdr-bot itself needs.

## Architecture

```
core/src/app-api/
  types.ts                shared request/response/event types -- zero imports, renderer-safe
  errors.ts               AppApiError + the error code union -- zero imports, renderer-safe
  client.ts                createAppClient(transport) -- zero imports, renderer-safe
  in-memory-transport.ts  createInMemoryTransport(server) -- for tests, and anywhere a renderer and
                           host share a process
  mapping.ts              Host domain objects -> wire types (server-only)
  handlers/*.ts           one method handler per domain (server-only)
  server.ts               createAppApiServer(host) -- the method table + HostEvents -> AppApiEvent bridge
  index.ts                barrel (server-side; do not import this from a renderer)
```

A UI only ever touches `types.ts` and `client.ts` (plus `in-memory-transport.ts` in tests). Everything
else imports `core/src/host.ts` and is not meant to run in a browser/renderer bundle.

## Transport: Electron ipc, not a MessagePort

The transport is built directly on Electron's own ipc primitives rather than a custom MessagePort
protocol with its own handshake and framing:

- **One `ipcRenderer.invoke` channel** (`herdr-bot:api-call`) for every app-api call. Electron already
  correlates each `invoke` with its reply; there is no handshake to get wrong, no `requestId` map to
  maintain, and it works unmodified through `contextBridge`.
- **One `webContents.send` channel** (`herdr-bot:api-event`) carrying every event, each with a
  host-assigned, monotonically increasing `seq` (see "Events" below).
- **Desktop-only features get their own pair of channels** (`herdr-bot:desktop-call` /
  `herdr-bot:desktop-event`, plus one `sendSync` channel for the theme's first paint) so the app-api
  layer stays host-only and transport-agnostic -- a future transport (a different IPC mechanism, a
  socket to a remote host, a test harness) only has to implement `AppApiTransport`
  (`call`/`subscribe`), not Electron-specific window chrome.
- **No cancellation.** Every call here either finishes quickly or is naturally idempotent to retry
  (e.g. `bot.quickCreate`/`room.create` accept a client-minted `requestId`/retry key), so a `cancel`
  frame would add protocol surface without a real use -- nothing needs to abort in-flight host work.

**Error codes survive the ipc boundary deliberately.** Electron's `invoke` does not preserve a thrown
Error's custom properties -- only `.message` survives, remapped into a new Error on the renderer side.
Since a UI needs to branch on `AppApiError.code` (e.g. `home_cwd_requires_confirmation` needs a
different dialog than `bot_not_ready`), the main-process handler never throws across the boundary: it
always resolves with `{ ok: true, value } | { ok: false, error: { code, message } }`
(`desktop/src/app-api-bridge.ts`'s `callAppApi`), and the preload's `call()` unwraps that back into a
resolve/throw pair matching `AppApiTransport`'s contract.

## Client usage

```ts
import { createAppClient } from "core/src/app-api/client.ts";

// Desktop: window.herdrBot.api already implements AppApiTransport.
const client = createAppClient(window.herdrBot.api, {
  onResyncNeeded: () => refetchEverything(), // see "Events" below
});

const chats = await client.call("chat.list", undefined);
const unsubscribe = client.subscribe("chat.changed", (event) => {
  console.log("chat updated:", event.payload.id, "seq", event.seq);
});
```

A minimal React hook built on it:

```tsx
function useChatList() {
  const [chats, setChats] = useState<ChatSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    client.call("chat.list", undefined).then((list) => { if (!cancelled) setChats(list); });
    const unsubscribeList = client.subscribe("chat.listChanged", (e) => setChats(e.payload));
    const unsubscribeOne = client.subscribe("chat.changed", (e) => {
      setChats((prev) => {
        const index = prev.findIndex((c) => c.id === e.payload.id);
        if (index < 0) return prev;
        const next = [...prev];
        next[index] = e.payload;
        return next;
      });
    });
    return () => { cancelled = true; unsubscribeList(); unsubscribeOne(); };
  }, []);

  return chats;
}
```

Tests (and anything else that wants the client without a real transport) use
`createInMemoryTransport(createAppApiServer(host))` -- see `core/test/app-api/e2e.test.ts` for the full
pattern (boot a `Host` against the fake herdr binary, drive it entirely through the client).

## Method reference

Every method is `client.call("<name>", params)`. `params: void` methods are called with `undefined`.
All errors reject with an `AppApiError { code, message }` (see "Error codes").

### Chat (`chat.*`)

| Method | Params | Result |
|---|---|---|
| `chat.list` | `void` | `ChatSummary[]` -- every bot DM and room |
| `chat.search` | `{ query?: string }` | `ChatSummary[]` -- case-insensitive substring match on name/description |
| `chat.updateProfile` | `{ chatId, name?, description?, title?, avatarShape?: string\|null, avatarColor?: string\|null }` | `ChatSummary \| null` |
| `chat.setUnread` | `{ chatId, isUnread: boolean }` | `void` |
| `chat.markRead` | `{ chatId, throughSeq: number }` | `{ lastReadSeq: number }` -- the **only** way to clear `hasUnread`; paging a transcript never does |
| `chat.setHidden` | `{ chatId, isHidden: boolean }` | `void` |
| `chat.setNotifyOnUpdates` | `{ chatId, isEnabled: boolean }` | `ChatSummary \| null` |
| `chat.delete` | `{ chatIds: string[] }` | `{ deletedIds: string[] }` -- deletes bots and/or rooms by id |

`title` is a bot-only free-text label (rooms ignore it); `avatarShape`/`avatarColor` accept `""` to
reset to the default persona mark (distinct from omitting the field, which leaves it unchanged).

### Transcript (`transcript.*`) and messages (`message.*`)

| Method | Params | Result |
|---|---|---|
| `transcript.page` | `{ chatId, limit?: number = 200, beforeSeq?: number }` | `TranscriptPage` -- backward pagination by `seq` |
| `transcript.thread` | `{ chatId, rootId }` | `{ entries: TranscriptEntry[] }` -- the root plus every reply to it |
| `message.send` | `{ chatId, text, richText?, replyTo?, attachmentPaths?: string[], clientNonce? }` | `{ entryId }` |
| `message.react` | `{ chatId, entryId, emoji }` | `{ entry: TranscriptEntry \| null }` -- toggles the reaction |
| `message.search` | `{ query?: string }` | `MessageSearchHit[]` -- full-text over every chat's message bodies (up to 50 hits, newest first); distinct from `chat.search`, which only matches names |

`TranscriptEntry` is open-ended (`{ id, kind, seq, timestampMs, ...rest }`), mirroring the host's storage
format. Common `kind`s:
- `"message"` -- a user message: `content`, `author: {id,name}`, optional `richText`, `replyTo`, `reactions`.
- `"send-message"` -- a bot reply: `message: { type: "text", content }`, `author`.
- `"notice"` -- a system notice: `content`.
- `"prompt"` -- an inline approval/question card: `prompt: PendingPrompt`, `status: "pending"|"answered"|"resolved"|"superseded"`.

### Bots (`bot.*`)

| Method | Params | Result |
|---|---|---|
| `bot.create` | `CreateBotParams` (below) | `{ chat: ChatSummary }` |
| `bot.quickCreate` | `{ requestId: string (uuid), locale: "ko"\|"en", name?, avatarColor? }` | `{ chat: ChatSummary }` -- reserves instantly; spawn/brief/greeting finish in the background (`chat.bot.onboarding.stage` tracks progress via `chat.changed`) |
| `bot.retrySetup` | `{ botId }` | `{ chat: ChatSummary }` -- only from a `failed` onboarding stage |
| `bot.updateLaunchSettings` | `{ botId, cwd?, permissionMode?: "ask"\|"auto"\|null, model?: string\|null, reasoningEffort?: Reasoning\|null, allowHomeCwd? }` | `{ chat: ChatSummary }` -- relaunches the bot's agent |
| `bot.focus` | `{ botId }` | `void` -- focuses the bot's pane in herdr |
| `bot.listAdoptable` | `void` | `AdoptableAgent[]` -- herdr agents not already a known bot |
| `bot.listModels` | `{ provider: string }` | `ModelCatalogResult` |
| `bot.defaults` | `void` | `BotDefaults` -- `{ cwd, provider, permissionMode, homeDir }`, for the New Bot dialog |

`CreateBotParams`: `{ name, id?, description?, provider?, cwd?, permissionMode?, model?, reasoningEffort?,
avatarShape?, avatarColor?, adoptPaneId?, allowHomeCwd? }`. Set `adoptPaneId` to adopt an existing herdr
pane as this bot instead of spawning a new one (an adopted bot has no `bot.updateLaunchSettings` of its
own after that).

`cwd`/`allowHomeCwd`: if the resolved working directory is exactly the user's home directory,
`bot.create`/`bot.updateLaunchSettings`/`bot.quickCreate` all reject with
`home_cwd_requires_confirmation` unless `allowHomeCwd: true` is passed -- surface a confirmation dialog
rather than setting it unconditionally.

`model`/`reasoningEffort`/`permissionMode` are tri-state on `bot.updateLaunchSettings`: omit the field to
leave it unchanged, or pass an explicit `null` to clear it. For `permissionMode`, "clear" means reset to
the host's current effective default permission mode (`bot.defaults().permissionMode` --
`AppSettings.defaultPermissionMode` if set, else `"ask"`) rather than pinning this bot to its own
explicit mode -- i.e. "use the agent's own default approval policy". (`bot.create`/`CreateBotParams` has
no such distinction -- omitting `permissionMode` there already means exactly this, since the bot has no
prior mode of its own to keep.)

### Rooms (`room.*`)

| Method | Params | Result |
|---|---|---|
| `room.create` | `{ name, description?, memberIds: string[], requestId?: string }` | `{ chat: ChatSummary }` -- idempotent on a retried `requestId` |
| `room.setMembers` | `{ roomId, memberIds: string[] }` | `ChatSummary \| null` |

Renaming/hiding/deleting a room reuses `chat.updateProfile` / `chat.setHidden` / `chat.delete`.

### Prompts (`prompt.*`)

| Method | Params | Result |
|---|---|---|
| `prompt.answer` | `{ botId, signature, action: "option"\|"text"\|"next"\|"cancel", key?, text? }` | `{ chat: ChatSummary }` |

`signature` is the `PendingPrompt.signature` the card was rendered from (from `chat.bot.pendingPrompt`
or a `"prompt"` transcript entry) -- a stale signature fails with `prompt_changed` so the UI re-renders
from the fresh result instead of pressing keys into a form that already moved on. `action: "option"`
needs `key`; `"text"` needs `text`; `"next"` only applies to a multi-select question; `"cancel"` always
applies.

### Search, directories, settings, identity, status

| Method | Params | Result |
|---|---|---|
| `directory.list` | `{ path?: string }` | `DirectoryListing { exists, isHome, entries }` -- folder autocomplete for the cwd field; `isHome` flags exactly the user's home directory |
| `settings.get` | `void` | `AppSettings` |
| `settings.update` | `Partial<AppSettings>` | `AppSettings` -- an explicit `null` clears a field; an absent key leaves it |
| `identity.get` | `void` | `{ userName: string }` |
| `host.status` | `void` | `HostStatusSummary { home, session, bots, rooms, runningChatIds }` |

`AppSettings = { defaultWorkingFolder: string\|null, defaultProvider: string\|null, defaultPermissionMode:
"ask"\|"auto"\|null }` -- the defaults a New Bot dialog/quick-create falls back to.

## Events

Every event carries `{ seq, type, payload }`. `seq` is a single counter shared across every event
type (not per-chat) -- a client tracks the last `seq` it saw and, if the next one is not exactly
`lastSeq + 1`, knows it missed something (a dropped ipc message, a reconnect). **There is no replay
buffer.** `createAppClient`'s `onResyncNeeded` option fires exactly on that gap; the correct response is
to re-fetch `chat.list` and any open `transcript.page`, not to try to patch around the hole.

| Event | Payload | Fires when |
|---|---|---|
| `chat.listChanged` | `ChatSummary[]` | The roster shape changed (chat created/deleted, room membership changed) -- treat as the new source of truth, not a patch |
| `chat.changed` | `ChatSummary` | One chat's summary changed -- new message, read state, profile edit, launch settings, status/presence, pending prompt, onboarding stage, etc. |
| `transcript.entryAppended` | `{ chatId, entry: TranscriptEntry }` | A new transcript entry was stored |
| `transcript.entryUpdated` | `{ chatId, entry: TranscriptEntry }` | An existing entry was rewritten (a reaction toggled, a prompt card's status changed) |

Presence/status (`working`/`idle`/`blocked`/`needs approval`/`late`/`held`/`stale`) is not a separate
event family -- it is carried on `ChatSummary.bot.status`/`awaitingUserResponse`/`pendingPrompt` and
pushed via `chat.changed`, and on individual entries' marker fields (`late`, `staleFor`, `answersHeld`)
pushed via `transcript.entryUpdated`/`entryAppended`.

## Error codes

Every rejection is `AppApiError { code, message }`. Domain codes pass through from the host's own
`RosterError`/`PromptError` unchanged (snake_case, matching herdr-bot's existing control-socket
convention) rather than inventing a parallel vocabulary:

- `invalid_args`, `unknown_method`, `internal` -- transport/protocol-level
- `invalid_bot_id`, `bot_exists`, `unknown_bot`, `unknown_room`, `unknown_chat`, `too_many_members`,
  `unsupported_kind`, `invalid_launch_options`, `herdr_error`, `bot_not_ready`, `missing_cwd`,
  `home_cwd_requires_confirmation` -- roster/bot/room errors
- `not_blocked`, `prompt_changed`, `invalid_answer`, `answer_in_flight` -- `prompt.answer` errors

## Desktop extras (`window.herdrBot`)

Preload (`desktop/src/preload.cts`) exposes exactly one object, `window.herdrBot`, covering both the
app-api client's transport and every desktop-only feature:

```ts
window.herdrBot = {
  api: { call, subscribe },               // AppApiTransport -- pass to createAppClient
  platform: NodeJS.Platform,
  isDev: boolean,
  theme: {
    initial: { preference, resolved },    // read synchronously at preload load, before first paint
    get(), set(preference), onChanged(listener),
  },
  locale: { initial: null, get(), set(locale), onChanged(listener) },
  window: {
    minimize(), toggleMaximize(), close(),
    getState(), onStateChanged(listener),
    resizeWidth(deltaWidth),
    getZoomFactor(),                      // synchronous, renderer-side (webFrame), no ipc
    onZoomChanged(listener),
  },
  openExternal(url),
  pickDirectory(defaultPath?),            // native folder picker
  pickAvatarFile(),                       // native image picker -> { dataUrl, fileName } | null
  attachments: {
    stage(filename, bytes), commit(paths), discard(path),
    resolveMedia(source), readText(path), readBytes(path, maxBytes), download(path, suggestedName),
  },
  version: { get(), update: { getStatus(), check(), onStatusChanged(listener) } },
  onboarding: { getSeen(), setSeen(seen) },
  pins: { get(), set(chatIds) },          // pinned-chat ids -- a desktop-local UI preference, not host state
};
```

Backing modules: `desktop/src/app-api-bridge.ts` (the `api` half), `desktop/src/desktop-bridge.ts` (theme/
locale/window/openExternal/version/onboarding/pins, reusing `desktop/src/attachments.ts` for the
attachments handlers and `desktop/src/version-check.ts`'s pure version comparison for the update check).

Theme/locale/onboarding-seen/pinned-chat-ids persist via `desktop/src/settings-store.ts` (a flat JSON
file at `<userData>/herdr-bot-desktop.json`). `update.check` does a live GitHub
releases lookup (`speardragon/herdr-bot`); "Update Track" and "auto-update when idle" are permanently
inert (no code-signing certificate makes a silent background install non-viable -- "Check for Updates"
just compares versions and opens the release page for a manual download).

The single-instance lock, userData pinning, window show/hide-on-close, and login-shell PATH merging in
`desktop/src/main.ts` are independent of the UI<->host connection described here.

## Not mapped / left for a follow-up

An "avatar image" (as opposed to the existing shape+color persona mark) has no backing host field
today -- `pickAvatarFile()` can hand a UI a `dataUrl`, but there is nowhere on `BotProfile`/`RoomConfig`
to persist it yet. Adding that is a small, well-scoped follow-up (a new `avatarImageDataUrl` field
threaded through `ProfileStore`/`RoomStore`/`RosterService`/`AgentSummary`), deliberately left out of
this API for now to keep its surface small.
