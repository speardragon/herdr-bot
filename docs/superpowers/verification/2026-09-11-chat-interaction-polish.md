# Chat Interaction Polish — Verification Record

Plan: `docs/superpowers/plans/2026-09-11-chat-interaction-polish.md`
Implementation: Subagent-Driven Development, per-task TDD (failing test → minimal implementation → regression), each task gated by a spec + quality review and a scoped re-review of every fix round.

Baseline commit (pre-implementation WIP checkpoint): `8474869`
Head at verification: `64830b5`

> Scope note: Task 8 **Step 1** (automated static/build verification) was executed as part of the automated workflow and is recorded below with real results. Task 8 **Steps 2–5** require a live GUI app run, an installed `herdr` binary, fake-herdr UI interaction, and macOS input-method log observation — these are environment/human-owned and are **not yet run**. They are listed as PENDING with acceptance criteria; results must be filled in by a human operator. Per the plan, unrun checks are NOT pre-recorded as passing.

---

## Step 1 — Static / automated verification — DONE

### `npm run check` (typecheck + full `node --test`)
- **Result: PASS.** `tsc` across all 4 tsconfigs clean; **237/237** node:test pass, 0 fail, 0 skipped.
- Covers core, cli, desktop, and renderer test suites, including all tests added by Tasks 1–7.

### `npm run desktop:build` (renderer build + desktop tsc)
- **Result: PASS** (exit code 0). Renderer (vite/rolldown) built successfully; desktop `tsc -p tsconfig.json` completed with no errors.
- **Bundler warnings — pre-existing, NOT new regressions:**
  - `INEFFECTIVE_DYNAMIC_IMPORT` for several `src/recovered/features/conversation/cards/transcript-card/views/*.tsx` modules (dynamically imported by `transcript-card/resolver.ts` while also statically imported by `transcript-card/views/index.ts`). These files were not touched by this plan's tasks.
  - Chunk-size / code-splitting advisory warnings.
  - These warnings are present in the transcript-card card system, unrelated to the chat-interaction-polish changes.

### Branch commits (baseline `8474869` → head `64830b5`)
```
9e70976 fix: isolate herdr subscription retries from polling                    (Task 1)
d4d369b fix: reset subscription close dedup on every reconnect, lock start() no-op (Task 1 fix)
88ebe26 fix: acknowledge viewed chats independently of transcript cache          (Task 2)
ef3f0cc fix: resync cached chats on revisit and fix selection-ref ACK gate       (Task 2 fix)
960a1cc feat: show recent chats and independent bot activity indicators          (Task 3)
7add39a fix: extract activity-status derivation into bot-activity.ts, test runtimeStatus projection (Task 3 fix 1)
c5579ec test: de-flake status-mirror suite under parallel load                   (branch health)
7bd00fd fix: hide pin and section edit menus on the recent-order screen          (Task 3 fix 2, §2.2)
5be3a0f fix: render one flat recent-order list without pin or section grouping   (Task 3 fix 3, §2.2)
4de4e9f feat: provision bots asynchronously with an onboarding greeting          (Task 4)
53fa5bb fix: guard onboarding retry to failed bots and set the reserved profile name (Task 4 fix, §2.4)
a21670e feat: create chats from an inline header picker                          (Task 5)
1e8a578 fix: call the shared draft-model functions from NewChatHeader            (Task 5 fix)
4e004b2 feat: add avatars and prioritize everyone in mentions                    (Task 6)
d3b4e2b fix: reuse the composited group avatar for the everyone mention row      (Task 6)
64830b5 fix: start desktop with fresh assets at the intended window size         (Task 7)
```

### Requirement → task mapping (all seven confirmed-requirement areas)
| Requirement | Task(s) |
| --- | --- |
| Read state accurate on cache revisit / focus / active append (blue dot) | Task 2 |
| Single most-recent-order list; independent green activity dot | Task 3 |
| Header-based new-chat creation, no modal; group 2–6 + `채팅 시작` | Task 5 |
| Instant bot creation + automatic first greeting via real agent | Task 4 (+ Task 5 send-gating) |
| Mention UI with avatars + prioritized "everyone/전체" | Task 6 |
| Default window 1040×760 (min 512×520); `desktop:start` builds both bundles | Task 7 |
| herdr subscription-retry stability (retry isolation, pane_not_found fallback) | Task 1 |

---

