# Contributing to herdr-bot

Thanks for helping out. Bug reports, fixes, docs and translations are all welcome. This guide covers how
to get a working setup, how the code is laid out, and what a pull request needs before it can be merged.

Issues and pull requests can be written in English or Korean.

## Before you start

- **Bugs:** open an issue with the steps, what you expected, and what happened. Logs from the terminal
  that started the app help a lot.
- **Small fixes** (typos, an obvious bug, a missing translation): send a pull request directly.
- **Larger changes** (new features, changes to how rooms take turns, new providers, UI redesigns): open an
  issue first so we can agree on the approach before you spend time on it.
- **Security problems:** please don't open a public issue. Use
  [GitHub's private vulnerability reporting](https://github.com/speardragon/herdr-bot/security/advisories/new).

## Setup

You need macOS, Node.js 24 or newer and [herdr](https://herdr.dev) 0.9.0 or newer.

```bash
git clone https://github.com/speardragon/herdr-bot.git
cd herdr-bot
npm install
npm run check            # typecheck + every test; should pass on a clean checkout
```

Run the app:

```bash
npm run desktop:start    # build and start against your real herdr
npm run desktop:dev:fake # the full UI against a scripted fake herdr; no agents are started
```

For UI work, run the Vite dev server and point Electron at it:

```bash
npm run renderer:dev     # terminal 1
npm run desktop:dev      # terminal 2
```

### Keep your own bots safe while developing

The app keeps everything under `~/.herdr-bot` and runs bots in the herdr session `herdr-bot`. When you
test a change, give it a separate home and session so it can't touch the bots you actually use:

```bash
HERDR_BOT_HOME=/tmp/hb-dev HERDR_BOT_SESSION=herdr-bot-dev npm run desktop:start
```

## Project layout

| Path | What lives there |
|---|---|
| `core/` | The host: bots, rooms, turn-taking, herdr integration, transcripts and settings on disk |
| `cli/` | The `herdr-bot` command that bots (and you) use to talk to the host |
| `desktop/` | Electron main process, preload bridge and packaging |
| `renderer/` | The React UI |
| `scripts/` | Dev helpers, icon generation, release notes, the herdr plugin launcher |
| `docs/` | Images for the README and design notes |

A few things that are easy to miss:

- **TypeScript runs directly on Node 24.** Tests import `.ts` files without a build step, so only
  *erasable* syntax is allowed (no `enum`, no `namespace`, no parameter properties), and relative imports
  keep their `.ts` extension.
- **The UI is organized by feature.** `renderer/src/features/` holds the sidebar, command palette,
  conversation, composer and dialogs; each folder has a README describing what it owns and how it talks
  to the others. Shared building blocks live in `renderer/src/primitives/`, design tokens in
  `renderer/src/styles/tokens.css`, the app state and hooks in `renderer/src/data/`, and the window
  layout in `renderer/src/shell/`. The UI talks to the host only through `window.herdrBot`, documented
  in [`docs/app-api.md`](docs/app-api.md).
- **Keep logic testable.** Put state and formatting logic in small `.ts` modules without JSX or browser
  globals, so `node --test` can load them directly, and keep components thin.
- **UI strings are translated.** Each feature folder has an `i18n.ts` with matching `en` and `ko`
  catalogs; the compiler checks that both have the same keys. Both languages must read naturally —
  don't leave one as a literal copy of the other.
- **Try the UI without herdr.** `npm run renderer:dev` and open the printed URL with `?demo` to run the
  whole UI in a browser against in-memory demo data.

## Tests

Tests use the built-in `node:test` runner.

```bash
npm test                                   # everything
node --test core/test/turn-service.test.ts # one file
```

- Bug fixes come with a test that fails before the fix and passes after it.
- Host and CLI tests never need a real herdr. Use `core/test/helpers/fake-herdr.mjs`
  (`HERDR_BIN_PATH`) and the helpers next to it to script agent status, blocked prompts and panes.
- Use `core/test/helpers/temp-home.ts` for anything that touches disk, and clean up in `finally`.
- Avoid fixed sleeps; wait for a condition with `core/test/helpers/wait-for.ts`.

## Pull requests

1. Branch from `main`.
2. Keep each pull request to one topic. Refactors go in their own pull request.
3. Run `npm run check` before you push. CI runs the same command on macOS, plus a packaging smoke test.
4. For visible UI changes, add before and after screenshots, in light and dark mode if colors changed.
5. If users will notice the change, add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <what changed, in the imperative>

<optional body: why, and anything a reviewer should know>
```

Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.

Examples from the history:

```
fix: pin the restored chat's transcript to the latest message
feat: show a compact status line in the room presence strip
```

## Releases (maintainers)

Releases are cut from `main` and published by the [Release workflow](.github/workflows/release.yml).

1. Move the `## [Unreleased]` entries in `CHANGELOG.md` to a new `## [x.y.z] - YYYY-MM-DD` section and
   update the compare links at the bottom.
2. Set the same version in `herdr-plugin.toml` and every workspace:
   `npm version x.y.z --workspaces --include-workspace-root --no-git-tag-version`.
3. Commit as `chore: release x.y.z`, merge to `main`, then tag and push:
   `git tag vx.y.z && git push origin vx.y.z`.
4. The workflow checks that the tag matches `package.json`, runs `npm run check`, builds the arm64 and
   x64 DMGs, and publishes a GitHub release with notes taken from `CHANGELOG.md`. A tag such as
   `v1.1.0-beta.1` is published as a pre-release.

The app checks GitHub's latest release to tell users about updates, so a published release reaches
everyone who has the app open.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
