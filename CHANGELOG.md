# Changelog

All notable changes to herdr-bot are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-12

First public release.

### Added

- Desktop messenger for the coding agents running in herdr: every bot is a real agent CLI
  (Claude Code, Codex, Grok, OpenCode, Gemini and more) in its own herdr pane.
- Direct messages and rooms of up to six bots. Room members take turns in order — mentioned bots
  first, then the best fit for the topic, then join order — skip members that are still busy, and
  stop early when everyone passes. A burst ends after 3 rounds or 10 turns.
- Live status in the sidebar, chat header and the room's presence strip.
- Approval and question cards: a permission prompt or question an agent is stuck on can be
  answered from the chat.
- Bots can message another bot's DM or a room they belong to; hand-offs are shown inline and a
  loop guard stops two bots from ping-ponging.
- ⌘K command palette that searches chats, bots and the full text of every transcript.
- New Bot dialog with working folder, provider, model, reasoning level and permission mode, plus
  adopting an agent that is already running in herdr.
- Settings for language (Korean, English), appearance (light, dark) and defaults for new bots.
- Reactions, replies and mention chips that always show a bot's current avatar.
- `herdr-bot` command line for scripting the same host the app uses.
- macOS DMGs for Apple silicon and Intel (not yet code-signed), and an in-app check for new
  releases.
- herdr plugin manifest, so the app is listed in the herdr plugin index.

[Unreleased]: https://github.com/speardragon/herdr-bot/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/speardragon/herdr-bot/releases/tag/v1.0.0