## Step 2 — Fake-herdr UI scenarios — PENDING (human/GUI)

Run `npm run desktop:dev:fake` and follow the script's server-connection instructions. Inject A/B bots + group events, working/done, failure/reconnect. Fill PASS/FAIL + evidence for each row. Add only the needed fake scenarios to `scripts/dev-fake-herdr.mjs`.

| Scenario | Pass condition | Result |
| --- | --- | --- |
| Receive in B, then revisit cached B | B on top; blue dot cleared on entry; still read after relaunch | |
| Receive in current chat while window inactive | Blue dot stays; cleared on focus-return + load | |
| Select B while A open request in flight | Late A response does not change B's screen/read state | |
| working + unread simultaneously | Bottom-right green + row-trailing blue shown together | |
| working → done | Green until 4,999ms, removed at 5,000ms | |
| Re-enter working during done afterglow | Prior timer does not clear the new working dot | |
| `+` and header selection | No modal; one temp row; input focus; two create actions | |
| Group 6 chips | Wrap/delete/keyboard; dropdown not clipped off-screen | |
| New bot initial creation | Profile shown immediately; clear provisioning state; one greeting; no user bubble | |
| Setup failure / retry | Same bot id kept; no duplicate pane/greeting | |
| @ list | Everyone first; avatar + name aligned; 32px rows; Enter selects without mis-send | |
| ko/en × light/dark × 1040×760 | Input/chip/icon alignment, contrast, dropdown placement correct | |
| 512×520 minimum size | No header/composer overlap; member list scrolls | |

## Step 3 — Installed-herdr read-only facts — PENDING (human)
`herdr --version`; `herdr --session herdr-bot agent list`; `herdr --session herdr-bot agent get w5:p1`. Record whether the pane exists / is stale; if CLI resolves but the socket rejects, compare host-resolved session/socket vs the CLI runner's session and `HERDR_SOCKET_PATH` override; also send a `pane.get` read over the socket for the same pane id and record the API code. Limit recorded config to session/socket/ID; do not dump the environment or tokens. Do not delete agents/panes or recreate the user session.

## Step 4 — Live app, ≥2 min log observation — PENDING (human)
`npm run desktop:start`. Expect no repeated warns in steady state; on pane-absence reproduction, one warn + polling recovery + 30/60/120s bounded retries; on app quit, host releases app-owned timers/sockets; do not kill the shared herdr session or other agents. Real new-bot creation / model calls: only within the user's approval, one test bot, cost/target disclosed first.

## Step 5 — macOS input-method log separation — PENDING (human)
Record OS/Electron versions. Exercise Korean composition, ko↔en switch, Caps Lock, window blur/focus, mention Enter. Match any input loss/stall/crash to log timestamps. If no real fault, record the observed non-fatal diagnostics (do not hide them). If a real fault exists, produce a minimal repro + a separately-proposed Electron fix — do not blanket-suppress stderr or upgrade Electron unconditionally.

---

## Deferred minors and parked items (for merge triage)
The SDD ledger (`.superpowers/sdd/2026-09-11-chat-interaction-polish/progress.md`) records the per-task deferred minors and parked rulings. Highlights the final whole-branch review should triage:
- Task 2: `canAcknowledge` `loaded` arg hardcoded true at the prod call site; `ensureMigrated` writes `{0,0,0}` on first touch of a brand-new chat; no DOM-level test of `resyncCachedChat` in-component wiring (repo has no DOM harness).
- Task 3: dead `sidebarSections`/`projectedSidebarSections` memos in `ProductionRenderer` after the flat-list switch.
- Task 4: retry-after-`needs_setup` orphans the kept pane; `create()`/`retry()` reset an instance-wide `#stopped`; locale-validation error uses `invalid_bot_id` code.
- Task 5: duplicate assertion in `room-store.test.ts`; `setQuery` doesn't reset `activeIndex` on query change; `"Setting up…"` string only inline (not in `locale.ts` map); `makeClientNonce` fallback isn't UUID-shaped (group-create would throw on a runtime lacking `crypto.randomUUID` — unreachable in Electron/Node 24).
- Task 6: `.ts`-extension import specifiers (renderer `tsconfig` `allowImportingTsExtensions` + two source files) are the only such usages in the tree — apply everywhere or use a loader flag; per-keystroke avatar-root teardown/recreate churn (bounded, watch in Step 2).

No load-bearing findings were parked; no task was left BLOCKED.
