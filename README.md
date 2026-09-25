# herdr-bot

[한국어](README.ko.md)

A macOS app for talking to the agents running in herdr the way you talk to a [Grok Bot](https://x.ai/bot).

![A chat where a bot asks a question and offers choices](docs/images/chat.png)

Grok Bot is a messenger for treating bots like teammates and handing work to more than one of them. herdr-bot brings that feel onto herdr. Each bot is an agent inside a herdr pane (claude, codex, grok…), and a message in the chat becomes that agent's prompt.

There is no cloud computer, and no sign-in or billing inside the app. It uses the agent CLIs you have already logged into, and the herdr that is already running. This is not Grok Bot. It is a local app that takes Grok Bot's way of talking as its reference.

## The app

### Hand off work in a messenger

The sidebar stacks each bot's face, last line, time, and unread mark. In the thread a bot may ask first, or offer answers you can pick. The composer below attaches files and `@`-mentions the bots in that room. Enter sends. Shift+Enter breaks the line. A mention chip always shows that bot's current avatar, not a snapshot from when the message was sent — edit a bot's avatar later and every past mention of it picks up the change, including after you close and reopen the chat.

### Narrow it down to icons

![A collapsed sidebar: avatars, plus a new-bot button and settings](docs/images/rail.png)

Drag the sidebar between 240px and 400px. Push past the minimum and it snaps to an avatar rail. Pull back out and the list returns. ⌘B toggles the same rail. Under the rail there is only New bot and Settings.

### Make a bot, or adopt one that is already up

![A menu for a new Bot, a group chat, or an existing bot](docs/images/new-chat.png)

`+` starts a new Bot or a group chat. A new Bot can launch a fresh herdr agent, or adopt an agent already running in that session. A group holds up to six bots in one room. Launch settings — provider, model, reasoning effort — only apply when herdr-bot starts the agent itself; an adopted process was already running before herdr-bot knew about it, so those fields are disabled for it and cannot be set or changed after the fact.

### Settings are language and appearance

![Settings for language and appearance](docs/images/settings.png)

Korean is the default. English is available. Light and dark are saved. There is no Plugin menu and no account screen. Outside tools stay with each agent's own CLI and MCP setup.

## What you can do

- **Direct chats.** Every bot has a thread. What you send goes to that bot's herdr agent.
- **Groups.** Bots answer in a round robin. `@name` calls only that bot. One burst is at most 3 rounds and 10 turns.
- **Personas.** Edit a bot's name and what it is for. Open a room's name to add or remove members. Chats can be pinned.
- **The herdr session.** Bots come up in the `herdr-bot` session by default. See their panes with `herdr session attach herdr-bot`. Set `HERDR_BOT_SESSION=default` to use the main session.

## Getting started

herdr 0.9.0 or newer must be running, and Node must be 24 or newer. The agent CLIs you want as bots need to be logged in already.

```bash
npm install
npm run desktop:start
```

`npm run desktop:dev:fake` runs the UI against a fake herdr. `npm run desktop:package` builds the app bundle.

From the terminal only:

```bash
node cli/src/main.ts serve
node cli/src/main.ts bot create reviewer --name Reviewer --kind claude --cwd ~/repo
node cli/src/main.ts room create "auth refactor" --members reviewer
node cli/src/main.ts send <room-id> "Start with the cause of the login bug"
node cli/src/main.ts read <room-id>
```

## How a message becomes work

A bot is a named agent that herdr recognizes inside a pane. Launching one calls `herdr agent start`. Adopting one that is already up calls `herdr agent rename`. Every call goes to that session with `herdr --session <HERDR_BOT_SESSION>`.

When a message lands in a room, the host runs the turns. Each turn is `herdr agent prompt <bot> … --wait`. The only way a bot speaks in a chat is the herdr-bot CLI (`say` / `message`). Output printed in the terminal never shows up in the chat.

`say` and `message` answer different questions: `say` always replies in the chat whose turn is currently open — the one that just prompted the bot. `message` reaches into a different chat, for a bot that wants to hand work to another bot's DM or post into a room while its own turn is elsewhere. A bot can `message` a room only if it is already a member of that room; messaging a room it does not belong to fails with `not_a_member` and nothing is added to any transcript.

```bash
herdr-bot bot create reviewer --cwd /work/repo --kind codex --model gpt-5.4 --reasoning high
herdr-bot message researcher "Please inspect the failing parser test."
herdr-bot message room-release "Parser review is complete."
```

Transcripts are JSONL under `~/.herdr-bot/`. Move them with `HERDR_BOT_HOME`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `HERDR_BOT_HOME` | `~/.herdr-bot` | State root |
| `HERDR_BIN_PATH` | `herdr` | herdr binary |
| `HERDR_BOT_SESSION` | `herdr-bot` | herdr session the bots run in. `default` uses the main session |
| `HERDR_BOT_SOCKET_PATH` | the session's `herdr.sock` | herdr event subscription. `HERDR_SOCKET_PATH`, which a pane injects, points at that pane's session and is ignored |
| `HERDR_BOT_USER_NAME` | the OS user name | Name shown in a room |
| `HERDR_BOT_TURN_TIMEOUT_MS` | `180000` | How long to wait for one bot turn |
| `HERDR_BOT_DEFAULT_KIND` / `HERDR_BOT_DEFAULT_CWD` | `claude` / `$HOME` | Defaults when creating a bot |

## Development

```bash
npm run check
```

The UI is a fork of the grok-bot 0.18 renderer. What was kept and what changed is in `renderer/UPSTREAM.md`. This is a personal build. Icons and emoji data from the original bundle are not included.

The app icons (`desktop/build/icon.icns`, `icon.png`) are made from `desktop/build/icon-source.jpg`. The background is removed, the logo is cropped, and it is fitted to the macOS icon grid (a 1024 canvas, an 824 mark, 100px of margin on every side).

```bash
pip install pillow
python3 scripts/make-app-icon.py
iconutil -c icns desktop/build/herdr-bot.iconset -o desktop/build/icon.icns
rm -rf desktop/build/herdr-bot.iconset
```
