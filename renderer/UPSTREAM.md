# Upstream

Forked from https://github.com/b-nnett/grok-bot-0.18-reconstructed at commit `a9f633e09d49a85829b8236331b9e21f7e612634` (`frontend/` + 3 files from `source/shared`).

Local modifications are listed in docs/superpowers/plans/2026-09-08-herdr-bot-desktop.md (Global Constraints).

## Task 5 modifications

- `renderer/src/production/evidence.ts`: rebranded three `UI_TEXT` values (`copyright`, `feedbackIntroduction`, `title`) to `herdr-bot`.
- `renderer/src/production/runtime-assets.ts`: resolves runtime asset URLs against `renderer/public/assets` in both dev (`/assets/`) and production (relative to the emitted module).
- `renderer/src/recovered/features/conversation/cards/transcript-card/emoji-catalog.ts`: `loadShippedEmojiCatalog` now degrades to `EMPTY_EMOJI_CATALOG` instead of rejecting when the unshippable emoji data chunks fail to load.
- `renderer/public/assets/*` (18 files) + `scripts/make-placeholder-assets.mjs`: generated placeholder stand-ins for the hashed upstream assets (app icon, plugin logos, onboarding wallpaper), which are not redistributable.
