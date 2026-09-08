# herdr-bot Core (host + CLI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** herdr 위에서 돌아가는 코딩 에이전트(claude/codex/grok CLI)들을 "봇"으로 등록하고, grok-bot 방식의 단체방(라운드로빈 턴, @멘션, pass)에서 사용자와 봇들이 대화하며 목표를 달성하게 하는 **헤드리스 호스트**와 봇이 방에 말할 때 쓰는 **`herdr-bot` CLI**를 만든다. UI(Electron 앱)는 별도 플랜(`2026-09-08-herdr-bot-desktop.md`)이며, 이 플랜의 호스트가 노출하는 coordinator 메서드 테이블을 그대로 소비한다.

**Architecture:** 봇 = herdr가 pane 안에서 감지하는 이름 붙은 에이전트(`herdr agent start <id>`로 스폰하거나, 이미 돌고 있는 에이전트를 `herdr agent rename`으로 채택). 방(room) = 봇 id 목록을 가진 그룹. 사용자가 방에 메시지를 보내면 호스트가 grok-bot에서 이식한 `GroupChatOrchestrator`(최대 3라운드·10발언·라운드로빈·@멘션 응답자 선택)를 돌리고, 각 멤버 턴은 `herdr agent prompt <id> "<턴 프롬프트>" --wait`로 pane에 전달한다. 봇이 방에 말하는 **유일한** 채널은 `herdr-bot say <room> "<text>"`(grok-bot의 SendMessage 도구에 해당)이며, 이 CLI는 호스트의 로컬 유닉스 소켓(`~/.herdr-bot/host.sock`)에 NDJSON 요청을 보낸다. 호스트는 파일(`~/.herdr-bot/bots/*`, `rooms/*`, JSONL 트랜스크립트)의 단일 작성자이고, 봇 상태는 `herdr agent list`(진실) + herdr 소켓 이벤트(트리거)로 미러링한다. 렌더러(그록봇 UI)가 부르는 coordinator 메서드(`listAgents`, `sendPrompt`, `openAgentTail`, …)는 이 호스트 안의 디스패처가 구현한다.

**Tech Stack:** Node ≥ 24 (로컬 24.18.0), TypeScript 7.0.2 — **erasable syntax만** 써서 `node --test`가 `.ts`를 빌드 없이 직접 실행(타입 스트리핑). 런타임 의존성 0 (node:net, node:fs, node:child_process, node:test, node:assert). herdr 0.9.0 CLI(`HERDR_BIN_PATH`) + herdr 소켓 API(`events.subscribe`만 raw 소켓 사용).

## Global Constraints

- **Node ≥ 24.0.0.** `node --version`이 24 미만이면 중단. `.node-version` = `24`.
- **Erasable TypeScript only** (Node 타입 스트리핑 규칙): `enum`, `namespace`, 생성자 파라미터 프로퍼티(`constructor(readonly x: T)`), `import x = require()` **금지**. 타입만 쓰는 import는 반드시 `import type` 또는 `import { type X }`. 상대 import는 확장자까지 적는다: `from "./foo.ts"`. tsconfig에 `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `rewriteRelativeImportExtensions` 켜져 있음.
- **테스트 러너:** `node --test` (node:test + node:assert/strict). 실행은 항상 레포 루트 `/Users/goorm/Desktop/ray/workspace/herdr-bot`에서 `npm test` 또는 `node --test "core/test/**/*.test.ts"`. pytest/vitest 등 설치 금지.
- **런타임 의존성 0** (core, cli). devDependencies는 `typescript@7.0.2`, `@types/node@^24`만.
- **herdr 접근은 `core/src/herdr/cli.ts`(CLI 래퍼)와 `core/src/herdr/socket.ts`(구독 전용)로만.** 다른 모듈에서 `child_process`로 herdr 직접 호출 금지. 테스트는 `HERDR_BIN_PATH`에 가짜 바이너리(`core/test/helpers/fake-herdr.mjs`)를 주입한다. 실제 herdr는 마지막 태스크(라이브 E2E)에서만 건드린다.
- **상태 루트:** `$HERDR_BOT_HOME` (기본 `~/.herdr-bot`). **모든 테스트는 임시 디렉터리를 `HERDR_BOT_HOME`으로 넘긴다.** 실제 `~/.herdr-bot` 오염 금지. 유닉스 소켓 경로 길이 제한(macOS 104바이트) 때문에 테스트 임시 홈은 `mkdtempSync(join(tmpdir(), "hb-"))`처럼 짧게 만든다.
- **파일은 호스트만 쓴다.** CLI는 파일을 직접 읽거나 쓰지 않고 항상 호스트 소켓에 요청한다(락 불필요).
- 봇 id = herdr 에이전트 이름 규칙 `^[a-z][a-z0-9_-]{0,31}$`, 라이브 에이전트 중 유일, `room-` 접두사 금지. 방 id = `room-<slug>-<hex4>`.
- grok-bot 상한 상수 그대로: `GROUP_MAX_ROUNDS=3`, `GROUP_MAX_MEMBER_TURNS=10`, `GROUP_MAX_MESSAGES_PER_TURN=2`, `GROUP_MAX_MEMBERS=6`, `GROUP_PROMPT_HISTORY_LIMIT=24`.
- 프롬프트 안의 `herdr-bot` 경로는 항상 **절대경로** `$HERDR_BOT_HOME/bin/herdr-bot` (PATH 의존 금지).
- 봇 프롬프트 전달은 `herdr agent prompt … --wait`만 사용. `pane run`/`send-text`로 프롬프트 넣지 않는다(agroup 시절의 멀티라인 해킹은 herdr 0.7.5+에서 불필요).
- 파일 ≤ 400줄, 함수 ≤ 50줄, 뮤테이션 대신 스프레드. `console.log` 금지(로그는 `core/src/log.ts`의 `log()`가 stderr로 씀).
- 커밋은 conventional commits(`feat:`, `test:`, `chore:`, `docs:`), 태스크마다 최소 1커밋. 첫 태스크에서 `git init`.
- 한국어 문서, 코드/명령/식별자는 영어. 도구 파라미터의 한글은 리터럴 UTF-8.
- **grok-bot 레포 라이선스 주의:** `NOTICE.md`는 "No upstream source-code license is asserted or granted"라고 명시한다. 이 코어 플랜은 grok-bot에서 **순수 함수 로직(group-chat.ts, orchestrator, coordinator 프레임 프로토콜)만 재구현**하며 파일을 그대로 복사하지 않는다. 배포 전 권리 검토는 사용자 책임(데스크톱 플랜 참조).

---

## 배경: 구현자가 알아야 할 것

### herdr 0.9.0 프리미티브 (이 프로젝트가 쓰는 것)

| 명령 | 역할 | 응답 위치 |
|---|---|---|
| `herdr agent list` | 감지된 에이전트 전부. `name`(이름 붙인 경우), `agent`(kind), `agent_status`(idle/working/blocked/done/unknown), `pane_id`, `workspace_id`, `cwd`, `agent_session.value` | `.result.agents[]` |
| `herdr agent get <name\|pane>` | 한 에이전트 | `.result.agent` |
| `herdr agent start <name> --kind <k> --pane <p> [--timeout ms] -- <args>` | 셸 프롬프트 상태인 pane에 에이전트 시작. 감지+준비 후 반환. 시작 중 blocked면 `agent_not_ready` | `.result.agent` |
| `herdr agent prompt <target> <text> --wait [--until s]* [--timeout ms]` | 텍스트+Enter 제출 후 settled 상태(idle/done/blocked) 대기. 이미 blocked면 `agent_blocked`, 5초 내 활동 없으면 `agent_prompt_stalled`, 타임아웃 `timeout` | `.result.agent` |
| `herdr agent rename <target> <name>` / `--clear` | 이름 부여/해제 (채택/해제) | |
| `herdr agent focus <target>` | UI 포커스 (+ done→seen) | |
| `herdr agent read <target> --source visible --lines N` | 화면 텍스트 | 텍스트 |
| `herdr workspace create --cwd <c> --label <l> --no-focus` | 새 워크스페이스(+탭+루트 pane) | `.result.workspace.workspace_id`, `.result.root_pane.pane_id` |
| `herdr tab create --workspace <w> --cwd <c> --label <l> --no-focus` | 새 탭 | `.result.tab.tab_id`, `.result.root_pane.pane_id` |
| `herdr pane close <p>` | pane 닫기 | |
| `herdr notification show <title> --body <b>` | 토스트 | |

- CLI 성공: stdout에 JSON 한 덩어리 `{"id":..., "result":{...}}`. 서버 에러: **stderr**에 JSON, exit 1 (`{"id":..., "error":{"code":"agent_blocked","message":"..."}}` 형태로 가정하고, `error.code`가 없으면 `code`, 그것도 없으면 `"herdr_error"`로 정규화). 문법 에러는 exit 2.
- 소켓: `HERDR_SOCKET_PATH`(기본 `~/.config/herdr/herdr.sock`), NDJSON. **한 연결 = 요청 하나.** `events.subscribe`는 ack(`result.type === "subscription_started"`) 후 같은 연결로 `{"event":"...","data":{...}}`를 밀어준다. `pane.agent_status_changed` 구독은 `pane_id` 필수(전역 구독 불가). 전역은 `pane.updated`, `pane.closed`, `pane.agent_detected`.
- 에이전트 pane 환경변수: `HERDR_ENV=1`, `HERDR_PANE_ID`, `HERDR_WORKSPACE_ID`. CLI `herdr-bot`은 `HERDR_PANE_ID`로 "내가 어느 봇인지"를 호스트에 알린다.

### grok-bot → herdr-bot 매핑

| grok-bot | herdr-bot |
|---|---|
| Agent(1:1 chat, 호스트가 LLM 실행) | Bot = herdr pane 안의 실제 에이전트. 1:1 DM은 멤버 1명짜리 방과 같은 경로 |
| Group(`group.json` memberIds) | Room(`rooms/<id>/room.json` memberIds) |
| `SendMessage` 도구만 방에 보임 | `herdr-bot say <room> "<text>"`만 방에 보임 |
| `(pass)` | `herdr-bot pass <room>` 또는 `say` 없이 턴 종료 |
| `runMemberTurn` = 호스트 LLM 호출 | `herdr agent prompt <bot> <turn prompt> --wait` |
| 시스템 프롬프트(매 턴) | 스폰/채택 시 1회 "identity brief" + 매 턴 짧은 턴 프롬프트 |
| coordinator RPC(`listAgents`, `sendPrompt`, …) | 같은 메서드 이름·응답 모양을 `core/src/coordinator/dispatcher.ts`가 구현 |

### 데이터 플로 (전체 그림)

```
UI(그록봇 렌더러) ──MessagePort── coordinator dispatcher ─┐
CLI `herdr-bot send` ──unix sock── control server ─────────┤ Host(단일 프로세스)
                                                           │  ├ RosterService  (bots/rooms CRUD, spawn/adopt via herdr CLI)
                                                           │  ├ ChatService    (transcript.jsonl append/read, view-state, events)
                                                           │  ├ TurnService    (RunQueue + GroupChatOrchestrator + runBotTurn)
                                                           │  └ StatusMirror   (herdr agent list ⟵ 이벤트/폴링)
                                                           │
  user message ─▶ ChatService.append ─▶ TurnService.schedule(chatId)
                    │ epoch++ ─▶ orchestrator.run(members)
                    │   for member in responders: prompt = buildRoomTurnPrompt(new msgs since last spoke)
                    │     herdr agent prompt <bot> "<prompt>" --wait ─────▶ bot pane (claude/codex/grok)
                    │     (during wait) bot runs: ~/.herdr-bot/bin/herdr-bot say <room> "..."  ─▶ control server ─▶ ChatService.append(bot msg) + inbox
                    │     settled ─▶ spoken=inbox.close(); busy/blocked/stalled/timeout ─▶ notice entry
                    └ up to 3 rounds / 10 messages; new user message bumps epoch → current round stops early
```

### 프로토콜 스펙

**저장 레이아웃** (`$HERDR_BOT_HOME`):
```
bots/<botId>/profile.json      BotProfile
bots/<botId>/transcript.jsonl  DM 트랜스크립트
rooms/<roomId>/room.json       RoomConfig
rooms/<roomId>/transcript.jsonl
state/view-state.json          { [chatId]: {lastViewedAt, lastActivityAt, isManuallyUnread} }
state/workspaces.json          { byCwd: { [cwd]: workspaceId } }
bin/herdr-bot                  CLI 셸 shim (install-shim이 생성)
host.sock                      control 소켓
```

**트랜스크립트 엔트리** (JSONL 한 줄 = 한 엔트리, `seq` 단조 증가, `id = "e"+seq`; 렌더러가 기대하는 모양 그대로):
```jsonc
{"kind":"message","role":"user","content":"...","isStreaming":false,"timestampMs":0,"clientNonce":"...","author":{"id":"user","name":"ray"},"seq":1,"id":"e1"}
{"kind":"send-message","message":{"type":"text","content":"..."},"author":{"id":"reviewer","name":"Reviewer"},"timestampMs":0,"seq":2,"id":"e2"}
{"kind":"notice","content":"reviewer is waiting for approval in herdr","timestampMs":0,"seq":3,"id":"e3"}
// reactions: "reactions":[{"emoji":"👍","by":"me"}]  ("me" = 사용자 본인)
```

**control 소켓** (`host.sock`, NDJSON, 요청 `{"id","method","params"}` → `{"id","result"}` | `{"id","error":{"code","message"}}`):

| method | params | result | 호출자 |
|---|---|---|---|
| `say` | `{chatId, text, paneId}` | `{entryId, mode:"in-turn"\|"late"}` | 봇 |
| `pass` | `{chatId, paneId}` | `{ok:true}` | 봇 |
| `read` | `{chatId, limit?}` | `{entries:[{id,author,text,timestampMs}]}` | 봇/사람 |
| `rooms` | `{}` | `{rooms:[{id,name,memberIds}]}` | 봇/사람 |
| `whoami` | `{paneId}` | `{bot:{id,name}}` \| error `unknown_pane` | 봇 |
| `send` | `{chatId, text}` | `{entryId}` (사용자로서 발언 + 턴 스케줄) | 사람(CLI) |
| `bot.create` | `CreateBotArgs` | `AgentSummary` | 사람(CLI) |
| `bot.adopt` | `{paneId, id, name?, description?}` | `AgentSummary` | 사람(CLI) |
| `bot.list` | `{}` | `{agents: AgentSummary[]}` | |
| `bot.delete` | `{id}` | `{deletedIds}` | |
| `bot.adoptable` | `{}` | `{agents: HerdrAgentInfo[]}` | |
| `room.create` | `{name, description?, memberIds}` | `AgentSummary` | |
| `room.set-members` | `{id, memberIds}` | `AgentSummary` | |
| `status` | `{}` | `{home, bots, rooms, runningTurns}` | |

에러 코드: `unknown_pane`, `unknown_chat`, `not_a_member`, `over_cap`(턴당 3번째 say), `invalid_params`, `unknown_method`, `herdr_error`(herdr CLI 에러를 감싼 것, message에 원본 code 포함).

**coordinator 디스패처** (렌더러가 부르는 메서드; 데스크톱 플랜이 MessagePort로 연결): 응답 모양은 Task 15 참조.

## 파일 구조

```
herdr-bot/
├── package.json                 workspaces ["core","cli"] (cli는 Task 16에서 추가), scripts test/typecheck
├── tsconfig.base.json
├── .node-version, .gitignore
├── core/
│   ├── package.json, tsconfig.json
│   ├── src/
│   │   ├── index.ts                    public exports (createHost, resolveConfig, …)
│   │   ├── config.ts                   HostConfig, resolveConfig, hostPaths          (Task 2)
│   │   ├── log.ts                      stderr logger                                  (Task 2)
│   │   ├── model/ids.ts                bot id/room id 규칙                              (Task 2)
│   │   ├── store/json-file.ts          atomic JSON read/write                          (Task 3)
│   │   ├── store/transcript-store.ts   JSONL append/tail/update                        (Task 3)
│   │   ├── store/profile-store.ts      BotProfile CRUD                                 (Task 4)
│   │   ├── store/room-store.ts         RoomConfig CRUD                                 (Task 4)
│   │   ├── store/view-state-store.ts   unread/viewed                                   (Task 4)
│   │   ├── model/entries.ts            엔트리 생성자, GroupMessage 변환, reactions       (Task 5)
│   │   ├── model/summaries.ts          AgentSummary(렌더러 roster 모양)                 (Task 5)
│   │   ├── group/group-chat.ts         grok-bot 순수 함수 이식                          (Task 6)
│   │   ├── group/orchestrator.ts       라운드로빈 오케스트레이터                          (Task 7)
│   │   ├── herdr/types.ts, herdr/cli.ts  herdr CLI 어댑터                              (Task 8)
│   │   ├── herdr/socket.ts             events.subscribe 클라이언트                       (Task 9)
│   │   ├── herdr/status-mirror.ts      BotRuntime 미러                                  (Task 9)
│   │   ├── bots/launch-args.ts         kind별 실행 플래그                                (Task 10)
│   │   ├── bots/prompts.ts             identity brief / 턴 프롬프트                       (Task 10)
│   │   ├── control/protocol.ts, server.ts, client.ts   control 소켓                    (Task 11)
│   │   ├── bots/say-inbox.ts           턴 중 say 수집                                   (Task 12)
│   │   ├── bots/turn-runner.ts         runBotTurn (agent prompt --wait)                 (Task 12)
│   │   ├── services/roster-service.ts  spawn/adopt/delete/rooms                        (Task 13)
│   │   ├── services/chat-service.ts    트랜스크립트/뷰/이벤트                            (Task 14)
│   │   ├── services/run-queue.ts       per-chat exclusive run + epoch                    (Task 14)
│   │   ├── services/turn-service.ts    사용자 메시지 → 오케스트레이션                     (Task 14)
│   │   ├── host-events.ts              agents / agent-upserted / transcript 이벤트 버스   (Task 14)
│   │   ├── host.ts                     구성 루트 (createHost)                           (Task 15)
│   │   ├── control/handlers.ts         control 메서드 → Host                            (Task 15)
│   │   ├── coordinator/frames.ts       coordinator 프레임 파서(프로토콜 v1)              (Task 15)
│   │   ├── coordinator/port-server.ts  hello/ready/request/reply 세션                    (Task 15)
│   │   └── coordinator/dispatcher.ts   coordinator 메서드 → Host                        (Task 15)
│   └── test/
│       ├── helpers/temp-home.ts, helpers/fake-herdr.mjs, helpers/fake-herdr-socket.ts
│       └── *.test.ts
├── cli/
│   ├── package.json, tsconfig.json
│   ├── src/main.ts                     argv → control 요청 / serve / install-shim         (Task 16)
│   ├── src/args.ts                     인자 파서(순수)                                   (Task 16)
│   ├── src/shim.ts                     ~/.herdr-bot/bin/herdr-bot 생성                   (Task 16)
│   └── test/args.test.ts, shim.test.ts
└── docs/superpowers/plans/
```

---

### Task 1: 레포 스캐폴드 (git init, workspaces, TS 설정, 스모크 테스트)

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.node-version`, `.gitignore`
- Create: `core/package.json`, `core/tsconfig.json`
- Test: `core/test/smoke.test.ts`

**Interfaces:**
- Produces: 루트 `npm test`(= `node --test` core 워크스페이스), `npm run typecheck`. 이후 모든 태스크는 이 두 명령으로 검증한다. `cli` 워크스페이스는 Task 16에서 추가되며 그때 두 스크립트를 확장한다 (Task 1 시점에 `cli/`를 include하면 `TS18003 No inputs were found`로 typecheck가 실패한다).

- [ ] **Step 1: git init + Node 버전 확인**

```bash
cd /Users/goorm/Desktop/ray/workspace/herdr-bot
node --version   # v24.x 이상이어야 함
git init -b main
```

- [ ] **Step 2: 루트 파일 작성**

`package.json`:
```json
{
  "name": "herdr-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "workspaces": ["core"],
  "scripts": {
    "test": "node --test \"core/test/**/*.test.ts\"",
    "typecheck": "tsc -p core/tsconfig.json",
    "check": "npm run typecheck && npm test"
  },
  "devDependencies": {
    "@types/node": "^24",
    "typescript": "7.0.2"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`.node-version`:
```
24
```

`.gitignore`:
```
node_modules/
dist/
.build/
.upstream/
*.log
.DS_Store
```

- [ ] **Step 3: 워크스페이스 패키지 파일**

`core/package.json`:
```json
{
  "name": "@herdr-bot/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"test/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

`core/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test"]
}
```

- [ ] **Step 4: 스모크 테스트 작성 (실패 확인용)**

`core/test/smoke.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("node runs TypeScript tests directly (type stripping)", () => {
  const value: number = 1;
  assert.equal(value + 1, 2);
});
```

- [ ] **Step 5: 설치 후 테스트/타입체크 실행**

```bash
npm install
npm test
npm run typecheck
```
Expected: `npm test` → `# pass 1`, `# fail 0`. `typecheck` 종료 코드 0.

만약 `node --test`가 `.ts`를 거부하면(`ERR_UNKNOWN_FILE_EXTENSION`) Node 버전을 다시 확인한다 — 24 미만이면 중단하고 사용자에게 보고.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "chore: scaffold herdr-bot workspaces with node --test and erasable TypeScript"
```

---

### Task 2: 설정(config), 경로, 로거, id 규칙

**Files:**
- Create: `core/src/config.ts`, `core/src/log.ts`, `core/src/model/ids.ts`
- Test: `core/test/config.test.ts`, `core/test/ids.test.ts`

**Interfaces:**
- Produces:
  - `resolveConfig(env?: NodeJS.ProcessEnv): HostConfig` — `{ home, herdrBin, herdrSocketPath, controlSocketPath, cliPath, userName, turnTimeoutMs, briefTimeoutMs, defaultKind, defaultCwd }`
  - `hostPaths.botProfile(home, id)` 등 경로 헬퍼 (표 참조)
  - `log(scope: string, message: string, data?: unknown): void` (stderr)
  - `isValidBotId(v): boolean`, `suggestBotId(name): string`, `makeRoomId(name, suffix?): string`, `isRoomId(v): boolean`, `slugify(text, max?)`

- [ ] **Step 1: 실패하는 테스트**

`core/test/config.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { homedir } from "node:os";
import { hostPaths, resolveConfig } from "../src/config.ts";

test("resolveConfig defaults home to ~/.herdr-bot and herdr to PATH binary", () => {
  const config = resolveConfig({});
  assert.equal(config.home, join(homedir(), ".herdr-bot"));
  assert.equal(config.herdrBin, "herdr");
  assert.equal(config.controlSocketPath, join(homedir(), ".herdr-bot", "host.sock"));
  assert.equal(config.cliPath, join(homedir(), ".herdr-bot", "bin", "herdr-bot"));
  assert.equal(config.turnTimeoutMs, 180_000);
  assert.equal(config.defaultKind, "claude");
});

test("resolveConfig honours env overrides and ignores garbage numbers", () => {
  const config = resolveConfig({
    HERDR_BOT_HOME: "/tmp/hb",
    HERDR_BIN_PATH: "/opt/herdr",
    HERDR_SOCKET_PATH: "/tmp/h.sock",
    HERDR_BOT_USER_NAME: "ray",
    HERDR_BOT_TURN_TIMEOUT_MS: "abc",
    HERDR_BOT_DEFAULT_KIND: "codex",
  });
  assert.equal(config.home, "/tmp/hb");
  assert.equal(config.herdrBin, "/opt/herdr");
  assert.equal(config.herdrSocketPath, "/tmp/h.sock");
  assert.equal(config.userName, "ray");
  assert.equal(config.turnTimeoutMs, 180_000);
  assert.equal(config.defaultKind, "codex");
});

test("hostPaths lays out bots, rooms, and state", () => {
  assert.equal(hostPaths.botProfile("/h", "rev"), "/h/bots/rev/profile.json");
  assert.equal(hostPaths.roomTranscript("/h", "room-x-1a2b"), "/h/rooms/room-x-1a2b/transcript.jsonl");
  assert.equal(hostPaths.viewState("/h"), "/h/state/view-state.json");
  assert.equal(hostPaths.workspaces("/h"), "/h/state/workspaces.json");
});
```

`core/test/ids.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRoomId, isValidBotId, makeRoomId, slugify, suggestBotId } from "../src/model/ids.ts";

test("bot ids follow herdr agent name rules and never use the room prefix", () => {
  assert.equal(isValidBotId("reviewer"), true);
  assert.equal(isValidBotId("r2-d2_x"), true);
  assert.equal(isValidBotId("Reviewer"), false);
  assert.equal(isValidBotId("9lives"), false);
  assert.equal(isValidBotId("a".repeat(33)), false);
  assert.equal(isValidBotId("room-ok"), false);
});

test("suggestBotId derives a valid id from a display name", () => {
  assert.equal(suggestBotId("Code Reviewer"), "code-reviewer");
  assert.equal(suggestBotId("2nd Opinion"), "bot-2nd-opinion");
  assert.equal(suggestBotId("리뷰어"), "bot");
});

test("room ids are prefixed, slugged, and suffixed", () => {
  assert.equal(makeRoomId("Auth refactor", "1a2b"), "room-auth-refactor-1a2b");
  assert.equal(makeRoomId("리뷰", "1a2b"), "room-chat-1a2b");
  assert.equal(isRoomId("room-chat-1a2b"), true);
  assert.equal(isRoomId("reviewer"), false);
  assert.equal(slugify("Hello,  World!!"), "hello-world");
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/config.test.ts core/test/ids.test.ts
```
Expected: FAIL — `Cannot find module '.../src/config.ts'`.

- [ ] **Step 3: 구현**

`core/src/config.ts`:
```ts
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export const DEFAULT_TURN_TIMEOUT_MS = 180_000;
export const DEFAULT_BRIEF_TIMEOUT_MS = 60_000;
export const DEFAULT_BOT_KIND = "claude";

export interface HostConfig {
  readonly home: string;
  readonly herdrBin: string;
  readonly herdrSocketPath: string;
  readonly controlSocketPath: string;
  readonly cliPath: string;
  readonly userName: string;
  readonly turnTimeoutMs: number;
  readonly briefTimeoutMs: number;
  readonly defaultKind: string;
  readonly defaultCwd: string;
}

function nonEmpty(value: string | undefined): string | null {
  return value != null && value.length > 0 ? value : null;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = value == null ? Number.NaN : Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultUserName(): string {
  try {
    return userInfo().username;
  } catch {
    return "user";
  }
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): HostConfig {
  const home = nonEmpty(env.HERDR_BOT_HOME) ?? join(homedir(), ".herdr-bot");
  return {
    home,
    herdrBin: nonEmpty(env.HERDR_BIN_PATH) ?? "herdr",
    herdrSocketPath: nonEmpty(env.HERDR_SOCKET_PATH) ?? join(homedir(), ".config", "herdr", "herdr.sock"),
    controlSocketPath: join(home, "host.sock"),
    cliPath: join(home, "bin", "herdr-bot"),
    userName: nonEmpty(env.HERDR_BOT_USER_NAME) ?? defaultUserName(),
    turnTimeoutMs: positiveInt(env.HERDR_BOT_TURN_TIMEOUT_MS, DEFAULT_TURN_TIMEOUT_MS),
    briefTimeoutMs: positiveInt(env.HERDR_BOT_BRIEF_TIMEOUT_MS, DEFAULT_BRIEF_TIMEOUT_MS),
    defaultKind: nonEmpty(env.HERDR_BOT_DEFAULT_KIND) ?? DEFAULT_BOT_KIND,
    defaultCwd: nonEmpty(env.HERDR_BOT_DEFAULT_CWD) ?? homedir(),
  };
}

export const hostPaths = {
  bots: (home: string): string => join(home, "bots"),
  bot: (home: string, id: string): string => join(home, "bots", id),
  botProfile: (home: string, id: string): string => join(home, "bots", id, "profile.json"),
  botTranscript: (home: string, id: string): string => join(home, "bots", id, "transcript.jsonl"),
  rooms: (home: string): string => join(home, "rooms"),
  room: (home: string, id: string): string => join(home, "rooms", id),
  roomConfig: (home: string, id: string): string => join(home, "rooms", id, "room.json"),
  roomTranscript: (home: string, id: string): string => join(home, "rooms", id, "transcript.jsonl"),
  state: (home: string): string => join(home, "state"),
  viewState: (home: string): string => join(home, "state", "view-state.json"),
  workspaces: (home: string): string => join(home, "state", "workspaces.json"),
  bin: (home: string): string => join(home, "bin"),
} as const;
```

`core/src/log.ts`:
```ts
export type LogSink = (line: string) => void;

let sink: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(scope: string, message: string, data?: unknown): void {
  const stamp = new Date().toISOString();
  const suffix = data === undefined ? "" : ` ${JSON.stringify(data)}`;
  sink(`${stamp} [herdr-bot:${scope}] ${message}${suffix}`);
}
```

`core/src/model/ids.ts`:
```ts
import { randomBytes } from "node:crypto";

export const BOT_ID_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
export const ROOM_ID_PREFIX = "room-";

export function isValidBotId(value: string): boolean {
  return BOT_ID_PATTERN.test(value) && !value.startsWith(ROOM_ID_PREFIX);
}

export function slugify(text: string, maxLength = 24): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

export function suggestBotId(name: string): string {
  const slug = slugify(name, 32);
  const candidate = /^[a-z]/.test(slug) ? slug : `bot-${slug}`.slice(0, 32).replace(/-+$/g, "");
  return isValidBotId(candidate) ? candidate : "bot";
}

export function randomSuffix(): string {
  return randomBytes(2).toString("hex");
}

export function makeRoomId(name: string, suffix: string = randomSuffix()): string {
  const slug = slugify(name);
  return `${ROOM_ID_PREFIX}${slug.length > 0 ? slug : "chat"}-${suffix}`;
}

export function isRoomId(value: string): boolean {
  return value.startsWith(ROOM_ID_PREFIX);
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
node --test core/test/config.test.ts core/test/ids.test.ts && npm run typecheck
```
Expected: `# pass 6`, typecheck 0.

- [ ] **Step 5: 커밋**

```bash
git add core/src/config.ts core/src/log.ts core/src/model/ids.ts core/test/config.test.ts core/test/ids.test.ts
git commit -m "feat(core): add host config, paths, logger, and id rules"
```

---

### Task 3: JSON 파일 유틸 + JSONL 트랜스크립트 스토어

**Files:**
- Create: `core/src/store/json-file.ts`, `core/src/store/transcript-store.ts`
- Create: `core/test/helpers/temp-home.ts`
- Test: `core/test/transcript-store.test.ts`

**Interfaces:**
- Produces:
  - `readJsonFile<T>(path, project: (v: unknown) => T | null): T | null`, `writeJsonFileAtomic(path, value): void`
  - `interface StoredEntry { id; kind; seq; timestampMs; [key]: unknown }`, `type NewEntry = { kind; timestampMs; [key]: unknown }`, `interface TranscriptPage { entries; nextBeforeSeq? }`
  - `class TranscriptStore { constructor(path); readAll(); append(entry: NewEntry): StoredEntry; get(id); update(id, patch); tail(limit, beforeSeq?): TranscriptPage; last() }`
  - 테스트 헬퍼 `makeTempHome(): { home: string; cleanup(): void }`

- [ ] **Step 1: 테스트 헬퍼 + 실패하는 테스트**

`core/test/helpers/temp-home.ts`:
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempHome {
  readonly home: string;
  cleanup(): void;
}

/** Short path on purpose: unix socket paths are capped at 104 bytes on macOS. */
export function makeTempHome(): TempHome {
  const home = mkdtempSync(join(tmpdir(), "hb-"));
  return {
    home,
    cleanup: () => rmSync(home, { recursive: true, force: true }),
  };
}
```

`core/test/transcript-store.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { appendFileSync, readFileSync } from "node:fs";
import { TranscriptStore } from "../src/store/transcript-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

function entry(kind: string, extra: Record<string, unknown> = {}) {
  return { kind, timestampMs: 1_000, ...extra };
}

test("append assigns monotonic seq and e<seq> ids and persists as JSONL", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    const first = store.append(entry("message", { content: "hi" }));
    const second = store.append(entry("notice", { content: "x" }));
    assert.deepEqual([first.seq, first.id, second.seq, second.id], [1, "e1", 2, "e2"]);
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).content, "hi");
    const reloaded = new TranscriptStore(path);
    assert.equal(reloaded.readAll().length, 2);
    assert.equal(reloaded.last()?.id, "e2");
  } finally {
    temp.cleanup();
  }
});

test("tail pages backwards with nextBeforeSeq", () => {
  const temp = makeTempHome();
  try {
    const store = new TranscriptStore(join(temp.home, "t.jsonl"));
    for (let index = 0; index < 5; index += 1) store.append(entry("message", { content: String(index) }));
    const page = store.tail(2);
    assert.deepEqual(page.entries.map((item) => item.id), ["e4", "e5"]);
    assert.equal(page.nextBeforeSeq, 4);
    const older = store.tail(2, page.nextBeforeSeq);
    assert.deepEqual(older.entries.map((item) => item.id), ["e2", "e3"]);
    const oldest = store.tail(2, older.nextBeforeSeq);
    assert.deepEqual(oldest.entries.map((item) => item.id), ["e1"]);
    assert.equal(oldest.nextBeforeSeq, undefined);
  } finally {
    temp.cleanup();
  }
});

test("update rewrites one entry, keeps id/seq, and survives reload", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    const updated = store.update("e1", (current) => ({ ...current, reactions: [{ emoji: "👍", by: "me" }], seq: 99, id: "zzz" }));
    assert.equal(updated?.id, "e1");
    assert.equal(updated?.seq, 1);
    assert.equal(store.update("missing", (current) => current), null);
    const reloaded = new TranscriptStore(path);
    assert.deepEqual(reloaded.get("e1")?.reactions, [{ emoji: "👍", by: "me" }]);
  } finally {
    temp.cleanup();
  }
});

test("corrupt lines are skipped on load", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "t.jsonl");
    const store = new TranscriptStore(path);
    store.append(entry("message", { content: "a" }));
    appendFileSync(path, "{not json\n");
    assert.equal(new TranscriptStore(path).readAll().length, 1);
  } finally {
    temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/transcript-store.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/store/json-file.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonFile<T>(path: string, project: (value: unknown) => T | null): T | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  try {
    return project(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJsonFileAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}
```

`core/src/store/transcript-store.ts`:
```ts
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StoredEntry {
  readonly id: string;
  readonly kind: string;
  readonly seq: number;
  readonly timestampMs: number;
  readonly [key: string]: unknown;
}

export type NewEntry = {
  readonly kind: string;
  readonly timestampMs: number;
  readonly [key: string]: unknown;
};

export interface TranscriptPage {
  readonly entries: readonly StoredEntry[];
  readonly nextBeforeSeq?: number;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && typeof candidate.kind === "string"
    && typeof candidate.seq === "number"
    && typeof candidate.timestampMs === "number";
}

function parseLines(raw: string): StoredEntry[] {
  const parsed: StoredEntry[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (isStoredEntry(value)) parsed.push(value);
    } catch {
      // Skip a corrupt line instead of losing the whole transcript.
    }
  }
  return parsed;
}

export class TranscriptStore {
  readonly path: string;
  #entries: readonly StoredEntry[] | null = null;

  constructor(path: string) {
    this.path = path;
  }

  readAll(): readonly StoredEntry[] {
    return this.#load();
  }

  nextSeq(): number {
    const last = this.last();
    return last == null ? 1 : last.seq + 1;
  }

  append(entry: NewEntry): StoredEntry {
    const seq = this.nextSeq();
    const stored: StoredEntry = { ...entry, seq, id: `e${seq}` };
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(stored)}\n`, "utf8");
    this.#entries = [...this.#load(), stored];
    return stored;
  }

  get(id: string): StoredEntry | null {
    return this.#load().find((entry) => entry.id === id) ?? null;
  }

  update(id: string, patch: (entry: StoredEntry) => StoredEntry): StoredEntry | null {
    const entries = this.#load();
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = entries[index]!;
    const next: StoredEntry = { ...patch(current), id: current.id, seq: current.seq };
    this.#rewrite([...entries.slice(0, index), next, ...entries.slice(index + 1)]);
    return next;
  }

  tail(limit: number, beforeSeq?: number): TranscriptPage {
    const entries = this.#load();
    const boundary = beforeSeq == null ? -1 : entries.findIndex((entry) => entry.seq >= beforeSeq);
    const end = boundary < 0 ? entries.length : boundary;
    const start = Math.max(0, end - Math.max(0, limit));
    const page = entries.slice(start, end);
    const first = page[0];
    return start > 0 && first != null ? { entries: page, nextBeforeSeq: first.seq } : { entries: page };
  }

  last(): StoredEntry | null {
    const entries = this.#load();
    return entries[entries.length - 1] ?? null;
  }

  #load(): readonly StoredEntry[] {
    if (this.#entries != null) return this.#entries;
    let raw = "";
    try {
      raw = readFileSync(this.path, "utf8");
    } catch {
      raw = "";
    }
    this.#entries = parseLines(raw);
    return this.#entries;
  }

  #rewrite(entries: readonly StoredEntry[]): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    const body = entries.map((entry) => JSON.stringify(entry)).join("\n");
    writeFileSync(temp, entries.length > 0 ? `${body}\n` : "", "utf8");
    renameSync(temp, this.path);
    this.#entries = entries;
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/transcript-store.test.ts && npm run typecheck
```
Expected: `# pass 4`.

- [ ] **Step 5: 커밋**

```bash
git add core/src/store core/test/helpers/temp-home.ts core/test/transcript-store.test.ts
git commit -m "feat(core): add atomic JSON helpers and JSONL transcript store"
```

---

### Task 4: 프로필/방/뷰 상태 스토어

**Files:**
- Create: `core/src/store/profile-store.ts`, `core/src/store/room-store.ts`, `core/src/store/view-state-store.ts`
- Test: `core/test/profile-store.test.ts`, `core/test/room-store.test.ts`, `core/test/view-state-store.test.ts`
- Create: `core/test/helpers/fixtures.ts` (`sampleProfile`, `sampleRoom` — 테스트 파일에서 export하면 import하는 쪽마다 그 스위트가 재등록되므로 helpers에 둔다)

**Interfaces:**
- Produces:
  - `type PermissionMode = "ask" | "auto"`
  - `interface BotProfile { id; name; description; kind; cwd; permissionMode; avatarShape: string|null; avatarColor: string|null; adopted: boolean; herdr: { paneId: string|null; workspaceId: string|null; sessionId: string|null }; notifyOnUpdatesEnabled: boolean; isHiddenFromSidebar: boolean; createdAt: number; updatedAt: number }`
  - `projectBotProfile(value: unknown): BotProfile | null`
  - `class ProfileStore { constructor(home); list(): BotProfile[]; get(id): BotProfile|null; save(profile): void; delete(id): void }`
  - `interface RoomConfig { id; name; description; memberIds: string[]; isHiddenFromSidebar: boolean; createdAt; updatedAt }`, `projectRoomConfig`, `class RoomStore` (같은 메서드)
  - `interface ChatViewState { lastViewedAt: number; lastActivityAt: number; isManuallyUnread: boolean }`, `class ViewStateStore { constructor(home); get(chatId): ChatViewState; markViewed(chatId, now): ChatViewState; markActivity(chatId, now): ChatViewState; setManuallyUnread(chatId, isUnread): ChatViewState; delete(chatId): void }`

- [ ] **Step 1: 실패하는 테스트**

`core/test/helpers/fixtures.ts`:
```ts
import type { BotProfile } from "../../src/store/profile-store.ts";
import type { RoomConfig } from "../../src/store/room-store.ts";

export function sampleProfile(overrides: Partial<BotProfile> = {}): BotProfile {
  return {
    id: "reviewer",
    name: "Reviewer",
    description: "reviews diffs",
    kind: "claude",
    cwd: "/tmp/repo",
    permissionMode: "ask",
    avatarShape: null,
    avatarColor: null,
    adopted: false,
    herdr: { paneId: "w1:p2", workspaceId: "w1", sessionId: null },
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

export function sampleRoom(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    id: "room-auth-1a2b",
    name: "auth",
    description: "",
    memberIds: ["reviewer", "fixer"],
    isHiddenFromSidebar: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
```

`core/test/profile-store.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { hostPaths } from "../src/config.ts";
import { ProfileStore, projectBotProfile } from "../src/store/profile-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile } from "./helpers/fixtures.ts";

test("profile store round-trips, lists sorted by id, and deletes the bot directory", () => {
  const temp = makeTempHome();
  try {
    const store = new ProfileStore(temp.home);
    store.save(sampleProfile({ id: "zed", name: "Zed" }));
    store.save(sampleProfile());
    assert.deepEqual(store.list().map((profile) => profile.id), ["reviewer", "zed"]);
    assert.equal(store.get("reviewer")?.name, "Reviewer");
    assert.equal(store.get("nope"), null);
    store.delete("zed");
    assert.equal(existsSync(hostPaths.bot(temp.home, "zed")), false);
    assert.deepEqual(store.list().map((profile) => profile.id), ["reviewer"]);
  } finally {
    temp.cleanup();
  }
});

test("projectBotProfile rejects malformed profiles and fills optional booleans", () => {
  assert.equal(projectBotProfile({ id: "x" }), null);
  const projected = projectBotProfile({ ...sampleProfile(), notifyOnUpdatesEnabled: undefined, isHiddenFromSidebar: undefined });
  assert.equal(projected?.notifyOnUpdatesEnabled, true);
  assert.equal(projected?.isHiddenFromSidebar, false);
  assert.equal(projectBotProfile({ ...sampleProfile(), permissionMode: "yolo" }), null);
});
```

`core/test/room-store.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomStore, projectRoomConfig } from "../src/store/room-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleRoom } from "./helpers/fixtures.ts";

test("room store round-trips and dedupes member ids on project", () => {
  const temp = makeTempHome();
  try {
    const store = new RoomStore(temp.home);
    store.save(sampleRoom());
    assert.deepEqual(store.get("room-auth-1a2b")?.memberIds, ["reviewer", "fixer"]);
    assert.equal(store.list().length, 1);
    store.delete("room-auth-1a2b");
    assert.equal(store.list().length, 0);
  } finally {
    temp.cleanup();
  }
});

test("projectRoomConfig validates shape", () => {
  assert.equal(projectRoomConfig({ id: "room-x" }), null);
  assert.deepEqual(projectRoomConfig({ ...sampleRoom(), memberIds: ["a", "a", "b"] })?.memberIds, ["a", "b"]);
});
```

`core/test/view-state-store.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("view state tracks activity vs viewed and manual unread", () => {
  const temp = makeTempHome();
  try {
    const store = new ViewStateStore(temp.home);
    assert.deepEqual(store.get("room-x"), { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: false });
    store.markActivity("room-x", 10);
    store.markViewed("room-x", 20);
    store.setManuallyUnread("room-x", true);
    const reloaded = new ViewStateStore(temp.home).get("room-x");
    assert.deepEqual(reloaded, { lastViewedAt: 20, lastActivityAt: 10, isManuallyUnread: true });
    store.markViewed("room-x", 30);
    assert.equal(store.get("room-x").isManuallyUnread, false);
    store.delete("room-x");
    assert.equal(store.get("room-x").lastViewedAt, 0);
  } finally {
    temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/profile-store.test.ts core/test/room-store.test.ts core/test/view-state-store.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/store/profile-store.ts`:
```ts
import { readdirSync, rmSync } from "node:fs";
import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export type PermissionMode = "ask" | "auto";

export interface BotHerdrRef {
  readonly paneId: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
}

export interface BotProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: PermissionMode;
  readonly avatarShape: string | null;
  readonly avatarColor: string | null;
  readonly adopted: boolean;
  readonly herdr: BotHerdrRef;
  readonly notifyOnUpdatesEnabled: boolean;
  readonly isHiddenFromSidebar: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectHerdrRef(value: unknown): BotHerdrRef {
  const record = isRecord(value) ? value : {};
  return { paneId: stringOrNull(record.paneId), workspaceId: stringOrNull(record.workspaceId), sessionId: stringOrNull(record.sessionId) };
}

export function projectBotProfile(value: unknown): BotProfile | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.kind !== "string" || typeof value.cwd !== "string") return null;
  if (value.permissionMode !== "ask" && value.permissionMode !== "auto") return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    kind: value.kind,
    cwd: value.cwd,
    permissionMode: value.permissionMode,
    avatarShape: stringOrNull(value.avatarShape),
    avatarColor: stringOrNull(value.avatarColor),
    adopted: value.adopted === true,
    herdr: projectHerdrRef(value.herdr),
    notifyOnUpdatesEnabled: value.notifyOnUpdatesEnabled !== false,
    isHiddenFromSidebar: value.isHiddenFromSidebar === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function listDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export class ProfileStore {
  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  list(): BotProfile[] {
    return listDirectories(hostPaths.bots(this.home)).flatMap((id) => {
      const profile = this.get(id);
      return profile == null ? [] : [profile];
    });
  }

  get(id: string): BotProfile | null {
    return readJsonFile(hostPaths.botProfile(this.home, id), projectBotProfile);
  }

  save(profile: BotProfile): void {
    writeJsonFileAtomic(hostPaths.botProfile(this.home, profile.id), profile);
  }

  delete(id: string): void {
    rmSync(hostPaths.bot(this.home, id), { recursive: true, force: true });
  }
}
```

`core/src/store/room-store.ts`:
```ts
import { readdirSync, rmSync } from "node:fs";
import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export interface RoomConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly memberIds: readonly string[];
  readonly isHiddenFromSidebar: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function dedupeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.length > 0) seen.add(item);
  }
  return [...seen];
}

export function projectRoomConfig(value: unknown): RoomConfig | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    memberIds: dedupeIds(value.memberIds),
    isHiddenFromSidebar: value.isHiddenFromSidebar === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function listDirectories(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

export class RoomStore {
  readonly home: string;

  constructor(home: string) {
    this.home = home;
  }

  list(): RoomConfig[] {
    return listDirectories(hostPaths.rooms(this.home)).flatMap((id) => {
      const room = this.get(id);
      return room == null ? [] : [room];
    });
  }

  get(id: string): RoomConfig | null {
    return readJsonFile(hostPaths.roomConfig(this.home, id), projectRoomConfig);
  }

  save(room: RoomConfig): void {
    writeJsonFileAtomic(hostPaths.roomConfig(this.home, room.id), room);
  }

  delete(id: string): void {
    rmSync(hostPaths.room(this.home, id), { recursive: true, force: true });
  }
}
```

`core/src/store/view-state-store.ts`:
```ts
import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "./json-file.ts";

export interface ChatViewState {
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly isManuallyUnread: boolean;
}

export const EMPTY_VIEW_STATE: ChatViewState = { lastViewedAt: 0, lastActivityAt: 0, isManuallyUnread: false };

type ViewStateMap = Readonly<Record<string, ChatViewState>>;

function projectMap(value: unknown): ViewStateMap | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result: Record<string, ChatViewState> = {};
  for (const [chatId, state] of Object.entries(value as Record<string, unknown>)) {
    if (typeof state !== "object" || state === null) continue;
    const candidate = state as Record<string, unknown>;
    result[chatId] = {
      lastViewedAt: typeof candidate.lastViewedAt === "number" ? candidate.lastViewedAt : 0,
      lastActivityAt: typeof candidate.lastActivityAt === "number" ? candidate.lastActivityAt : 0,
      isManuallyUnread: candidate.isManuallyUnread === true,
    };
  }
  return result;
}

export class ViewStateStore {
  readonly path: string;
  #map: ViewStateMap | null = null;

  constructor(home: string) {
    this.path = hostPaths.viewState(home);
  }

  get(chatId: string): ChatViewState {
    return this.#load()[chatId] ?? EMPTY_VIEW_STATE;
  }

  markViewed(chatId: string, now: number): ChatViewState {
    return this.#put(chatId, { ...this.get(chatId), lastViewedAt: now, isManuallyUnread: false });
  }

  markActivity(chatId: string, now: number): ChatViewState {
    return this.#put(chatId, { ...this.get(chatId), lastActivityAt: now });
  }

  setManuallyUnread(chatId: string, isUnread: boolean): ChatViewState {
    return this.#put(chatId, { ...this.get(chatId), isManuallyUnread: isUnread });
  }

  delete(chatId: string): void {
    const { [chatId]: _removed, ...rest } = this.#load();
    this.#save(rest);
  }

  #put(chatId: string, state: ChatViewState): ChatViewState {
    this.#save({ ...this.#load(), [chatId]: state });
    return state;
  }

  #load(): ViewStateMap {
    if (this.#map == null) this.#map = readJsonFile(this.path, projectMap) ?? {};
    return this.#map;
  }

  #save(map: ViewStateMap): void {
    this.#map = map;
    writeJsonFileAtomic(this.path, map);
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/profile-store.test.ts core/test/room-store.test.ts core/test/view-state-store.test.ts && npm run typecheck
```
Expected: `# pass 5`.

- [ ] **Step 5: 커밋**

```bash
git add core/src/store core/test/profile-store.test.ts core/test/room-store.test.ts core/test/view-state-store.test.ts
git commit -m "feat(core): add bot profile, room, and view-state stores"
```

---

### Task 5: 엔트리 모델 + 렌더러용 AgentSummary 프로젝션

**Files:**
- Create: `core/src/model/entries.ts`, `core/src/model/summaries.ts`, `core/src/herdr/types.ts`
- Test: `core/test/entries.test.ts`, `core/test/summaries.test.ts`

**Interfaces:**
- Consumes: `StoredEntry`, `NewEntry`(Task 3), `BotProfile`(Task 4), `RoomConfig`, `ChatViewState`
- Produces:
  - `core/src/herdr/types.ts`: `type HerdrAgentStatus = "idle"|"working"|"blocked"|"done"|"unknown"`, `type BotRuntimeStatus = HerdrAgentStatus | "offline"`, `interface BotRuntime { status: BotRuntimeStatus; paneId: string|null; workspaceId: string|null; sessionId: string|null; kind: string|null }`, `OFFLINE_RUNTIME`, `interface HerdrAgentInfo { name: string|null; agent: string|null; agent_status: HerdrAgentStatus; pane_id: string; tab_id: string|null; workspace_id: string|null; cwd: string|null; agent_session: { value: string } | null }`, `projectHerdrAgentInfo(value): HerdrAgentInfo|null`, `class HerdrError extends Error { code: string }`
  - `entries.ts`: `interface Author { id; name }`, `USER_AUTHOR_ID = "user"`, `REACTION_SELF = "me"`, `userMessageEntry(args)`, `botMessageEntry(args)`, `noticeEntry(args)`, `toggleReaction(entry, emoji, by?)`, `entryText(entry): string|null`, `toGroupMessage(entry): GroupMessage|null`, `lastEntryPreview(entry|null)`
  - `summaries.ts`: `interface AgentSummary` (렌더러 `projectRendererAgent`가 읽는 필드 전부), `botSummary({profile, runtime, last, view, isTurnActive})`, `roomSummary({room, last, view, isTurnActive})`
- `GroupMessage`는 Task 6에서 정의되지만 타입만 필요하므로 이 태스크에서 `core/src/group/group-chat.ts`에 **타입 두 개만 먼저** 만든다(Task 6이 함수들을 채움).

- [ ] **Step 1: 타입 선행 파일**

`core/src/group/group-chat.ts` (Task 6에서 확장됨):
```ts
export interface GroupMember {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export type GroupSpeaker =
  | { readonly kind: "user"; readonly name?: string }
  | { readonly kind: "member"; readonly id: string; readonly name: string };

export interface GroupMessage {
  readonly speaker: GroupSpeaker;
  readonly content: string;
}
```

- [ ] **Step 2: 실패하는 테스트**

`core/test/entries.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { botMessageEntry, entryText, lastEntryPreview, noticeEntry, toGroupMessage, toggleReaction, userMessageEntry } from "../src/model/entries.ts";
import type { StoredEntry } from "../src/store/transcript-store.ts";

function stored(entry: Record<string, unknown>, seq = 1): StoredEntry {
  return { ...entry, seq, id: `e${seq}` } as StoredEntry;
}

test("user entries carry the renderer message shape plus clientNonce", () => {
  const entry = userMessageEntry({ content: "hi", timestampMs: 5, clientNonce: "n1", userName: "ray" });
  assert.equal(entry.kind, "message");
  assert.equal(entry.role, "user");
  assert.equal(entry.content, "hi");
  assert.equal(entry.clientNonce, "n1");
  assert.deepEqual(entry.author, { id: "user", name: "ray" });
  assert.equal("richText" in entry, false);
});

test("bot entries are send-message text cards with an author", () => {
  const entry = botMessageEntry({ content: "done", author: { id: "reviewer", name: "Reviewer" }, timestampMs: 5 });
  assert.deepEqual(entry.message, { type: "text", content: "done" });
  assert.equal(entryText(stored(entry)), "done");
  assert.deepEqual(toGroupMessage(stored(entry)), { speaker: { kind: "member", id: "reviewer", name: "Reviewer" }, content: "done" });
});

test("notices are excluded from group history but have text", () => {
  const entry = stored(noticeEntry({ content: "x joined", timestampMs: 1 }));
  assert.equal(entryText(entry), "x joined");
  assert.equal(toGroupMessage(entry), null);
  assert.deepEqual(lastEntryPreview(entry), { kind: "text", text: "x joined" });
  assert.equal(lastEntryPreview(null), null);
});

test("user entries map to user speakers with their name", () => {
  const entry = stored(userMessageEntry({ content: "go", timestampMs: 1, userName: "ray" }));
  assert.deepEqual(toGroupMessage(entry), { speaker: { kind: "user", name: "ray" }, content: "go" });
});

test("toggleReaction adds then removes my reaction", () => {
  const base = stored(botMessageEntry({ content: "a", author: { id: "b", name: "B" }, timestampMs: 1 }));
  const added = toggleReaction(base, "👍");
  assert.deepEqual(added.reactions, [{ emoji: "👍", by: "me" }]);
  const removed = toggleReaction(added, "👍");
  assert.deepEqual(removed.reactions, []);
});
```

`core/test/summaries.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { botSummary, roomSummary } from "../src/model/summaries.ts";
import { botMessageEntry } from "../src/model/entries.ts";
import { OFFLINE_RUNTIME, type BotRuntime } from "../src/herdr/types.ts";
import type { StoredEntry } from "../src/store/transcript-store.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

const RUNTIME: BotRuntime = { status: "idle", paneId: "w1:p2", workspaceId: "w1", sessionId: "s1", kind: "claude" };
const VIEW = { lastViewedAt: 10, lastActivityAt: 20, isManuallyUnread: false };
const LAST: StoredEntry = { ...botMessageEntry({ content: "hello there", author: { id: "reviewer", name: "Reviewer" }, timestampMs: 20 }), seq: 3, id: "e3" } as StoredEntry;

test("bot summary mirrors runtime status into isRunning / awaitingUserResponse", () => {
  const idle = botSummary({ profile: sampleProfile(), runtime: RUNTIME, last: LAST, view: VIEW, isTurnActive: false });
  assert.equal(idle.id, "reviewer");
  assert.equal(idle.isGroup, false);
  assert.equal(idle.isRunning, false);
  assert.equal(idle.awaitingUserResponse, null);
  assert.equal(idle.hasUnread, true);
  assert.deepEqual(idle.lastEntry, { kind: "text", text: "hello there" });
  assert.equal(idle.lastMessagePreview, "hello there");
  assert.equal(idle.updatedAt, 20);
  assert.equal(idle.herdrBot?.status, "idle");

  const working = botSummary({ profile: sampleProfile(), runtime: { ...RUNTIME, status: "working" }, last: null, view: VIEW, isTurnActive: false });
  assert.equal(working.isRunning, true);

  const blocked = botSummary({ profile: sampleProfile(), runtime: { ...RUNTIME, status: "blocked" }, last: null, view: VIEW, isTurnActive: false });
  assert.deepEqual(blocked.awaitingUserResponse, { reason: "approval" });

  const offline = botSummary({ profile: sampleProfile(), runtime: OFFLINE_RUNTIME, last: null, view: VIEW, isTurnActive: false });
  assert.deepEqual(offline.awaitingUserResponse, { reason: "offline" });
});

test("room summary is a group with member ids and turn activity", () => {
  const summary = roomSummary({ room: sampleRoom(), last: LAST, view: { ...VIEW, lastViewedAt: 30 }, isTurnActive: true });
  assert.equal(summary.isGroup, true);
  assert.deepEqual(summary.memberIds, ["reviewer", "fixer"]);
  assert.equal(summary.isRunning, true);
  assert.equal(summary.hasUnread, false);
  assert.equal(summary.herdrBot, null);
});
```

- [ ] **Step 3: 실패 확인**

```bash
node --test core/test/entries.test.ts core/test/summaries.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: 구현**

`core/src/herdr/types.ts`:
```ts
export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";
export type BotRuntimeStatus = HerdrAgentStatus | "offline";

export interface BotRuntime {
  readonly status: BotRuntimeStatus;
  readonly paneId: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly kind: string | null;
}

export const OFFLINE_RUNTIME: BotRuntime = { status: "offline", paneId: null, workspaceId: null, sessionId: null, kind: null };

export interface HerdrAgentInfo {
  readonly name: string | null;
  readonly agent: string | null;
  readonly agent_status: HerdrAgentStatus;
  readonly pane_id: string;
  readonly tab_id: string | null;
  readonly workspace_id: string | null;
  readonly cwd: string | null;
  readonly agent_session: { readonly value: string } | null;
}

const STATUSES: ReadonlySet<string> = new Set(["idle", "working", "blocked", "done", "unknown"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function projectHerdrAgentInfo(value: unknown): HerdrAgentInfo | null {
  if (!isRecord(value) || typeof value.pane_id !== "string") return null;
  const status = typeof value.agent_status === "string" && STATUSES.has(value.agent_status) ? (value.agent_status as HerdrAgentStatus) : "unknown";
  const session = isRecord(value.agent_session) && typeof value.agent_session.value === "string" ? { value: value.agent_session.value } : null;
  return {
    name: stringOrNull(value.name),
    agent: stringOrNull(value.agent),
    agent_status: status,
    pane_id: value.pane_id,
    tab_id: stringOrNull(value.tab_id),
    workspace_id: stringOrNull(value.workspace_id),
    cwd: stringOrNull(value.cwd),
    agent_session: session,
  };
}

export function runtimeFromAgentInfo(info: HerdrAgentInfo): BotRuntime {
  return { status: info.agent_status, paneId: info.pane_id, workspaceId: info.workspace_id, sessionId: info.agent_session?.value ?? null, kind: info.agent };
}

export class HerdrError extends Error {
  readonly code: string;
  readonly detail: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = "HerdrError";
    this.code = code;
    this.detail = detail;
  }
}
```

`core/src/model/entries.ts`:
```ts
import type { GroupMessage } from "../group/group-chat.ts";
import type { NewEntry, StoredEntry } from "../store/transcript-store.ts";

export interface Author {
  readonly id: string;
  readonly name: string;
}

export interface Reaction {
  readonly emoji: string;
  readonly by: string;
}

export const USER_AUTHOR_ID = "user";
export const REACTION_SELF = "me";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function projectAuthor(value: unknown): Author | null {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" ? { id: value.id, name: value.name } : null;
}

export function userMessageEntry(args: {
  readonly content: string;
  readonly timestampMs: number;
  readonly userName: string;
  readonly clientNonce?: string;
  readonly richText?: string;
  readonly replyTo?: string;
}): NewEntry {
  return {
    kind: "message",
    role: "user",
    content: args.content,
    isStreaming: false,
    timestampMs: args.timestampMs,
    author: { id: USER_AUTHOR_ID, name: args.userName },
    ...(args.clientNonce == null ? {} : { clientNonce: args.clientNonce }),
    ...(args.richText == null || args.richText.length === 0 ? {} : { richText: args.richText }),
    ...(args.replyTo == null ? {} : { replyTo: args.replyTo }),
  };
}

export function botMessageEntry(args: { readonly content: string; readonly author: Author; readonly timestampMs: number }): NewEntry {
  return { kind: "send-message", message: { type: "text", content: args.content }, author: args.author, timestampMs: args.timestampMs };
}

export function noticeEntry(args: { readonly content: string; readonly timestampMs: number }): NewEntry {
  return { kind: "notice", content: args.content, timestampMs: args.timestampMs };
}

function projectReactions(value: unknown): Reaction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => (isRecord(item) && typeof item.emoji === "string" && typeof item.by === "string" ? [{ emoji: item.emoji, by: item.by }] : []));
}

export function toggleReaction(entry: StoredEntry, emoji: string, by: string = REACTION_SELF): StoredEntry {
  const current = projectReactions(entry.reactions);
  const matches = (reaction: Reaction): boolean => reaction.emoji === emoji && reaction.by === by;
  const reactions = current.some(matches) ? current.filter((reaction) => !matches(reaction)) : [...current, { emoji, by }];
  return { ...entry, reactions };
}

export function entryText(entry: StoredEntry): string | null {
  if ((entry.kind === "message" || entry.kind === "notice") && typeof entry.content === "string") return entry.content;
  if (entry.kind === "send-message" && isRecord(entry.message) && entry.message.type === "text" && typeof entry.message.content === "string") return entry.message.content;
  return null;
}

export function toGroupMessage(entry: StoredEntry): GroupMessage | null {
  const content = entryText(entry);
  if (content == null || entry.kind === "notice") return null;
  const author = projectAuthor(entry.author);
  if (entry.kind === "message") return { speaker: { kind: "user", ...(author == null ? {} : { name: author.name }) }, content };
  if (author == null) return null;
  return { speaker: { kind: "member", id: author.id, name: author.name }, content };
}

export function lastEntryPreview(entry: StoredEntry | null): { readonly kind: "text"; readonly text: string } | null {
  const text = entry == null ? null : entryText(entry);
  return text == null ? null : { kind: "text", text };
}
```

`core/src/model/summaries.ts`:
```ts
import type { BotRuntime } from "../herdr/types.ts";
import type { BotProfile } from "../store/profile-store.ts";
import type { RoomConfig } from "../store/room-store.ts";
import type { StoredEntry } from "../store/transcript-store.ts";
import type { ChatViewState } from "../store/view-state-store.ts";
import { entryText, lastEntryPreview } from "./entries.ts";

export type AwaitingReason = "approval" | "offline" | "setup";

export interface HerdrBotFacts {
  readonly kind: string | null;
  readonly status: string;
  readonly paneId: string | null;
  readonly cwd: string | null;
  readonly adopted: boolean;
  readonly permissionMode: string;
}

/** Field set read by the grok-bot renderer's projectRendererAgent(). */
export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly title: string;
  readonly avatarDataUrl: null;
  readonly avatarVersion: null;
  readonly avatarShape: string | null;
  readonly avatarColor: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly isRunning: boolean;
  readonly isComposingMessage: boolean;
  readonly currentActivity: { readonly verb: "working" } | null;
  readonly lastEntry: { readonly kind: "text"; readonly text: string } | null;
  readonly lastMessageId: string | null;
  readonly lastMessagePreview: string | null;
  readonly newestEntryId: string | null;
  readonly hasUnread: boolean;
  readonly unreadCount: number;
  readonly lastViewedAt: number;
  readonly lastActivityAt: number;
  readonly awaitingUserResponse: { readonly reason: AwaitingReason } | null;
  readonly notificationsEnabled: boolean;
  readonly notifyOnUpdatesEnabled: boolean;
  readonly isHiddenFromSidebar: boolean;
  readonly origin: "user";
  readonly isGroup: boolean;
  readonly memberIds: readonly string[];
  readonly conversationPartnerIds: readonly string[];
  readonly herdrBot: HerdrBotFacts | null;
}

function unread(view: ChatViewState): boolean {
  return view.isManuallyUnread || view.lastActivityAt > view.lastViewedAt;
}

function awaiting(runtime: BotRuntime): { reason: AwaitingReason } | null {
  if (runtime.status === "blocked") return { reason: "approval" };
  if (runtime.status === "offline") return { reason: "offline" };
  return null;
}

function lastFields(last: StoredEntry | null): Pick<AgentSummary, "lastEntry" | "lastMessageId" | "lastMessagePreview" | "newestEntryId"> {
  const text = last == null ? null : entryText(last);
  return { lastEntry: lastEntryPreview(last), lastMessageId: last?.id ?? null, lastMessagePreview: text, newestEntryId: last?.id ?? null };
}

export function botSummary(args: {
  readonly profile: BotProfile;
  readonly runtime: BotRuntime;
  readonly last: StoredEntry | null;
  readonly view: ChatViewState;
  readonly isTurnActive: boolean;
}): AgentSummary {
  const { profile, runtime, view } = args;
  const isRunning = runtime.status === "working" || args.isTurnActive;
  const isUnread = unread(view);
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    title: "",
    avatarDataUrl: null,
    avatarVersion: null,
    avatarShape: profile.avatarShape,
    avatarColor: profile.avatarColor,
    createdAt: profile.createdAt,
    updatedAt: Math.max(profile.updatedAt, view.lastActivityAt),
    isRunning,
    isComposingMessage: false,
    currentActivity: isRunning ? { verb: "working" } : null,
    ...lastFields(args.last),
    hasUnread: isUnread,
    unreadCount: isUnread ? 1 : 0,
    lastViewedAt: view.lastViewedAt,
    lastActivityAt: view.lastActivityAt,
    awaitingUserResponse: awaiting(runtime),
    notificationsEnabled: false,
    notifyOnUpdatesEnabled: profile.notifyOnUpdatesEnabled,
    isHiddenFromSidebar: profile.isHiddenFromSidebar,
    origin: "user",
    isGroup: false,
    memberIds: [],
    conversationPartnerIds: [],
    herdrBot: { kind: profile.kind, status: runtime.status, paneId: runtime.paneId ?? profile.herdr.paneId, cwd: profile.cwd, adopted: profile.adopted, permissionMode: profile.permissionMode },
  };
}

export function roomSummary(args: {
  readonly room: RoomConfig;
  readonly last: StoredEntry | null;
  readonly view: ChatViewState;
  readonly isTurnActive: boolean;
}): AgentSummary {
  const { room, view } = args;
  const isUnread = unread(view);
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    title: "",
    avatarDataUrl: null,
    avatarVersion: null,
    avatarShape: null,
    avatarColor: null,
    createdAt: room.createdAt,
    updatedAt: Math.max(room.updatedAt, view.lastActivityAt),
    isRunning: args.isTurnActive,
    isComposingMessage: false,
    currentActivity: args.isTurnActive ? { verb: "working" } : null,
    ...lastFields(args.last),
    hasUnread: isUnread,
    unreadCount: isUnread ? 1 : 0,
    lastViewedAt: view.lastViewedAt,
    lastActivityAt: view.lastActivityAt,
    awaitingUserResponse: null,
    notificationsEnabled: false,
    notifyOnUpdatesEnabled: true,
    isHiddenFromSidebar: room.isHiddenFromSidebar,
    origin: "user",
    isGroup: true,
    memberIds: room.memberIds,
    conversationPartnerIds: [],
    herdrBot: null,
  };
}
```

- [ ] **Step 5: 통과 확인**

```bash
node --test core/test/entries.test.ts core/test/summaries.test.ts && npm run typecheck
```
Expected: `# pass 7`. (`profile-store.test.ts`/`room-store.test.ts`에서 `sampleProfile`/`sampleRoom`을 export하므로 import 시 그 파일의 테스트도 함께 등록되어 pass 수가 더 클 수 있다 — fail 0이면 된다.)

- [ ] **Step 6: 커밋**

```bash
git add core/src/model core/src/herdr/types.ts core/src/group/group-chat.ts core/test/entries.test.ts core/test/summaries.test.ts
git commit -m "feat(core): add transcript entry constructors and renderer agent summaries"
```

---

### Task 6: grok-bot 단체방 순수 함수 이식 (`group-chat.ts`)

**Files:**
- Modify: `core/src/group/group-chat.ts` (Task 5의 타입 파일에 함수·상수 추가)
- Test: `core/test/group-chat.test.ts`

**Interfaces:**
- Produces (grok-bot `source/host/groups/group-chat.ts`의 동작을 재구현; 이름·상수 동일):
  - 상수 `GROUP_MAX_MEMBER_TURNS = 10`, `GROUP_MAX_ROUNDS = 3`, `GROUP_PROMPT_HISTORY_LIMIT = 24`, `GROUP_MAX_MESSAGES_PER_TURN = 2`, `GROUP_MAX_MEMBERS = 6`
  - `orderRoundSpeakers<T>(memberIds: readonly T[], round: number): T[]` — 라운드마다 시작점을 한 칸씩 회전
  - `isSameMemberSet(a, b): boolean`
  - `memberMentionHandles(name): string[]` — 소문자 전체, 공백 제거형, 첫 단어
  - `parseGroupMentions(text, members): { isEveryone: boolean; memberIds: string[] }` — `@handle` 단어 경계 매칭, `@everyone`/`@all`
  - `resolveResponders(members, history): members[]` — 마지막 user 메시지 이후 멘션된 멤버만, 없거나 @all이면 전원
  - `isPassContent(content): boolean` — 빈 문자열 또는 `(pass)`/`pass`
  - `formatGroupLine(message, viewerId)`, `formatGroupHistory(history, viewerId, limit?)`
  - `messagesSinceMemberLastSpoke(history, memberId): GroupMessage[]`
- 봇 id 자체도 멘션 핸들에 포함시킨다(herdr-bot 확장: `@reviewer`가 표시 이름 "Code Reviewer"와 별개로 항상 통해야 함) → `memberMentionHandles(name, id?)`.

- [ ] **Step 1: 실패하는 테스트**

`core/test/group-chat.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_MAX_MEMBER_TURNS, GROUP_MAX_MESSAGES_PER_TURN, GROUP_MAX_ROUNDS,
  formatGroupHistory, isPassContent, isSameMemberSet, memberMentionHandles, messagesSinceMemberLastSpoke,
  orderRoundSpeakers, parseGroupMentions, resolveResponders, type GroupMember, type GroupMessage,
} from "../src/group/group-chat.ts";

const members: GroupMember[] = [
  { id: "reviewer", name: "Code Reviewer", description: "" },
  { id: "fixer", name: "Fixer", description: "" },
  { id: "writer", name: "Doc Writer", description: "" },
];
const user = (content: string): GroupMessage => ({ speaker: { kind: "user", name: "ray" }, content });
const said = (id: string, content: string): GroupMessage => ({ speaker: { kind: "member", id, name: id }, content });

test("constants match grok-bot", () => {
  assert.deepEqual([GROUP_MAX_ROUNDS, GROUP_MAX_MEMBER_TURNS, GROUP_MAX_MESSAGES_PER_TURN], [3, 10, 2]);
});

test("orderRoundSpeakers rotates the start by round", () => {
  assert.deepEqual(orderRoundSpeakers(["a", "b", "c"], 0), ["a", "b", "c"]);
  assert.deepEqual(orderRoundSpeakers(["a", "b", "c"], 1), ["b", "c", "a"]);
  assert.deepEqual(orderRoundSpeakers(["a", "b", "c"], 4), ["b", "c", "a"]);
  assert.deepEqual(orderRoundSpeakers([], 2), []);
});

test("isSameMemberSet ignores order", () => {
  assert.equal(isSameMemberSet(["a", "b"], ["b", "a"]), true);
  assert.equal(isSameMemberSet(["a"], ["a", "b"]), false);
});

test("mention handles include lowercase name, squashed name, first word, and the id", () => {
  assert.deepEqual(memberMentionHandles("Code Reviewer", "reviewer").sort(), ["code", "code reviewer", "codereviewer", "reviewer"].sort());
  assert.deepEqual(memberMentionHandles("  "), []);
});

test("parseGroupMentions matches @handles on word boundaries and @everyone", () => {
  assert.deepEqual(parseGroupMentions("hey @reviewer and @fixer, not @fixerman", members), { isEveryone: false, memberIds: ["reviewer", "fixer"] });
  assert.deepEqual(parseGroupMentions("@all please", members), { isEveryone: true, memberIds: [] });
  assert.deepEqual(parseGroupMentions("@CodeReviewer?", members).memberIds, ["reviewer"]);
});

test("resolveResponders picks mentioned members since the last user message, else everyone", () => {
  assert.deepEqual(resolveResponders(members, [user("hello all")]).map((m) => m.id), ["reviewer", "fixer", "writer"]);
  assert.deepEqual(resolveResponders(members, [user("@writer old"), said("writer", "ok"), user("@fixer fix it")]).map((m) => m.id), ["fixer"]);
  assert.deepEqual(resolveResponders(members, [user("@fixer fix it"), said("fixer", "@reviewer check")]).map((m) => m.id), ["reviewer", "fixer"]);
  assert.deepEqual(resolveResponders(members, [user("@everyone")]).length, 3);
});

test("isPassContent accepts pass variants", () => {
  for (const value of ["", "  ", "pass", "(pass)", "(PASS).", "Pass."]) assert.equal(isPassContent(value), true, value);
  assert.equal(isPassContent("pass the salt"), false);
});

test("history formatting marks the viewer and honours the limit", () => {
  const history = [user("go"), said("reviewer", "on it"), said("fixer", "me too")];
  assert.equal(formatGroupHistory(history, "reviewer"), "ray (user): go\nreviewer (you): on it\nfixer: me too");
  assert.equal(formatGroupHistory(history, "reviewer", 1), "fixer: me too");
  assert.equal(formatGroupHistory([], "x"), "(no messages yet)");
});

test("messagesSinceMemberLastSpoke slices after the member's last message", () => {
  const history = [user("a"), said("reviewer", "b"), user("c"), said("fixer", "d")];
  assert.deepEqual(messagesSinceMemberLastSpoke(history, "reviewer").map((m) => m.content), ["c", "d"]);
  assert.deepEqual(messagesSinceMemberLastSpoke(history, "writer").map((m) => m.content), ["a", "b", "c", "d"]);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/group-chat.test.ts
```
Expected: FAIL — `orderRoundSpeakers` 등 export 없음.

- [ ] **Step 3: 구현 (기존 타입 아래에 추가)**

`core/src/group/group-chat.ts` 전체:
```ts
export interface GroupMember {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export type GroupSpeaker =
  | { readonly kind: "user"; readonly name?: string }
  | { readonly kind: "member"; readonly id: string; readonly name: string };

export interface GroupMessage {
  readonly speaker: GroupSpeaker;
  readonly content: string;
}

export const GROUP_MAX_MEMBER_TURNS = 10;
export const GROUP_MAX_ROUNDS = 3;
export const GROUP_PROMPT_HISTORY_LIMIT = 24;
export const GROUP_MAX_MESSAGES_PER_TURN = 2;
export const GROUP_MAX_MEMBERS = 6;

export function orderRoundSpeakers<T>(memberIds: readonly T[], round: number): T[] {
  if (memberIds.length === 0) return [];
  const offset = ((round % memberIds.length) + memberIds.length) % memberIds.length;
  return [...memberIds.slice(offset), ...memberIds.slice(0, offset)];
}

export function isSameMemberSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

export function memberMentionHandles(name: string, id?: string): string[] {
  const lower = name.trim().toLowerCase();
  const handles = new Set<string>();
  if (lower.length > 0) {
    handles.add(lower);
    handles.add(lower.replace(/\s+/g, ""));
    const first = lower.split(/\s+/)[0];
    if (first) handles.add(first);
  }
  if (id != null && id.length > 0) handles.add(id.toLowerCase());
  return [...handles];
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[a-z0-9_-]/.test(char);
}

function hasMentionAt(lower: string, handle: string): boolean {
  const needle = `@${handle}`;
  for (let index = lower.indexOf(needle); index >= 0; index = lower.indexOf(needle, index + 1)) {
    if (!isWordChar(lower[index - 1]) && !isWordChar(lower[index + needle.length])) return true;
  }
  return false;
}

export function parseGroupMentions(text: string, members: readonly Pick<GroupMember, "id" | "name">[]): { isEveryone: boolean; memberIds: string[] } {
  const lower = text.toLowerCase();
  const memberIds: string[] = [];
  for (const member of members) {
    if (memberIds.includes(member.id)) continue;
    if (memberMentionHandles(member.name, member.id).some((handle) => hasMentionAt(lower, handle))) memberIds.push(member.id);
  }
  return { isEveryone: /(?:^|[^a-z0-9])@(everyone|all)\b/.test(lower), memberIds };
}

export function resolveResponders<T extends Pick<GroupMember, "id" | "name">>(members: readonly T[], history: readonly GroupMessage[]): T[] {
  let start = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.speaker.kind === "user") {
      start = index;
      break;
    }
  }
  let everyone = false;
  const mentioned = new Set<string>();
  for (const message of history.slice(start)) {
    const targets = parseGroupMentions(message.content, members);
    everyone ||= targets.isEveryone;
    for (const id of targets.memberIds) mentioned.add(id);
  }
  return everyone || mentioned.size === 0 ? [...members] : members.filter((member) => mentioned.has(member.id));
}

export function isPassContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.length === 0 || /^\(?\s*pass\s*\)?\.?$/i.test(trimmed);
}

export function formatGroupLine(message: GroupMessage, viewerId: string): string {
  if (message.speaker.kind === "user") return message.speaker.name ? `${message.speaker.name} (user): ${message.content}` : `User: ${message.content}`;
  return `${message.speaker.name}${message.speaker.id === viewerId ? " (you)" : ""}: ${message.content}`;
}

export function formatGroupHistory(history: readonly GroupMessage[], viewerId: string, limit: number = GROUP_PROMPT_HISTORY_LIMIT): string {
  const recent = history.slice(-limit);
  return recent.length === 0 ? "(no messages yet)" : recent.map((message) => formatGroupLine(message, viewerId)).join("\n");
}

export function messagesSinceMemberLastSpoke(history: readonly GroupMessage[], memberId: string): GroupMessage[] {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const speaker = history[index]?.speaker;
    if (speaker?.kind === "member" && speaker.id === memberId) return history.slice(index + 1);
  }
  return [...history];
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/group-chat.test.ts core/test/entries.test.ts && npm run typecheck
```
Expected: 모두 pass.

- [ ] **Step 5: 커밋**

```bash
git add core/src/group/group-chat.ts core/test/group-chat.test.ts
git commit -m "feat(core): port grok-bot group chat mention, responder, and history rules"
```

---

### Task 7: 라운드로빈 오케스트레이터

**Files:**
- Create: `core/src/group/orchestrator.ts`
- Test: `core/test/orchestrator.test.ts`

**Interfaces:**
- Consumes: Task 6 함수/상수
- Produces:
  - `type TurnOutcome = "settled" | "busy" | "blocked" | "stalled" | "timeout" | "offline" | "error"`
  - `interface MemberTurnResult { outcome: TurnOutcome; spoken: readonly string[] }`
  - `interface GroupOrchestratorDeps { resolveMembers(ids): Promise<GroupMember[]>; readHistory(): readonly GroupMessage[]; isCurrent(): boolean; runMemberTurn(args: { member; peers; newMessages; round }): Promise<MemberTurnResult>; onMemberTurnEnded?(member, result): void }`
  - `interface GroupOrchestratorOptions { maxRounds?: number; maxMemberTurns?: number }`
  - `class GroupChatOrchestrator { constructor(deps, options?); run(args: { memberIds }): Promise<void> }`
- grok-bot과의 차이: 발언은 `say` 핸들러가 이미 트랜스크립트에 붙였으므로 오케스트레이터는 `postMemberMessage`를 하지 않고 `spoken.length`만 센다.

- [ ] **Step 1: 실패하는 테스트**

`core/test/orchestrator.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { GroupChatOrchestrator, type MemberTurnResult } from "../src/group/orchestrator.ts";
import type { GroupMember, GroupMessage } from "../src/group/group-chat.ts";

const members: GroupMember[] = [
  { id: "a", name: "A", description: "" },
  { id: "b", name: "B", description: "" },
];

interface Script { readonly [memberId: string]: readonly MemberTurnResult[] }

function harness(script: Script, initial: GroupMessage[] = [{ speaker: { kind: "user", name: "ray" }, content: "go" }]) {
  const history: GroupMessage[] = [...initial];
  const turns: { member: string; round: number; newMessages: number }[] = [];
  const counters = new Map<string, number>();
  let current = true;
  const orchestrator = new GroupChatOrchestrator({
    resolveMembers: async (ids) => members.filter((member) => ids.includes(member.id)),
    readHistory: () => history,
    isCurrent: () => current,
    runMemberTurn: async ({ member, round, newMessages }) => {
      turns.push({ member: member.id, round, newMessages: newMessages.length });
      const index = counters.get(member.id) ?? 0;
      counters.set(member.id, index + 1);
      const result = script[member.id]?.[index] ?? { outcome: "settled", spoken: [] };
      for (const content of result.spoken) history.push({ speaker: { kind: "member", id: member.id, name: member.name }, content });
      return result;
    },
  });
  return { orchestrator, turns, history, cancel: () => { current = false; } };
}

test("everyone speaks in round 0; a silent round ends the run", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["hi"] }], b: [{ outcome: "settled", spoken: ["hey"] }] });
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(h.turns.map((t) => `${t.member}:${t.round}`), ["a:0", "b:0", "b:1", "a:1"]);
});

test("round 1 starts with the second speaker and passes newMessages since last spoke", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["a1"] }, { outcome: "settled", spoken: [] }], b: [{ outcome: "settled", spoken: ["b1"] }, { outcome: "settled", spoken: ["b2"] }] });
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(h.turns, [
    { member: "a", round: 0, newMessages: 1 },
    { member: "b", round: 0, newMessages: 2 },
    { member: "b", round: 1, newMessages: 0 },
    { member: "a", round: 1, newMessages: 2 },
    { member: "a", round: 2, newMessages: 2 },
    { member: "b", round: 2, newMessages: 0 },
  ]);
});

test("mentions restrict responders per round", async () => {
  const h = harness({ b: [{ outcome: "settled", spoken: [] }] }, [{ speaker: { kind: "user", name: "ray" }, content: "@b only you" }]);
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(h.turns.map((t) => t.member), ["b"]);
});

test("run stops when epoch is no longer current", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["x"] }] });
  h.cancel();
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  assert.equal(h.turns.length, 0);
});

test("total message cap ends the run", async () => {
  const chatty: MemberTurnResult[] = Array.from({ length: 6 }, () => ({ outcome: "settled", spoken: ["m", "m"] }));
  const h = harness({ a: chatty, b: chatty });
  await h.orchestrator.run({ memberIds: ["a", "b"] });
  const spoken = h.history.filter((m) => m.speaker.kind === "member").length;
  assert.equal(spoken, 10);
});

test("maxRounds option limits DM-style single member turns", async () => {
  const h = harness({ a: [{ outcome: "settled", spoken: ["one"] }, { outcome: "settled", spoken: ["two"] }] });
  const single = new GroupChatOrchestrator({
    resolveMembers: async () => [members[0]!],
    readHistory: () => h.history,
    isCurrent: () => true,
    runMemberTurn: async (args) => { h.turns.push({ member: args.member.id, round: args.round, newMessages: args.newMessages.length }); return { outcome: "settled", spoken: ["one"] }; },
  }, { maxRounds: 1 });
  await single.run({ memberIds: ["a"] });
  assert.equal(h.turns.length, 1);
});

test("onMemberTurnEnded receives every outcome, and non-settled outcomes count as silence", async () => {
  const ended: string[] = [];
  const orchestrator = new GroupChatOrchestrator({
    resolveMembers: async () => members,
    readHistory: () => [{ speaker: { kind: "user" }, content: "go" }],
    isCurrent: () => true,
    runMemberTurn: async ({ member }) => ({ outcome: member.id === "a" ? "busy" : "blocked", spoken: [] }),
    onMemberTurnEnded: (member, result) => { ended.push(`${member.id}:${result.outcome}`); },
  });
  await orchestrator.run({ memberIds: ["a", "b"] });
  assert.deepEqual(ended, ["a:busy", "b:blocked"]);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/orchestrator.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/group/orchestrator.ts`:
```ts
import {
  GROUP_MAX_MEMBER_TURNS,
  GROUP_MAX_ROUNDS,
  messagesSinceMemberLastSpoke,
  orderRoundSpeakers,
  resolveResponders,
  type GroupMember,
  type GroupMessage,
} from "./group-chat.ts";

export type TurnOutcome = "settled" | "busy" | "blocked" | "stalled" | "timeout" | "offline" | "error";

export interface MemberTurnResult {
  readonly outcome: TurnOutcome;
  readonly spoken: readonly string[];
}

export interface MemberTurnArgs {
  readonly member: GroupMember;
  readonly peers: readonly GroupMember[];
  readonly newMessages: readonly GroupMessage[];
  readonly round: number;
}

export interface GroupOrchestratorDeps {
  resolveMembers(ids: readonly string[]): Promise<GroupMember[]>;
  readHistory(): readonly GroupMessage[];
  isCurrent(): boolean;
  runMemberTurn(args: MemberTurnArgs): Promise<MemberTurnResult>;
  onMemberTurnEnded?(member: GroupMember, result: MemberTurnResult): void;
}

export interface GroupOrchestratorOptions {
  readonly maxRounds?: number;
  readonly maxMemberTurns?: number;
}

/** Bounded, epoch-cancellable round robin for one room turn (ported from grok-bot). */
export class GroupChatOrchestrator {
  readonly deps: GroupOrchestratorDeps;
  readonly maxRounds: number;
  readonly maxMemberTurns: number;

  constructor(deps: GroupOrchestratorDeps, options: GroupOrchestratorOptions = {}) {
    this.deps = deps;
    this.maxRounds = options.maxRounds ?? GROUP_MAX_ROUNDS;
    this.maxMemberTurns = options.maxMemberTurns ?? GROUP_MAX_MEMBER_TURNS;
  }

  async run(args: { readonly memberIds: readonly string[] }): Promise<void> {
    const members = await this.deps.resolveMembers(args.memberIds);
    if (members.length === 0) return;
    const memberById = new Map(members.map((member) => [member.id, member]));
    let totalMessages = 0;

    for (let round = 0; round < this.maxRounds; round += 1) {
      if (!this.deps.isCurrent()) return;
      const responderIds = resolveResponders(members, this.deps.readHistory()).map((member) => member.id);
      let messagesThisRound = 0;

      for (const memberId of orderRoundSpeakers(responderIds, round)) {
        if (totalMessages >= this.maxMemberTurns || !this.deps.isCurrent()) return;
        const member = memberById.get(memberId);
        if (member == null) continue;
        const result = await this.runOneTurn(member, members, round);
        this.deps.onMemberTurnEnded?.(member, result);
        totalMessages += result.spoken.length;
        messagesThisRound += result.spoken.length;
        if (totalMessages >= this.maxMemberTurns) return;
      }

      if (messagesThisRound === 0) return;
    }
  }

  private async runOneTurn(member: GroupMember, members: readonly GroupMember[], round: number): Promise<MemberTurnResult> {
    const peers = members.filter((other) => other.id !== member.id);
    const newMessages = messagesSinceMemberLastSpoke(this.deps.readHistory(), member.id);
    try {
      return await this.deps.runMemberTurn({ member, peers, newMessages, round });
    } catch {
      return { outcome: "error", spoken: [] };
    }
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/orchestrator.test.ts && npm run typecheck
```
Expected: `# pass 7`.

- [ ] **Step 5: 커밋**

```bash
git add core/src/group/orchestrator.ts core/test/orchestrator.test.ts
git commit -m "feat(core): add round-robin group chat orchestrator"
```

---

### Task 8: herdr CLI 어댑터 + 가짜 herdr 바이너리

**Files:**
- Create: `core/src/herdr/cli.ts`
- Create: `core/test/helpers/fake-herdr.mjs`, `core/test/helpers/fake-herdr-state.ts`
- Test: `core/test/herdr-cli.test.ts`

**Interfaces:**
- Consumes: `HerdrAgentInfo`, `HerdrError`, `projectHerdrAgentInfo`(Task 5)
- Produces `core/src/herdr/cli.ts`:
  ```ts
  interface HerdrCli {
    agentList(): Promise<HerdrAgentInfo[]>;
    agentGet(target: string): Promise<HerdrAgentInfo>;
    agentStart(args: { name: string; kind: string; paneId: string; agentArgs: readonly string[]; timeoutMs?: number }): Promise<HerdrAgentInfo>;
    agentPrompt(args: { target: string; text: string; wait: boolean; until?: readonly HerdrAgentStatus[]; timeoutMs?: number }): Promise<HerdrAgentInfo | null>;
    agentRename(target: string, name: string | null): Promise<void>;
    agentFocus(target: string): Promise<void>;
    agentRead(target: string, lines: number): Promise<string>;
    workspaceList(): Promise<{ workspace_id: string; label: string }[]>;
    workspaceCreate(args: { cwd: string; label: string }): Promise<{ workspaceId: string; rootPaneId: string }>;
    tabCreate(args: { workspaceId: string; cwd: string; label: string }): Promise<{ tabId: string; rootPaneId: string }>;
    paneClose(paneId: string): Promise<void>;
    notify(title: string, body: string): Promise<void>;
  }
  function createHerdrCli(binPath: string, env?: NodeJS.ProcessEnv): HerdrCli
  ```
  실패는 항상 `HerdrError(code)`로 던진다 (`agent_blocked`, `agent_prompt_stalled`, `timeout`, `agent_not_running`, `agent_not_ready`, `herdr_error`, `herdr_spawn_failed`, `herdr_bad_json`).
- Produces 테스트 헬퍼:
  - `fake-herdr.mjs`: `FAKE_HERDR_STATE`(JSON 파일)로 상태를 읽고 쓰는 가짜 `herdr`. `FAKE_HERDR_LOG`에 호출 argv를 JSONL로 기록. `agent prompt`는 상태의 `onPrompt[name]` 스크립트에 따라 **호스트 control 소켓(`$HERDR_BOT_HOME/host.sock`)에 직접 `say` 요청**을 보낸 뒤 `finalStatus`로 응답한다(Task 12/14에서 사용).
  - `fake-herdr-state.ts`: `installFakeHerdr(home): { binPath, statePath, logPath, writeState(state), readState(), readLog() }` + `FakeHerdrState` 타입.

- [ ] **Step 1: 가짜 herdr 작성**

`core/test/helpers/fake-herdr.mjs`:
```js
#!/usr/bin/env node
// Fake `herdr` binary for tests. State lives in $FAKE_HERDR_STATE (JSON); every call is logged to $FAKE_HERDR_LOG.
import { readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { connect } from "node:net";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const statePath = process.env.FAKE_HERDR_STATE;
const logPath = process.env.FAKE_HERDR_LOG;
if (!statePath) fail("fake_config", "FAKE_HERDR_STATE is not set");
const state = JSON.parse(readFileSync(statePath, "utf8"));
state.agents ??= [];
state.workspaces ??= [];
state.counters ??= { workspace: state.workspaces.length + 1, pane: 100, tab: 10 };
state.onPrompt ??= {};
state.prompts ??= [];
if (logPath) appendFileSync(logPath, `${JSON.stringify({ argv: process.argv.slice(2) })}\n`);

const argv = process.argv.slice(2);
const [group, command, ...rest] = argv;

function ok(result) {
  process.stdout.write(`${JSON.stringify({ id: "fake", result })}\n`);
  save();
  process.exit(0);
}
function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ id: "fake", error: { code, message } })}\n`);
  process.exit(1);
}
function save() {
  const temp = `${statePath}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, statePath);
}
function flag(name) {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
}
function positionals() {
  const out = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--") break;
    if (rest[i].startsWith("--")) { if (!["--wait", "--no-focus", "--clear"].includes(rest[i])) i += 1; continue; }
    out.push(rest[i]);
  }
  return out;
}
function afterDoubleDash() {
  const index = rest.indexOf("--");
  return index >= 0 ? rest.slice(index + 1) : [];
}
function findAgent(target) {
  return state.agents.find((agent) => agent.name === target || agent.pane_id === target) ?? null;
}

function controlRequest(method, params) {
  return new Promise((resolve, reject) => {
    const socketPath = join(process.env.HERDR_BOT_HOME ?? "", "host.sock");
    const socket = connect(socketPath);
    let buffer = "";
    socket.on("connect", () => socket.write(`${JSON.stringify({ id: "fake-1", method, params })}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const reply = JSON.parse(buffer.slice(0, newline));
      socket.destroy();
      reply.error ? reject(new Error(reply.error.code)) : resolve(reply.result);
    });
    socket.on("error", reject);
  });
}

async function agentPrompt() {
  const [target, text] = positionals();
  const agent = findAgent(target);
  if (!agent) fail("agent_not_running", `no agent ${target}`);
  if (agent.agent_status === "blocked") fail("agent_blocked", "agent is blocked");
  state.prompts.push({ target, text });
  const script = state.onPrompt[agent.name] ?? null;
  // Only turn prompts carry a room/DM tag; the identity brief must not trigger scripted replies.
  const isTurnPrompt = /\[herdr-bot (room |DM\])/.test(text);
  const roomMatch = /\bsay (\S+) "/.exec(text);
  const chatId = roomMatch ? roomMatch[1] : null;
  if (script && chatId && isTurnPrompt) {
    for (const say of script.say ?? []) {
      try { await controlRequest("say", { chatId, text: say, paneId: agent.pane_id }); } catch (error) { state.sayErrors = [...(state.sayErrors ?? []), String(error.message)]; }
    }
    if (script.sayOnce) state.onPrompt[agent.name] = { ...script, say: [] };
  }
  const final = script?.finalStatus ?? "idle";
  if (final === "stalled") fail("agent_prompt_stalled", "no activity observed");
  if (final === "timeout") fail("timeout", "wait timed out");
  agent.agent_status = final;
  ok({ agent });
}

async function main() {
  if (group === "agent" && command === "list") return ok({ agents: state.agents });
  if (group === "agent" && command === "get") {
    const agent = findAgent(positionals()[0]);
    return agent ? ok({ agent }) : fail("agent_not_found", "no such agent");
  }
  if (group === "agent" && command === "start") {
    const [name] = positionals();
    const kind = flag("--kind"); const paneId = flag("--pane");
    if (state.agents.some((agent) => agent.pane_id === paneId)) fail("pane_busy", "pane already has an agent");
    if (state.agents.some((agent) => agent.name === name)) fail("agent_name_taken", "name in use");
    if (state.startBlocked?.includes(name)) fail("agent_not_ready", "blocked during startup");
    const workspaceId = paneId.split(":")[0];
    const agent = { name, agent: kind, agent_status: "idle", pane_id: paneId, tab_id: `${workspaceId}:t1`, workspace_id: workspaceId, cwd: state.cwdByPane?.[paneId] ?? "/tmp", agent_session: { value: randomUUID() }, args: afterDoubleDash() };
    state.agents.push(agent);
    return ok({ agent });
  }
  if (group === "agent" && command === "prompt") return agentPrompt();
  if (group === "agent" && command === "rename") {
    const [target, name] = positionals();
    const agent = findAgent(target);
    if (!agent) fail("agent_not_found", "no such agent");
    agent.name = rest.includes("--clear") ? null : name;
    return ok({ agent });
  }
  if (group === "agent" && command === "focus") return findAgent(positionals()[0]) ? ok({ type: "agent_focus" }) : fail("agent_not_found", "no such agent");
  if (group === "agent" && command === "read") { process.stdout.write("fake screen\n"); process.exit(0); }
  if (group === "workspace" && command === "list") return ok({ workspaces: state.workspaces });
  if (group === "workspace" && command === "create") {
    const id = `w${state.counters.workspace++}`;
    state.workspaces.push({ workspace_id: id, label: flag("--label") ?? id });
    const paneId = `${id}:p1`;
    state.cwdByPane = { ...(state.cwdByPane ?? {}), [paneId]: flag("--cwd") ?? "/tmp" };
    return ok({ workspace: { workspace_id: id }, tab: { tab_id: `${id}:t1` }, root_pane: { pane_id: paneId } });
  }
  if (group === "tab" && command === "create") {
    const workspaceId = flag("--workspace");
    if (!state.workspaces.some((ws) => ws.workspace_id === workspaceId)) fail("workspace_not_found", "no such workspace");
    const paneId = `${workspaceId}:p${state.counters.pane++}`;
    state.cwdByPane = { ...(state.cwdByPane ?? {}), [paneId]: flag("--cwd") ?? "/tmp" };
    return ok({ tab: { tab_id: `${workspaceId}:t${state.counters.tab++}` }, root_pane: { pane_id: paneId } });
  }
  if (group === "pane" && command === "close") {
    const [paneId] = positionals();
    state.agents = state.agents.filter((agent) => agent.pane_id !== paneId);
    state.closedPanes = [...(state.closedPanes ?? []), paneId];
    return ok({ type: "pane_close" });
  }
  if (group === "notification" && command === "show") return ok({ type: "notification_show", shown: true, reason: "shown" });
  fail("fake_unknown_command", `unhandled: ${argv.join(" ")}`);
}

main().catch((error) => fail("fake_crash", String(error?.stack ?? error)));
```

`core/test/helpers/fake-herdr-state.ts`:
```ts
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FakeAgent {
  name: string | null;
  agent: string;
  agent_status: "idle" | "working" | "blocked" | "done" | "unknown";
  pane_id: string;
  tab_id: string;
  workspace_id: string;
  cwd: string;
  agent_session?: { value: string } | null;
  args?: string[];
}

export interface FakeHerdrState {
  agents: FakeAgent[];
  workspaces: { workspace_id: string; label: string }[];
  /** `sayOnce` clears the script after its first turn so bots do not chatter through every round. */
  onPrompt?: Record<string, { say?: string[]; finalStatus?: string; sayOnce?: boolean }>;
  startBlocked?: string[];
  prompts?: { target: string; text: string }[];
  closedPanes?: string[];
  sayErrors?: string[];
}

export interface FakeHerdr {
  readonly binPath: string;
  readonly statePath: string;
  readonly logPath: string;
  readonly env: NodeJS.ProcessEnv;
  writeState(state: FakeHerdrState): void;
  readState(): FakeHerdrState;
  readLog(): string[][];
}

export const EMPTY_FAKE_STATE: FakeHerdrState = { agents: [], workspaces: [] };

export function installFakeHerdr(home: string, initial: FakeHerdrState = EMPTY_FAKE_STATE): FakeHerdr {
  const binPath = join(dirname(fileURLToPath(import.meta.url)), "fake-herdr.mjs");
  chmodSync(binPath, 0o755);
  const statePath = join(home, "fake-herdr-state.json");
  const logPath = join(home, "fake-herdr-log.jsonl");
  const env: NodeJS.ProcessEnv = { ...process.env, FAKE_HERDR_STATE: statePath, FAKE_HERDR_LOG: logPath, HERDR_BOT_HOME: home };
  const fake: FakeHerdr = {
    binPath,
    statePath,
    logPath,
    env,
    writeState: (state) => writeFileSync(statePath, JSON.stringify(state, null, 2)),
    readState: () => JSON.parse(readFileSync(statePath, "utf8")) as FakeHerdrState,
    readLog: () => (existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => (JSON.parse(line) as { argv: string[] }).argv) : []),
  };
  fake.writeState(initial);
  return fake;
}
```

- [ ] **Step 2: 실패하는 테스트**

`core/test/herdr-cli.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { HerdrError } from "../src/herdr/types.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

const idleAgent = { name: "reviewer", agent: "claude", agent_status: "idle" as const, pane_id: "w1:p2", tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp", agent_session: { value: "s1" } };

test("agentList projects agents and agentGet resolves by name or pane", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [idleAgent], workspaces: [{ workspace_id: "w1", label: "x" }] });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const agents = await cli.agentList();
    assert.equal(agents[0]?.name, "reviewer");
    assert.equal(agents[0]?.agent_session?.value, "s1");
    assert.equal((await cli.agentGet("w1:p2")).name, "reviewer");
    await assert.rejects(cli.agentGet("ghost"), (error: unknown) => error instanceof HerdrError && error.code === "agent_not_found");
  } finally {
    temp.cleanup();
  }
});

test("agentStart passes kind, pane, and agent args after --", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [{ workspace_id: "w1", label: "x" }] });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const started = await cli.agentStart({ name: "fixer", kind: "claude", paneId: "w1:p3", agentArgs: ["--permission-mode", "bypassPermissions"], timeoutMs: 45_000 });
    assert.equal(started.name, "fixer");
    const call = fake.readLog().at(-1)!;
    assert.deepEqual(call, ["agent", "start", "fixer", "--kind", "claude", "--pane", "w1:p3", "--timeout", "45000", "--", "--permission-mode", "bypassPermissions"]);
  } finally {
    temp.cleanup();
  }
});

test("agentPrompt maps herdr error codes and returns the settled agent", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [idleAgent, { ...idleAgent, name: "stuck", pane_id: "w1:p9", agent_status: "blocked" }], workspaces: [], onPrompt: { reviewer: { finalStatus: "idle" } } });
    const cli = createHerdrCli(fake.binPath, fake.env);
    const settled = await cli.agentPrompt({ target: "reviewer", text: "hello\nworld", wait: true, timeoutMs: 1_000 });
    assert.equal(settled?.agent_status, "idle");
    assert.deepEqual(fake.readLog().at(-1), ["agent", "prompt", "reviewer", "hello\nworld", "--wait", "--timeout", "1000"]);
    await assert.rejects(cli.agentPrompt({ target: "stuck", text: "x", wait: true }), (error: unknown) => error instanceof HerdrError && error.code === "agent_blocked");
    fake.writeState({ ...fake.readState(), onPrompt: { reviewer: { finalStatus: "stalled" } } });
    await assert.rejects(cli.agentPrompt({ target: "reviewer", text: "x", wait: true }), (error: unknown) => error instanceof HerdrError && error.code === "agent_prompt_stalled");
  } finally {
    temp.cleanup();
  }
});

test("workspace/tab/pane helpers return ids from the json result", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home);
    const cli = createHerdrCli(fake.binPath, fake.env);
    const workspace = await cli.workspaceCreate({ cwd: "/tmp/repo", label: "herdr-bot: repo" });
    assert.equal(workspace.workspaceId, "w1");
    assert.equal(workspace.rootPaneId, "w1:p1");
    const tab = await cli.tabCreate({ workspaceId: "w1", cwd: "/tmp/repo", label: "fixer" });
    assert.equal(tab.rootPaneId, "w1:p100");
    assert.deepEqual((await cli.workspaceList()).map((ws) => ws.workspace_id), ["w1"]);
    await cli.paneClose("w1:p100");
    assert.deepEqual(fake.readState().closedPanes, ["w1:p100"]);
    await cli.agentRename("w1:p1", null).catch(() => undefined);
    await cli.notify("t", "b");
  } finally {
    temp.cleanup();
  }
});

test("a missing binary surfaces as herdr_spawn_failed", async () => {
  const cli = createHerdrCli("/definitely/not/herdr", {});
  await assert.rejects(cli.agentList(), (error: unknown) => error instanceof HerdrError && error.code === "herdr_spawn_failed");
});
```

- [ ] **Step 3: 실패 확인**

```bash
node --test core/test/herdr-cli.test.ts
```
Expected: FAIL — `../src/herdr/cli.ts` 없음.

- [ ] **Step 4: 구현**

`core/src/herdr/cli.ts`:
```ts
import { execFile } from "node:child_process";
import { HerdrError, projectHerdrAgentInfo, type HerdrAgentInfo, type HerdrAgentStatus } from "./types.ts";

export interface HerdrCli {
  agentList(): Promise<HerdrAgentInfo[]>;
  agentGet(target: string): Promise<HerdrAgentInfo>;
  agentStart(args: { name: string; kind: string; paneId: string; agentArgs: readonly string[]; timeoutMs?: number }): Promise<HerdrAgentInfo>;
  agentPrompt(args: { target: string; text: string; wait: boolean; until?: readonly HerdrAgentStatus[]; timeoutMs?: number }): Promise<HerdrAgentInfo | null>;
  agentRename(target: string, name: string | null): Promise<void>;
  agentFocus(target: string): Promise<void>;
  agentRead(target: string, lines: number): Promise<string>;
  workspaceList(): Promise<{ workspace_id: string; label: string }[]>;
  workspaceCreate(args: { cwd: string; label: string }): Promise<{ workspaceId: string; rootPaneId: string }>;
  tabCreate(args: { workspaceId: string; cwd: string; label: string }): Promise<{ tabId: string; rootPaneId: string }>;
  paneClose(paneId: string): Promise<void>;
  notify(title: string, body: string): Promise<void>;
}

const MAX_BUFFER = 16 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorFromStderr(stderr: string, fallback: string): HerdrError {
  const line = stderr.trim().split("\n").find((candidate) => candidate.startsWith("{"));
  if (line != null) {
    try {
      const parsed: unknown = JSON.parse(line);
      const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : parsed;
      const code = isRecord(error) && typeof error.code === "string" ? error.code : "herdr_error";
      const message = isRecord(error) && typeof error.message === "string" ? error.message : fallback;
      return new HerdrError(code, message, parsed);
    } catch {
      // fall through to a generic error
    }
  }
  return new HerdrError("herdr_error", stderr.trim().length > 0 ? stderr.trim() : fallback);
}

export interface RawHerdrRunner {
  (args: readonly string[]): Promise<{ stdout: string; stderr: string; code: number }>;
}

export function createExecFileRunner(binPath: string, env: NodeJS.ProcessEnv): RawHerdrRunner {
  return (args) => new Promise((resolve, reject) => {
    execFile(binPath, [...args], { env, maxBuffer: MAX_BUFFER, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error != null && (error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new HerdrError("herdr_spawn_failed", `cannot run herdr binary at ${binPath}`));
        return;
      }
      if (error != null && typeof (error as { code?: unknown }).code !== "number" && stdout.length === 0 && stderr.length === 0) {
        reject(new HerdrError("herdr_spawn_failed", error.message));
        return;
      }
      const code = error == null ? 0 : typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1;
      resolve({ stdout, stderr, code });
    });
  });
}

async function runJson(runner: RawHerdrRunner, args: readonly string[]): Promise<Record<string, unknown>> {
  const { stdout, stderr, code } = await runner(args);
  if (code !== 0) throw errorFromStderr(stderr, `herdr ${args.join(" ")} exited with ${code}`);
  try {
    const parsed: unknown = JSON.parse(stdout);
    const result = isRecord(parsed) && isRecord(parsed.result) ? parsed.result : null;
    if (result == null) throw new Error("no result");
    return result;
  } catch {
    throw new HerdrError("herdr_bad_json", `herdr ${args.slice(0, 2).join(" ")} returned non-JSON output: ${stdout.slice(0, 200)}`);
  }
}

function requireAgent(result: Record<string, unknown>, context: string): HerdrAgentInfo {
  const agent = projectHerdrAgentInfo(result.agent);
  if (agent == null) throw new HerdrError("herdr_bad_json", `${context}: result.agent is malformed`);
  return agent;
}

function requireString(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) throw new HerdrError("herdr_bad_json", `${context} is missing`);
  return value;
}

export function createHerdrCliFromRunner(runner: RawHerdrRunner): HerdrCli {
  return {
    async agentList() {
      const result = await runJson(runner, ["agent", "list"]);
      return Array.isArray(result.agents) ? result.agents.flatMap((value) => { const agent = projectHerdrAgentInfo(value); return agent == null ? [] : [agent]; }) : [];
    },
    async agentGet(target) {
      return requireAgent(await runJson(runner, ["agent", "get", target]), "agent get");
    },
    async agentStart(args) {
      const command = ["agent", "start", args.name, "--kind", args.kind, "--pane", args.paneId, ...(args.timeoutMs == null ? [] : ["--timeout", String(args.timeoutMs)])];
      if (args.agentArgs.length > 0) command.push("--", ...args.agentArgs);
      return requireAgent(await runJson(runner, command), "agent start");
    },
    async agentPrompt(args) {
      const command = ["agent", "prompt", args.target, args.text];
      if (args.wait) command.push("--wait");
      for (const status of args.until ?? []) command.push("--until", status);
      if (args.timeoutMs != null) command.push("--timeout", String(args.timeoutMs));
      const result = await runJson(runner, command);
      return projectHerdrAgentInfo(result.agent);
    },
    async agentRename(target, name) {
      await runJson(runner, name == null ? ["agent", "rename", target, "--clear"] : ["agent", "rename", target, name]);
    },
    async agentFocus(target) {
      await runJson(runner, ["agent", "focus", target]);
    },
    async agentRead(target, lines) {
      const { stdout, stderr, code } = await runner(["agent", "read", target, "--source", "visible", "--lines", String(lines)]);
      if (code !== 0) throw errorFromStderr(stderr, "agent read failed");
      return stdout;
    },
    async workspaceList() {
      const result = await runJson(runner, ["workspace", "list"]);
      return Array.isArray(result.workspaces)
        ? result.workspaces.flatMap((value) => (isRecord(value) && typeof value.workspace_id === "string" ? [{ workspace_id: value.workspace_id, label: typeof value.label === "string" ? value.label : "" }] : []))
        : [];
    },
    async workspaceCreate(args) {
      const result = await runJson(runner, ["workspace", "create", "--cwd", args.cwd, "--label", args.label, "--no-focus"]);
      const workspace = isRecord(result.workspace) ? result.workspace : {};
      const rootPane = isRecord(result.root_pane) ? result.root_pane : {};
      return { workspaceId: requireString(workspace.workspace_id, "workspace create: workspace_id"), rootPaneId: requireString(rootPane.pane_id, "workspace create: root_pane.pane_id") };
    },
    async tabCreate(args) {
      const result = await runJson(runner, ["tab", "create", "--workspace", args.workspaceId, "--cwd", args.cwd, "--label", args.label, "--no-focus"]);
      const tab = isRecord(result.tab) ? result.tab : {};
      const rootPane = isRecord(result.root_pane) ? result.root_pane : {};
      return { tabId: requireString(tab.tab_id, "tab create: tab_id"), rootPaneId: requireString(rootPane.pane_id, "tab create: root_pane.pane_id") };
    },
    async paneClose(paneId) {
      await runJson(runner, ["pane", "close", paneId]);
    },
    async notify(title, body) {
      await runJson(runner, ["notification", "show", title, "--body", body]);
    },
  };
}

export function createHerdrCli(binPath: string, env: NodeJS.ProcessEnv = process.env): HerdrCli {
  return createHerdrCliFromRunner(createExecFileRunner(binPath, env));
}
```

- [ ] **Step 5: 통과 확인**

```bash
node --test core/test/herdr-cli.test.ts && npm run typecheck
```
Expected: `# pass 5`. (`agent prompt` 테스트에서 가짜가 control 소켓에 연결을 시도하지 않는지 확인: `onPrompt.reviewer`에 `say`가 없으므로 시도하지 않는다.)

- [ ] **Step 6: 커밋**

```bash
git add core/src/herdr/cli.ts core/test/helpers/fake-herdr.mjs core/test/helpers/fake-herdr-state.ts core/test/herdr-cli.test.ts
git commit -m "feat(core): add herdr CLI adapter with a scriptable fake herdr for tests"
```

---

### Task 9: herdr 소켓 구독 + 상태 미러(StatusMirror)

**Files:**
- Create: `core/src/herdr/socket.ts`, `core/src/herdr/status-mirror.ts`
- Create: `core/test/helpers/fake-herdr-socket.ts`
- Test: `core/test/herdr-socket.test.ts`, `core/test/status-mirror.test.ts`

**Interfaces:**
- Consumes: `HerdrCli`(Task 8), `BotRuntime`, `OFFLINE_RUNTIME`, `runtimeFromAgentInfo`(Task 5)
- Produces:
  - `socket.ts`: `interface HerdrEvent { event: string; data: Record<string, unknown> }`, `subscribeHerdrEvents(socketPath, subscriptions: readonly Record<string, unknown>[], handlers: { onEvent; onReady?; onClose(error: Error|null) }): { close(): void }`
  - `status-mirror.ts`: `class StatusMirror { constructor(deps: { cli; socketPath: string|null; botIds: () => readonly string[]; onChange: (botId, runtime, previous) => void; pollIntervalMs?; debounceMs? }); start(); stop(); refresh(): Promise<void>; get(botId): BotRuntime; snapshot(): ReadonlyMap<string, BotRuntime>; resubscribe(): void }`
- 규칙: **`herdr agent list`가 진실**, 소켓 이벤트는 새로고침 트리거. 전역 구독(`pane.updated`, `pane.closed`, `pane.agent_detected`) + 봇 pane마다 `pane.agent_status_changed`. 이벤트가 오면 `debounceMs`(기본 150) 후 `refresh()`. 소켓이 없거나 끊기면 `pollIntervalMs`(기본 5000) 폴링만으로 동작하고, 30초마다 재구독을 시도한다.

- [ ] **Step 1: 가짜 herdr 소켓 헬퍼**

`core/test/helpers/fake-herdr-socket.ts`:
```ts
import { createServer, type Server, type Socket } from "node:net";
import { unlinkSync } from "node:fs";

export interface FakeHerdrSocket {
  readonly path: string;
  readonly subscriptions: Record<string, unknown>[][];
  push(event: string, data: Record<string, unknown>): void;
  close(): Promise<void>;
}

export function startFakeHerdrSocket(path: string): Promise<FakeHerdrSocket> {
  const subscriptions: Record<string, unknown>[][] = [];
  const clients = new Set<Socket>();
  const server: Server = createServer((socket) => {
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const request = JSON.parse(line) as { id: string; method: string; params: { subscriptions: Record<string, unknown>[] } };
        if (request.method === "events.subscribe") {
          subscriptions.push(request.params.subscriptions);
          clients.add(socket);
          socket.write(`${JSON.stringify({ id: request.id, result: { type: "subscription_started" } })}\n`);
        } else {
          socket.write(`${JSON.stringify({ id: request.id, error: { code: "unknown_method", message: request.method } })}\n`);
        }
        newline = buffer.indexOf("\n");
      }
    });
    socket.on("close", () => clients.delete(socket));
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(path, () => resolve({
      path,
      subscriptions,
      push: (event, data) => { for (const client of clients) client.write(`${JSON.stringify({ event, data })}\n`); },
      close: () => new Promise((done) => { for (const client of clients) client.destroy(); server.close(() => { try { unlinkSync(path); } catch { /* gone */ } done(); }); }),
    }));
  });
}
```

- [ ] **Step 2: 실패하는 테스트**

`core/test/herdr-socket.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { subscribeHerdrEvents, type HerdrEvent } from "../src/herdr/socket.ts";
import { startFakeHerdrSocket } from "./helpers/fake-herdr-socket.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("subscribe acks then streams pushed events until closed", async () => {
  const temp = makeTempHome();
  const fake = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    const events: HerdrEvent[] = [];
    let closed = false;
    const ready = new Promise<void>((resolve) => {
      subscribeHerdrEvents(fake.path, [{ type: "pane.updated" }], {
        onEvent: (event) => events.push(event),
        onReady: resolve,
        onClose: () => { closed = true; },
      });
    });
    await ready;
    assert.deepEqual(fake.subscriptions[0], [{ type: "pane.updated" }]);
    fake.push("pane.updated", { pane_id: "w1:p1" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(events, [{ event: "pane.updated", data: { pane_id: "w1:p1" } }]);
    await fake.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(closed, true);
  } finally {
    await fake.close().catch(() => undefined);
    temp.cleanup();
  }
});

test("a missing socket reports onClose with an error and never onReady", async () => {
  const temp = makeTempHome();
  try {
    const result = await new Promise<Error | null>((resolve) => {
      subscribeHerdrEvents(join(temp.home, "missing.sock"), [], { onEvent: () => undefined, onReady: () => resolve(new Error("unexpected ready")), onClose: resolve });
    });
    assert.ok(result instanceof Error);
  } finally {
    temp.cleanup();
  }
});
```

`core/test/status-mirror.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import type { BotRuntime } from "../src/herdr/types.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { startFakeHerdrSocket } from "./helpers/fake-herdr-socket.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

const agent = (name: string, status: "idle" | "working" | "blocked", pane: string) => ({ name, agent: "claude", agent_status: status, pane_id: pane, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function settle(ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("refresh mirrors named agents, marks unknown bots offline, and reports changes", async () => {
  const temp = makeTempHome();
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "idle", "w1:p2")], workspaces: [] });
    const changes: string[] = [];
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: null,
      botIds: () => ["reviewer", "ghost"],
      onChange: (botId, runtime: BotRuntime, previous) => changes.push(`${botId}:${previous.status}->${runtime.status}`),
    });
    await mirror.refresh();
    assert.equal(mirror.get("reviewer").status, "idle");
    assert.equal(mirror.get("reviewer").paneId, "w1:p2");
    assert.equal(mirror.get("ghost").status, "offline");
    assert.deepEqual(changes, ["reviewer:offline->idle"]);
    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "working", "w1:p2")] });
    await mirror.refresh();
    assert.deepEqual(changes, ["reviewer:offline->idle", "reviewer:idle->working"]);
    await mirror.refresh();
    assert.equal(changes.length, 2);
  } finally {
    temp.cleanup();
  }
});

test("socket events trigger a debounced refresh and per-pane subscriptions follow bot panes", async () => {
  const temp = makeTempHome();
  const socket = await startFakeHerdrSocket(join(temp.home, "h.sock"));
  try {
    const fake = installFakeHerdr(temp.home, { agents: [agent("reviewer", "idle", "w1:p2")], workspaces: [] });
    const changes: string[] = [];
    const mirror = new StatusMirror({
      cli: createHerdrCli(fake.binPath, fake.env),
      socketPath: socket.path,
      botIds: () => ["reviewer"],
      onChange: (botId, runtime) => changes.push(`${botId}:${runtime.status}`),
      pollIntervalMs: 60_000,
      debounceMs: 20,
    });
    mirror.start();
    await settle();
    assert.deepEqual(changes, ["reviewer:idle"]);
    const subscription = socket.subscriptions.at(-1)!;
    assert.ok(subscription.some((s) => s.type === "pane.updated"));
    assert.ok(subscription.some((s) => s.type === "pane.agent_status_changed" && s.pane_id === "w1:p2"), JSON.stringify(subscription));
    fake.writeState({ ...fake.readState(), agents: [agent("reviewer", "blocked", "w1:p2")] });
    socket.push("pane.agent_status_changed", { pane_id: "w1:p2", agent_status: "blocked" });
    await settle();
    assert.deepEqual(changes, ["reviewer:idle", "reviewer:blocked"]);
    mirror.stop();
  } finally {
    await socket.close().catch(() => undefined);
    temp.cleanup();
  }
});
```

- [ ] **Step 3: 실패 확인**

```bash
node --test core/test/herdr-socket.test.ts core/test/status-mirror.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: 구현**

`core/src/herdr/socket.ts`:
```ts
import { connect } from "node:net";

export interface HerdrEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

export interface HerdrSubscriptionHandlers {
  readonly onEvent: (event: HerdrEvent) => void;
  readonly onReady?: () => void;
  readonly onClose: (error: Error | null) => void;
}

export interface HerdrSubscription {
  close(): void;
}

export function ndjsonSplitter(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString();
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) onLine(line);
      newline = buffer.indexOf("\n");
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One connection = one events.subscribe; nothing else is ever written on it. */
export function subscribeHerdrEvents(socketPath: string, subscriptions: readonly Record<string, unknown>[], handlers: HerdrSubscriptionHandlers): HerdrSubscription {
  const socket = connect(socketPath);
  let ready = false;
  let closedByUs = false;
  let lastError: Error | null = null;

  socket.on("connect", () => {
    socket.write(`${JSON.stringify({ id: "hb-sub", method: "events.subscribe", params: { subscriptions } })}\n`);
  });
  socket.on("data", ndjsonSplitter((line) => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message)) return;
    if (!ready) {
      const result = isRecord(message.result) ? message.result : null;
      if (result?.type === "subscription_started") {
        ready = true;
        handlers.onReady?.();
      } else {
        closedByUs = true;
        socket.destroy();
        const error = isRecord(message.error) ? message.error : {};
        handlers.onClose(new Error(typeof error.message === "string" ? error.message : "subscription refused"));
      }
      return;
    }
    if (typeof message.event === "string") handlers.onEvent({ event: message.event, data: isRecord(message.data) ? message.data : {} });
  }));
  socket.on("error", (error) => {
    lastError = error;
  });
  socket.on("close", () => {
    if (!closedByUs) handlers.onClose(lastError);
  });

  return {
    close() {
      closedByUs = true;
      socket.destroy();
    },
  };
}
```

`core/src/herdr/status-mirror.ts`:
```ts
import { log } from "../log.ts";
import type { HerdrCli } from "./cli.ts";
import { subscribeHerdrEvents, type HerdrSubscription } from "./socket.ts";
import { OFFLINE_RUNTIME, runtimeFromAgentInfo, type BotRuntime } from "./types.ts";

export interface StatusMirrorDeps {
  readonly cli: HerdrCli;
  readonly socketPath: string | null;
  readonly botIds: () => readonly string[];
  readonly onChange: (botId: string, runtime: BotRuntime, previous: BotRuntime) => void;
  readonly pollIntervalMs?: number;
  readonly debounceMs?: number;
  readonly resubscribeMs?: number;
}

const GLOBAL_SUBSCRIPTIONS: readonly Record<string, unknown>[] = [{ type: "pane.updated" }, { type: "pane.closed" }, { type: "pane.agent_detected" }];

function sameRuntime(a: BotRuntime, b: BotRuntime): boolean {
  return a.status === b.status && a.paneId === b.paneId && a.workspaceId === b.workspaceId && a.sessionId === b.sessionId && a.kind === b.kind;
}

export class StatusMirror {
  readonly #deps: StatusMirrorDeps;
  #runtimes: ReadonlyMap<string, BotRuntime> = new Map();
  #subscription: HerdrSubscription | null = null;
  #subscribedPanes = "";
  #pollTimer: NodeJS.Timeout | null = null;
  #debounceTimer: NodeJS.Timeout | null = null;
  #resubscribeTimer: NodeJS.Timeout | null = null;
  #refreshing: Promise<void> | null = null;
  #stopped = true;

  constructor(deps: StatusMirrorDeps) {
    this.#deps = deps;
  }

  start(): void {
    this.#stopped = false;
    void this.refresh();
    const interval = this.#deps.pollIntervalMs ?? 5_000;
    this.#pollTimer = setInterval(() => void this.refresh(), interval);
    this.#pollTimer.unref();
    this.resubscribe();
  }

  stop(): void {
    this.#stopped = true;
    if (this.#pollTimer != null) clearInterval(this.#pollTimer);
    if (this.#debounceTimer != null) clearTimeout(this.#debounceTimer);
    if (this.#resubscribeTimer != null) clearTimeout(this.#resubscribeTimer);
    this.#subscription?.close();
    this.#subscription = null;
    this.#subscribedPanes = "";
  }

  get(botId: string): BotRuntime {
    return this.#runtimes.get(botId) ?? OFFLINE_RUNTIME;
  }

  snapshot(): ReadonlyMap<string, BotRuntime> {
    return this.#runtimes;
  }

  refresh(): Promise<void> {
    if (this.#refreshing != null) return this.#refreshing;
    this.#refreshing = this.#refreshOnce().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  resubscribe(): void {
    if (this.#stopped || this.#deps.socketPath == null) return;
    const panes = [...this.#runtimes.values()].map((runtime) => runtime.paneId).filter((paneId): paneId is string => paneId != null).sort();
    const key = panes.join(",");
    if (this.#subscription != null && key === this.#subscribedPanes) return;
    this.#subscription?.close();
    this.#subscribedPanes = key;
    const subscriptions = [...GLOBAL_SUBSCRIPTIONS, ...panes.map((paneId) => ({ type: "pane.agent_status_changed", pane_id: paneId }))];
    this.#subscription = subscribeHerdrEvents(this.#deps.socketPath, subscriptions, {
      onEvent: () => this.#scheduleRefresh(),
      onClose: (error) => {
        this.#subscription = null;
        this.#subscribedPanes = "";
        if (this.#stopped) return;
        log("status-mirror", "herdr event subscription closed; polling until it comes back", error?.message);
        this.#resubscribeTimer = setTimeout(() => this.resubscribe(), this.#deps.resubscribeMs ?? 30_000);
        this.#resubscribeTimer.unref();
      },
    });
  }

  #scheduleRefresh(): void {
    if (this.#debounceTimer != null) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => void this.refresh(), this.#deps.debounceMs ?? 150);
    this.#debounceTimer.unref();
  }

  async #refreshOnce(): Promise<void> {
    let agents;
    try {
      agents = await this.#deps.cli.agentList();
    } catch (error) {
      log("status-mirror", "agent list failed", error instanceof Error ? error.message : String(error));
      return;
    }
    const byName = new Map(agents.filter((agent) => agent.name != null).map((agent) => [agent.name as string, agent]));
    const next = new Map<string, BotRuntime>();
    for (const botId of this.#deps.botIds()) {
      const info = byName.get(botId);
      next.set(botId, info == null ? OFFLINE_RUNTIME : runtimeFromAgentInfo(info));
    }
    const previous = this.#runtimes;
    this.#runtimes = next;
    for (const [botId, runtime] of next) {
      const before = previous.get(botId) ?? OFFLINE_RUNTIME;
      if (!sameRuntime(before, runtime)) this.#deps.onChange(botId, runtime, before);
    }
    this.resubscribe();
  }
}
```

- [ ] **Step 5: 통과 확인**

```bash
node --test core/test/herdr-socket.test.ts core/test/status-mirror.test.ts && npm run typecheck
```
Expected: `# pass 4`. 두 번째 미러 테스트에서 `changes`가 `["reviewer:idle","reviewer:blocked"]`인지 확인(이벤트 → 디바운스 → refresh 경로).

- [ ] **Step 6: 커밋**

```bash
git add core/src/herdr/socket.ts core/src/herdr/status-mirror.ts core/test/helpers/fake-herdr-socket.ts core/test/herdr-socket.test.ts core/test/status-mirror.test.ts
git commit -m "feat(core): mirror bot runtime status from herdr agent list and socket events"
```

---

### Task 10: 실행 플래그 테이블 + 프롬프트 빌더

**Files:**
- Create: `core/src/bots/launch-args.ts`, `core/src/bots/prompts.ts`
- Test: `core/test/launch-args.test.ts`, `core/test/prompts.test.ts`

**Interfaces:**
- Consumes: `PermissionMode`(Task 4), `GroupMember`, `GroupMessage`, `formatGroupHistory`(Task 6)
- Produces:
  - `launchArgsFor(kind: string, permissionMode: PermissionMode, cliPath: string): string[]`
  - `SUPPORTED_KINDS: readonly string[]` (herdr 0.9.0 `agent start --kind` 목록)
  - `buildIdentityBrief(args: { bot: { id; name; description }; userName; cliPath }): string`
  - `buildRoomTurnPrompt(args: { room: { id; name; description }; member: GroupMember; peers: readonly GroupMember[]; newMessages: readonly GroupMessage[]; cliPath }): string`
  - `buildDmTurnPrompt(args: { bot: GroupMember; newMessages; cliPath; userName; chatId }): string`
  - `ROOM_TAG_PREFIX = "[herdr-bot room "`, `DM_TAG = "[herdr-bot DM]"`
- 프롬프트는 영어(프로토콜 지시), "방에서 쓰는 언어로 답하라"고 명시. `say` 명령 예시는 반드시 `<cliPath> say <chatId> "..."` 형태 — 가짜 herdr가 이 패턴(`\bsay (\S+) `)으로 방 id를 뽑는다.

- [ ] **Step 1: 실패하는 테스트**

`core/test/launch-args.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SUPPORTED_KINDS, launchArgsFor } from "../src/bots/launch-args.ts";

const cli = "/Users/ray/.herdr-bot/bin/herdr-bot";

test("claude: ask mode only pre-approves the herdr-bot CLI, auto bypasses permissions", () => {
  assert.deepEqual(launchArgsFor("claude", "ask", cli), ["--allowedTools", `Bash(${cli} *)`]);
  assert.deepEqual(launchArgsFor("claude", "auto", cli), ["--permission-mode", "bypassPermissions"]);
});

test("codex: ask uses defaults, auto follows the to-agents convention", () => {
  assert.deepEqual(launchArgsFor("codex", "ask", cli), []);
  assert.deepEqual(launchArgsFor("codex", "auto", cli), ["-s", "workspace-write", "-a", "on-request"]);
});

test("other kinds start bare", () => {
  assert.deepEqual(launchArgsFor("grok", "auto", cli), []);
  assert.ok(SUPPORTED_KINDS.includes("grok"));
  assert.ok(SUPPORTED_KINDS.includes("claude"));
});
```

`core/test/prompts.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DM_TAG, ROOM_TAG_PREFIX, buildDmTurnPrompt, buildIdentityBrief, buildRoomTurnPrompt } from "../src/bots/prompts.ts";

const cli = "/h/bin/herdr-bot";
const reviewer = { id: "reviewer", name: "Code Reviewer", description: "reviews diffs" };
const fixer = { id: "fixer", name: "Fixer", description: "" };

test("identity brief names the bot, the CLI path, and the say/pass protocol", () => {
  const brief = buildIdentityBrief({ bot: reviewer, userName: "ray", cliPath: cli });
  assert.match(brief, /You are "Code Reviewer" \(id: reviewer\)/);
  assert.match(brief, /reviews diffs/);
  assert.match(brief, new RegExp(`${cli} say <room-id> "<your message>"`));
  assert.match(brief, new RegExp(`${cli} pass <room-id>`));
  assert.match(brief, /ray/);
  assert.match(brief, /NOT visible/);
});

test("room turn prompt carries the tag, peers, new messages, and exact say command", () => {
  const prompt = buildRoomTurnPrompt({
    room: { id: "room-auth-1a2b", name: "auth", description: "fix login" },
    member: reviewer,
    peers: [fixer],
    newMessages: [{ speaker: { kind: "user", name: "ray" }, content: "please review" }, { speaker: { kind: "member", id: "fixer", name: "Fixer" }, content: "on it" }],
    cliPath: cli,
  });
  assert.ok(prompt.startsWith(`${ROOM_TAG_PREFIX}"auth" - with Fixer]`));
  assert.match(prompt, /fix login/);
  assert.match(prompt, /ray \(user\): please review\nFixer: on it/);
  assert.match(prompt, new RegExp(`${cli} say room-auth-1a2b "`));
  assert.match(prompt, new RegExp(`${cli} pass room-auth-1a2b`));
  assert.match(prompt, /max 2 per turn/);
});

test("room turn prompt with no new messages says so", () => {
  const prompt = buildRoomTurnPrompt({ room: { id: "room-x-1", name: "x", description: "" }, member: reviewer, peers: [], newMessages: [], cliPath: cli });
  assert.match(prompt, /No new messages/);
  assert.ok(prompt.startsWith(`${ROOM_TAG_PREFIX}"x"]`));
});

test("DM turn prompt uses the DM tag and the bot chat id", () => {
  const prompt = buildDmTurnPrompt({ bot: reviewer, chatId: "reviewer", userName: "ray", cliPath: cli, newMessages: [{ speaker: { kind: "user", name: "ray" }, content: "hi" }] });
  assert.ok(prompt.startsWith(DM_TAG));
  assert.match(prompt, new RegExp(`${cli} say reviewer "`));
  assert.match(prompt, /ray \(user\): hi/);
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/launch-args.test.ts core/test/prompts.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/bots/launch-args.ts`:
```ts
import type { PermissionMode } from "../store/profile-store.ts";

/** `herdr agent start --kind` values accepted by herdr 0.9.0. */
export const SUPPORTED_KINDS: readonly string[] = [
  "pi", "claude", "codex", "gemini", "cursor", "devin", "agy", "cline", "omp", "mastracode", "opencode", "copilot",
  "kimi", "kiro", "droid", "amp", "grok", "hermes", "kilo", "qodercli", "qwen", "maki", "muse",
];

export function isSupportedKind(kind: string): boolean {
  return SUPPORTED_KINDS.includes(kind);
}

export function launchArgsFor(kind: string, permissionMode: PermissionMode, cliPath: string): string[] {
  if (kind === "claude") {
    return permissionMode === "auto" ? ["--permission-mode", "bypassPermissions"] : ["--allowedTools", `Bash(${cliPath} *)`];
  }
  if (kind === "codex") {
    return permissionMode === "auto" ? ["-s", "workspace-write", "-a", "on-request"] : [];
  }
  return [];
}
```

`core/src/bots/prompts.ts`:
```ts
import { GROUP_MAX_MESSAGES_PER_TURN, formatGroupHistory, type GroupMember, type GroupMessage } from "../group/group-chat.ts";

export const ROOM_TAG_PREFIX = "[herdr-bot room ";
export const DM_TAG = "[herdr-bot DM]";

export interface RoomIdentity {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export function buildIdentityBrief(args: { readonly bot: GroupMember; readonly userName: string; readonly cliPath: string }): string {
  const { bot, userName, cliPath } = args;
  return [
    `[herdr-bot] You are "${bot.name}" (id: ${bot.id}), a bot managed by herdr-bot — a chat app where ${userName} and several bots talk in rooms.`,
    ...(bot.description.trim().length > 0 ? [`Your persona: ${bot.description.trim()}`] : []),
    "",
    "How rooms work:",
    `- Messages for you arrive in this terminal as prompts tagged ${ROOM_TAG_PREFIX}"<room>" ...] or ${DM_TAG}.`,
    "- The ONLY way to say something people can see is this shell command (max 2 per turn):",
    `    ${cliPath} say <room-id> "<your message>"`,
    `- If you have nothing worth adding, run: ${cliPath} pass <room-id>`,
    "- Whatever you print in this terminal is NOT visible in the chat. Only `say` reaches the room.",
    `- Read recent room history any time: ${cliPath} read <room-id>`,
    "- You have your full tools here. Do real work when asked (edit files, run commands, research), then report the result with `say`.",
    "- Keep each message short and conversational; reply in the language the room is using.",
    "- \"@<id>\" in a message addresses that bot. Mention others with @<id> when you need them; do not ping-pong acknowledgements.",
    "",
    "Reply \"ok\" in this terminal now. There is nothing to say to a room yet.",
  ].join("\n");
}

function roomTag(room: RoomIdentity, peers: readonly GroupMember[]): string {
  const withPeers = peers.length > 0 ? ` - with ${peers.map((peer) => peer.name).join(", ")}` : "";
  return `${ROOM_TAG_PREFIX}"${room.name}"${withPeers}]`;
}

function turnInstructions(chatId: string, member: GroupMember, cliPath: string): string[] {
  return [
    "",
    `It's your turn, ${member.name}. Say something only if it adds value (max ${GROUP_MAX_MESSAGES_PER_TURN} per turn):`,
    `  ${cliPath} say ${chatId} "<message>"`,
    `Or pass: ${cliPath} pass ${chatId}`,
    "Do the work first if the request needs it, then say the result. Nothing printed here is visible to the room.",
  ];
}

export function buildRoomTurnPrompt(args: {
  readonly room: RoomIdentity;
  readonly member: GroupMember;
  readonly peers: readonly GroupMember[];
  readonly newMessages: readonly GroupMessage[];
  readonly cliPath: string;
}): string {
  const { room, member, peers, newMessages, cliPath } = args;
  return [
    roomTag(room, peers),
    ...(room.description.trim().length > 0 ? [`Room goal: ${room.description.trim()}`] : []),
    newMessages.length === 0 ? "No new messages in the room since your last turn." : `New messages in the room (oldest first):\n${formatGroupHistory(newMessages, member.id)}`,
    ...turnInstructions(room.id, member, cliPath),
  ].join("\n");
}

export function buildDmTurnPrompt(args: {
  readonly bot: GroupMember;
  readonly chatId: string;
  readonly userName: string;
  readonly newMessages: readonly GroupMessage[];
  readonly cliPath: string;
}): string {
  const { bot, chatId, userName, newMessages, cliPath } = args;
  return [
    `${DM_TAG} Direct chat between ${userName} and you (${bot.name}).`,
    newMessages.length === 0 ? "No new messages." : `New messages (oldest first):\n${formatGroupHistory(newMessages, bot.id)}`,
    ...turnInstructions(chatId, bot, cliPath),
  ].join("\n");
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/launch-args.test.ts core/test/prompts.test.ts && npm run typecheck
```
Expected: `# pass 7`.

- [ ] **Step 5: 커밋**

```bash
git add core/src/bots/launch-args.ts core/src/bots/prompts.ts core/test/launch-args.test.ts core/test/prompts.test.ts
git commit -m "feat(core): add per-kind launch args and room/DM prompt builders"
```

---

### Task 11: control 소켓 프로토콜 + 서버 + 클라이언트

**Files:**
- Create: `core/src/control/protocol.ts`, `core/src/control/server.ts`, `core/src/control/client.ts`
- Test: `core/test/control-socket.test.ts`

**Interfaces:**
- Produces:
  - `protocol.ts`: `interface ControlRequest { id: string; method: string; params: Record<string, unknown> }`, `type ControlResponse = { id; result: unknown } | { id; error: { code: string; message: string } }`, `class ControlError extends Error { code }`, `parseControlRequest(line: string): ControlRequest | null`, `CONTROL_ERROR_CODES` (`unknown_pane`, `unknown_chat`, `not_a_member`, `over_cap`, `invalid_params`, `unknown_method`, `herdr_error`, `internal`)
  - `server.ts`: `type ControlHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>`, `startControlServer(socketPath, handler): Promise<ControlServer>`, `interface ControlServer { close(): Promise<void> }`. 시작 시 소켓 파일이 있으면 **연결을 시도해 살아 있으면 `host_already_running` 에러**, 죽은 파일이면 unlink 후 listen.
  - `client.ts`: `controlRequest(socketPath, method, params, timeoutMs = 10_000): Promise<unknown>` — 실패는 `ControlError(code)`로(`connect_failed` 포함).

- [ ] **Step 1: 실패하는 테스트**

`core/test/control-socket.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ControlError, parseControlRequest } from "../src/control/protocol.ts";
import { startControlServer } from "../src/control/server.ts";
import { controlRequest } from "../src/control/client.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("parseControlRequest validates shape", () => {
  assert.deepEqual(parseControlRequest('{"id":"1","method":"say","params":{"a":1}}'), { id: "1", method: "say", params: { a: 1 } });
  assert.deepEqual(parseControlRequest('{"id":"1","method":"rooms"}'), { id: "1", method: "rooms", params: {} });
  assert.equal(parseControlRequest("nope"), null);
  assert.equal(parseControlRequest('{"method":"say"}'), null);
});

test("server dispatches requests, maps ControlError codes, and serves many requests per connection", async () => {
  const temp = makeTempHome();
  const socketPath = join(temp.home, "host.sock");
  const server = await startControlServer(socketPath, async (method, params) => {
    if (method === "echo") return { got: params };
    if (method === "boom") throw new ControlError("unknown_chat", "no such chat");
    if (method === "crash") throw new Error("unexpected");
    throw new ControlError("unknown_method", method);
  });
  try {
    assert.deepEqual(await controlRequest(socketPath, "echo", { x: 1 }), { got: { x: 1 } });
    await assert.rejects(controlRequest(socketPath, "boom", {}), (error: unknown) => error instanceof ControlError && error.code === "unknown_chat");
    await assert.rejects(controlRequest(socketPath, "crash", {}), (error: unknown) => error instanceof ControlError && error.code === "internal");
    await assert.rejects(controlRequest(socketPath, "nope", {}), (error: unknown) => error instanceof ControlError && error.code === "unknown_method");
  } finally {
    await server.close();
    temp.cleanup();
  }
});

test("a stale socket file is replaced; a live one refuses to start twice", async () => {
  const temp = makeTempHome();
  const socketPath = join(temp.home, "host.sock");
  writeFileSync(socketPath, "");
  const server = await startControlServer(socketPath, async () => null);
  try {
    await assert.rejects(startControlServer(socketPath, async () => null), (error: unknown) => error instanceof ControlError && error.code === "host_already_running");
  } finally {
    await server.close();
    temp.cleanup();
  }
});

test("client reports connect_failed when no host is listening", async () => {
  const temp = makeTempHome();
  try {
    await assert.rejects(controlRequest(join(temp.home, "none.sock"), "rooms", {}, 500), (error: unknown) => error instanceof ControlError && error.code === "connect_failed");
  } finally {
    temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/control-socket.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/control/protocol.ts`:
```ts
export interface ControlRequest {
  readonly id: string;
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export type ControlResponse =
  | { readonly id: string; readonly result: unknown }
  | { readonly id: string; readonly error: { readonly code: string; readonly message: string } };

export const CONTROL_ERROR_CODES = [
  "unknown_pane", "unknown_chat", "unknown_bot", "not_a_member", "over_cap", "invalid_params", "unknown_method",
  "herdr_error", "internal", "connect_failed", "timeout", "host_already_running", "bad_response",
] as const;

export type ControlErrorCode = (typeof CONTROL_ERROR_CODES)[number];

export class ControlError extends Error {
  readonly code: ControlErrorCode;

  constructor(code: ControlErrorCode, message: string) {
    super(message);
    this.name = "ControlError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseControlRequest(line: string): ControlRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.id !== "string" || typeof parsed.method !== "string" || parsed.method.length === 0) return null;
  return { id: parsed.id, method: parsed.method, params: isRecord(parsed.params) ? parsed.params : {} };
}

export function parseControlResponse(line: string): ControlResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.id !== "string") return null;
  if (isRecord(parsed.error) && typeof parsed.error.code === "string") {
    return { id: parsed.id, error: { code: parsed.error.code, message: typeof parsed.error.message === "string" ? parsed.error.message : "" } };
  }
  return "result" in parsed ? { id: parsed.id, result: parsed.result } : null;
}

export function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) throw new ControlError("invalid_params", `${key} must be a non-empty string`);
  return value;
}

export function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function optionalStringArray(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new ControlError("invalid_params", `${key} must be an array of strings`);
  return value as string[];
}
```

`core/src/control/server.ts`:
```ts
import { connect, createServer, type Server, type Socket } from "node:net";
import { mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { log } from "../log.ts";
import { ndjsonSplitter } from "../herdr/socket.ts";
import { ControlError, parseControlRequest, type ControlResponse } from "./protocol.ts";

export type ControlHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export interface ControlServer {
  readonly socketPath: string;
  close(): Promise<void>;
}

function probeLiveSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function toResponse(id: string, error: unknown): ControlResponse {
  if (error instanceof ControlError) return { id, error: { code: error.code, message: error.message } };
  const message = error instanceof Error ? error.message : String(error);
  log("control", "handler crashed", message);
  return { id, error: { code: "internal", message } };
}

function serveConnection(socket: Socket, handler: ControlHandler): void {
  const write = (response: ControlResponse): void => {
    if (!socket.destroyed) socket.write(`${JSON.stringify(response)}\n`);
  };
  socket.on("data", ndjsonSplitter((line) => {
    const request = parseControlRequest(line);
    if (request == null) {
      write({ id: "?", error: { code: "invalid_params", message: "malformed request line" } });
      return;
    }
    handler(request.method, request.params).then(
      (result) => write({ id: request.id, result: result ?? null }),
      (error: unknown) => write(toResponse(request.id, error)),
    );
  }));
  socket.on("error", () => undefined);
}

export async function startControlServer(socketPath: string, handler: ControlHandler): Promise<ControlServer> {
  if (await probeLiveSocket(socketPath)) throw new ControlError("host_already_running", `another herdr-bot host owns ${socketPath}`);
  try {
    unlinkSync(socketPath);
  } catch {
    // no stale socket file
  }
  mkdirSync(dirname(socketPath), { recursive: true });
  const server: Server = createServer((socket) => serveConnection(socket, handler));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });
  return {
    socketPath,
    close: () => new Promise((resolve) => {
      server.close(() => {
        try {
          unlinkSync(socketPath);
        } catch {
          // already removed
        }
        resolve();
      });
    }),
  };
}
```

`core/src/control/client.ts`:
```ts
import { connect } from "node:net";
import { ndjsonSplitter } from "../herdr/socket.ts";
import { ControlError, parseControlResponse } from "./protocol.ts";

let requestCounter = 0;

/** One-shot request over the host control socket: connect → request → reply → close. */
export function controlRequest(socketPath: string, method: string, params: Record<string, unknown>, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = `c${++requestCounter}`;
    const socket = connect(socketPath);
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new ControlError("timeout", `${method}: no reply within ${timeoutMs}ms`))), timeoutMs);
    socket.on("connect", () => socket.write(`${JSON.stringify({ id, method, params })}\n`));
    socket.on("data", ndjsonSplitter((line) => {
      const response = parseControlResponse(line);
      if (response == null || response.id !== id) return;
      if ("error" in response) {
        const code = response.error.code;
        finish(() => reject(new ControlError(isKnownCode(code) ? code : "internal", response.error.message)));
      } else {
        finish(() => resolve(response.result));
      }
    }));
    socket.on("error", (error) => finish(() => reject(new ControlError("connect_failed", `${method}: ${error.message}`))));
    socket.on("close", () => finish(() => reject(new ControlError("bad_response", `${method}: connection closed before a reply`))));
  });
}

function isKnownCode(code: string): code is ControlError["code"] {
  return ["unknown_pane", "unknown_chat", "unknown_bot", "not_a_member", "over_cap", "invalid_params", "unknown_method", "herdr_error", "internal", "connect_failed", "timeout", "host_already_running", "bad_response"].includes(code);
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/control-socket.test.ts && npm run typecheck
```
Expected: `# pass 4`.

- [ ] **Step 5: 커밋**

```bash
git add core/src/control core/test/control-socket.test.ts
git commit -m "feat(core): add NDJSON control socket protocol, server, and client"
```

---

### Task 12: say 인박스 + 턴 러너(runBotTurn)

**Files:**
- Create: `core/src/bots/say-inbox.ts`, `core/src/bots/turn-runner.ts`
- Test: `core/test/say-inbox.test.ts`, `core/test/turn-runner.test.ts`

**Interfaces:**
- Consumes: `HerdrCli`(Task 8), `StatusMirror`(Task 9), `HerdrError`, `MemberTurnResult`(Task 7), `GROUP_MAX_MESSAGES_PER_TURN`
- Produces:
  - `say-inbox.ts`: `class SayInbox { open(chatId, botId): OpenTurn; accept(chatId, botId, text): "in-turn" | "late" | "over-cap"; isOpen(chatId, botId): boolean }`, `interface OpenTurn { readonly spoken: readonly string[]; close(): readonly string[] }`
  - `turn-runner.ts`: `interface TurnRunnerDeps { cli: HerdrCli; mirror: StatusMirror; inbox: SayInbox; turnTimeoutMs: number }`, `runBotTurn(deps, args: { chatId; botId; prompt }): Promise<MemberTurnResult>`
- 알고리즘:
  1. `mirror.get(botId)`가 `offline` → `{outcome:"offline"}`. `working` → `busy`. `blocked` → `blocked`. (미러가 낡았을 수 있으니 offline이면 한 번 `mirror.refresh()` 후 재확인.)
  2. `inbox.open(chatId, botId)` → `cli.agentPrompt({target: botId, text: prompt, wait: true, timeoutMs})`.
  3. 결과 상태 `blocked` → `blocked`; 그 외 → `settled`. 에러 코드 `agent_blocked`→`blocked`, `agent_prompt_stalled`→`stalled`, `timeout`→`timeout`, `agent_not_running`→`offline`, 나머지 → `error`.
  4. `spoken = turn.close()`를 항상 결과에 넣는다(에러여도 이미 말한 건 유효).

- [ ] **Step 1: 실패하는 테스트**

`core/test/say-inbox.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SayInbox } from "../src/bots/say-inbox.ts";

test("says during an open turn are collected up to the per-turn cap; others are late", () => {
  const inbox = new SayInbox();
  assert.equal(inbox.accept("room-1", "a", "early"), "late");
  const turn = inbox.open("room-1", "a");
  assert.equal(inbox.accept("room-1", "a", "one"), "in-turn");
  assert.equal(inbox.accept("room-1", "a", "two"), "in-turn");
  assert.equal(inbox.accept("room-1", "a", "three"), "over-cap");
  assert.equal(inbox.accept("room-1", "b", "other bot"), "late");
  assert.equal(inbox.accept("room-2", "a", "other room"), "late");
  assert.deepEqual(turn.close(), ["one", "two"]);
  assert.equal(inbox.isOpen("room-1", "a"), false);
  assert.equal(inbox.accept("room-1", "a", "after"), "late");
});

test("reopening replaces the previous turn for the same bot", () => {
  const inbox = new SayInbox();
  const first = inbox.open("room-1", "a");
  const second = inbox.open("room-1", "a");
  inbox.accept("room-1", "a", "x");
  assert.deepEqual(first.close(), []);
  assert.deepEqual(second.close(), ["x"]);
});
```

`core/test/turn-runner.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SayInbox } from "../src/bots/say-inbox.ts";
import { runBotTurn } from "../src/bots/turn-runner.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { startControlServer } from "../src/control/server.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

const agent = (name: string, status: "idle" | "working" | "blocked") => ({ name, agent: "claude", agent_status: status, pane_id: `w1:p-${name}`, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function harness(state: FakeHerdrState) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const cli = createHerdrCli(fake.binPath, fake.env);
  const inbox = new SayInbox();
  const said: string[] = [];
  const server = await startControlServer(join(temp.home, "host.sock"), async (method, params) => {
    if (method !== "say") throw new Error(method);
    const botId = state.agents.find((a) => a.pane_id === params.paneId)?.name ?? "?";
    const mode = inbox.accept(String(params.chatId), botId, String(params.text));
    said.push(`${botId}:${mode}:${String(params.text)}`);
    return { mode };
  });
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => state.agents.map((a) => a.name ?? ""), onChange: () => undefined });
  await mirror.refresh();
  return { deps: { cli, mirror, inbox, turnTimeoutMs: 5_000 }, fake, said, cleanup: async () => { await server.close(); temp.cleanup(); } };
}

test("a settled turn returns what the bot said through the control socket", async () => {
  const h = await harness({ agents: [agent("reviewer", "idle")], workspaces: [], onPrompt: { reviewer: { say: ["looks good", "one nit"], finalStatus: "idle" } } });
  try {
    const result = await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: `[herdr-bot room "r"] turn: /h/bin/herdr-bot say room-1 "<message>"` });
    assert.equal(result.outcome, "settled");
    assert.deepEqual(result.spoken, ["looks good", "one nit"]);
    assert.deepEqual(h.said, ["reviewer:in-turn:looks good", "reviewer:in-turn:one nit"]);
    assert.equal(h.fake.readState().prompts?.[0]?.target, "reviewer");
  } finally {
    await h.cleanup();
  }
});

test("busy, blocked, and offline bots are skipped without prompting", async () => {
  const h = await harness({ agents: [agent("busy", "working"), agent("stuck", "blocked")], workspaces: [] });
  try {
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "busy", prompt: "x" })).outcome, "busy");
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "stuck", prompt: "x" })).outcome, "blocked");
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "ghost", prompt: "x" })).outcome, "offline");
    assert.equal(h.fake.readState().prompts?.length ?? 0, 0);
  } finally {
    await h.cleanup();
  }
});

test("herdr error codes map to turn outcomes and keep anything already said", async () => {
  const h = await harness({ agents: [agent("reviewer", "idle")], workspaces: [], onPrompt: { reviewer: { say: ["partial"], finalStatus: "timeout" } } });
  try {
    const result = await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: `[herdr-bot room "r"] x say room-1 "m"` });
    assert.equal(result.outcome, "timeout");
    assert.deepEqual(result.spoken, ["partial"]);
    h.fake.writeState({ ...h.fake.readState(), onPrompt: { reviewer: { finalStatus: "stalled" } } });
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: "x" })).outcome, "stalled");
    h.fake.writeState({ ...h.fake.readState(), onPrompt: { reviewer: { finalStatus: "blocked" } } });
    assert.equal((await runBotTurn(h.deps, { chatId: "room-1", botId: "reviewer", prompt: "x" })).outcome, "blocked");
  } finally {
    await h.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/say-inbox.test.ts core/test/turn-runner.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/bots/say-inbox.ts`:
```ts
import { GROUP_MAX_MESSAGES_PER_TURN } from "../group/group-chat.ts";

export interface OpenTurn {
  readonly spoken: readonly string[];
  close(): readonly string[];
}

export type SayMode = "in-turn" | "late" | "over-cap";

interface TurnRecord {
  spoken: string[];
}

function key(chatId: string, botId: string): string {
  return `${chatId} ${botId}`;
}

/** Collects `say` calls that arrive while a bot's turn is open; everything else is a late message. */
export class SayInbox {
  readonly #turns = new Map<string, TurnRecord>();

  open(chatId: string, botId: string): OpenTurn {
    const record: TurnRecord = { spoken: [] };
    const turnKey = key(chatId, botId);
    this.#turns.set(turnKey, record);
    return {
      get spoken() {
        return [...record.spoken];
      },
      close: () => {
        if (this.#turns.get(turnKey) === record) this.#turns.delete(turnKey);
        return [...record.spoken];
      },
    };
  }

  isOpen(chatId: string, botId: string): boolean {
    return this.#turns.has(key(chatId, botId));
  }

  accept(chatId: string, botId: string, text: string): SayMode {
    const record = this.#turns.get(key(chatId, botId));
    if (record == null) return "late";
    if (record.spoken.length >= GROUP_MAX_MESSAGES_PER_TURN) return "over-cap";
    record.spoken = [...record.spoken, text];
    return "in-turn";
  }
}
```

`core/src/bots/turn-runner.ts`:
```ts
import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { HerdrError, type BotRuntimeStatus } from "../herdr/types.ts";
import type { MemberTurnResult, TurnOutcome } from "../group/orchestrator.ts";
import { log } from "../log.ts";
import type { SayInbox } from "./say-inbox.ts";

export interface TurnRunnerDeps {
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  readonly inbox: SayInbox;
  readonly turnTimeoutMs: number;
}

function preflightOutcome(status: BotRuntimeStatus): TurnOutcome | null {
  if (status === "offline") return "offline";
  if (status === "working") return "busy";
  if (status === "blocked") return "blocked";
  return null;
}

function outcomeFromError(error: unknown): TurnOutcome {
  if (!(error instanceof HerdrError)) return "error";
  switch (error.code) {
    case "agent_blocked": return "blocked";
    case "agent_prompt_stalled": return "stalled";
    case "timeout": return "timeout";
    case "agent_not_running": return "offline";
    default: return "error";
  }
}

export async function runBotTurn(deps: TurnRunnerDeps, args: { readonly chatId: string; readonly botId: string; readonly prompt: string }): Promise<MemberTurnResult> {
  let status = deps.mirror.get(args.botId).status;
  if (status === "offline") {
    await deps.mirror.refresh();
    status = deps.mirror.get(args.botId).status;
  }
  const skip = preflightOutcome(status);
  if (skip != null) return { outcome: skip, spoken: [] };

  const turn = deps.inbox.open(args.chatId, args.botId);
  try {
    const settled = await deps.cli.agentPrompt({ target: args.botId, text: args.prompt, wait: true, timeoutMs: deps.turnTimeoutMs });
    return { outcome: settled?.agent_status === "blocked" ? "blocked" : "settled", spoken: turn.close() };
  } catch (error) {
    const outcome = outcomeFromError(error);
    log("turn", `turn for ${args.botId} in ${args.chatId} ended with ${outcome}`, error instanceof Error ? error.message : String(error));
    return { outcome, spoken: turn.close() };
  } finally {
    void deps.mirror.refresh();
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/say-inbox.test.ts core/test/turn-runner.test.ts && npm run typecheck
```
Expected: `# pass 5`. 첫 테스트는 가짜 herdr → control 소켓 → inbox 경로가 실제로 동작하는지 검증한다(`said`에 `in-turn` 두 건).

- [ ] **Step 5: 커밋**

```bash
git add core/src/bots/say-inbox.ts core/src/bots/turn-runner.ts core/test/say-inbox.test.ts core/test/turn-runner.test.ts
git commit -m "feat(core): run a bot turn through herdr agent prompt and collect say calls"
```

---

### Task 13: RosterService — 봇 스폰/채택/삭제, 방 CRUD

**Files:**
- Create: `core/src/services/workspace-registry.ts`, `core/src/services/roster-service.ts`
- Test: `core/test/roster-service.test.ts`

**Interfaces:**
- Consumes: `HostConfig`, `ProfileStore`, `RoomStore`, `HerdrCli`, `StatusMirror`, `launchArgsFor`, `buildIdentityBrief`, `isValidBotId`, `makeRoomId`, `GROUP_MAX_MEMBERS`
- Produces:
  - `workspace-registry.ts`: `class WorkspaceRegistry { constructor(home); get(cwd): string|null; set(cwd, workspaceId): void }` (`state/workspaces.json`)
  - `roster-service.ts`:
    ```ts
    interface CreateBotArgs { id?: string; name: string; description?: string; kind?: string; cwd?: string; permissionMode?: PermissionMode; avatarShape?: string|null; avatarColor?: string|null; adoptPaneId?: string }
    interface RosterServiceDeps { config: HostConfig; profiles: ProfileStore; rooms: RoomStore; cli: HerdrCli; mirror: StatusMirror; now?: () => number; onNotice?: (chatId: string, text: string) => void }
    class RosterService {
      createBot(args: CreateBotArgs): Promise<BotProfile>           // spawn 또는 adopt
      deleteBot(id: string): Promise<void>                          // spawned → pane close; adopted → rename --clear
      updateProfile(id, patch: { name?; description?; notifyOnUpdatesEnabled?; isHiddenFromSidebar? }): BotProfile | null
      createRoom(args: { name; description?; memberIds: readonly string[] }): RoomConfig
      setRoomMembers(id, memberIds): RoomConfig | null
      updateRoom(id, patch: { name?; description?; isHiddenFromSidebar? }): RoomConfig | null
      deleteRoom(id): void
      listAdoptable(): Promise<HerdrAgentInfo[]>                    // agent list 중 프로필 없는 것
      resolveBotByPane(paneId): BotProfile | null                   // mirror 우선, 저장된 paneId 폴백
      memberIdFor(chatId): GroupMember | null
      focus(target): Promise<void>                                   // herdr agent focus (UI "Open in herdr")
    }
    class RosterError extends Error { code: "invalid_bot_id" | "bot_exists" | "unknown_bot" | "unknown_room" | "too_many_members" | "unsupported_kind" | "herdr_error" }
    ```
- 스폰 절차: (1) id 검증·중복 검사 (2) `WorkspaceRegistry.get(cwd)`가 있고 `workspaceList()`에 살아 있으면 `tabCreate`, 아니면 `workspaceCreate` 후 등록(첫 봇은 루트 pane 사용) (3) `agentStart(id, kind, pane, launchArgsFor(...))` (4) 프로필 저장(`herdr.paneId/workspaceId/sessionId`) (5) `mirror.refresh()` (6) identity brief를 `agentPrompt(wait, briefTimeoutMs)`로 전송 — 실패는 notice로만 남기고 봇 생성은 성공 처리.
- `agent_not_ready`(첫 실행 확인 화면)면 프로필은 저장하되 `onNotice(id, "…needs first-run setup in herdr")`를 남긴다. 사용자가 herdr에서 처리하면 미러가 idle을 잡는다.
- 채택 절차: `agentGet(paneId)` → 이미 이름이 있으면 그 이름을 id로 강제(`args.id`가 다르면 `rename`) → 없으면 `agentRename(paneId, id)` → 프로필(`adopted: true`, `kind = info.agent`, `cwd = info.cwd`) → brief 전송.

- [ ] **Step 1: 실패하는 테스트**

`core/test/roster-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { RosterError, RosterService } from "../src/services/roster-service.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

function harness(state: FakeHerdrState = { agents: [], workspaces: [] }) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const notices: string[] = [];
  const service = new RosterService({ config, profiles, rooms, cli, mirror, now: () => 1_000, onNotice: (chatId, text) => notices.push(`${chatId}: ${text}`) });
  return { temp, fake, config, profiles, rooms, mirror, service, notices };
}

test("createBot spawns into a new workspace for a new cwd, then a tab for the next bot", async () => {
  const h = harness();
  try {
    const first = await h.service.createBot({ name: "Code Reviewer", kind: "claude", permissionMode: "ask" });
    assert.equal(first.id, "code-reviewer");
    assert.equal(first.herdr.paneId, "w1:p1");
    assert.equal(first.herdr.workspaceId, "w1");
    assert.equal(first.cwd, "/tmp/repo");
    const second = await h.service.createBot({ id: "fixer", name: "Fixer", kind: "codex", permissionMode: "auto" });
    assert.equal(second.herdr.paneId, "w1:p100");
    const log = h.fake.readLog().map((argv) => argv.join(" "));
    assert.ok(log.some((line) => line.startsWith("workspace create --cwd /tmp/repo --label herdr-bot: repo")));
    assert.ok(log.some((line) => line.startsWith("tab create --workspace w1 --cwd /tmp/repo --label fixer")));
    assert.ok(log.some((line) => line === `agent start code-reviewer --kind claude --pane w1:p1 -- --allowedTools Bash(${h.config.cliPath} *)`));
    assert.ok(log.some((line) => line === "agent start fixer --kind codex --pane w1:p100 -- -s workspace-write -a on-request"));
    const brief = h.fake.readState().prompts?.find((p) => p.target === "code-reviewer");
    assert.match(brief?.text ?? "", /You are "Code Reviewer"/);
    assert.equal(h.mirror.get("fixer").status, "idle");
  } finally {
    h.temp.cleanup();
  }
});

test("createBot rejects bad ids, duplicates, unsupported kinds", async () => {
  const h = harness();
  try {
    await assert.rejects(h.service.createBot({ id: "Bad Id", name: "x" }), (e: unknown) => e instanceof RosterError && e.code === "invalid_bot_id");
    await assert.rejects(h.service.createBot({ id: "a", name: "x", kind: "notreal" }), (e: unknown) => e instanceof RosterError && e.code === "unsupported_kind");
    await h.service.createBot({ id: "a", name: "A" });
    await assert.rejects(h.service.createBot({ id: "a", name: "A again" }), (e: unknown) => e instanceof RosterError && e.code === "bot_exists");
  } finally {
    h.temp.cleanup();
  }
});

test("a bot blocked during startup is saved with a setup notice", async () => {
  const h = harness({ agents: [], workspaces: [], startBlocked: ["needy"] });
  try {
    const bot = await h.service.createBot({ id: "needy", name: "Needy" });
    assert.equal(bot.id, "needy");
    assert.ok(h.notices.some((n) => n.startsWith("needy: ") && /first-run/.test(n)), JSON.stringify(h.notices));
  } finally {
    h.temp.cleanup();
  }
});

test("adopting a running agent renames it and marks the profile adopted; delete only clears the name", async () => {
  const h = harness({ agents: [{ name: null, agent: "grok", agent_status: "idle", pane_id: "w7:p3", tab_id: "w7:t1", workspace_id: "w7", cwd: "/work/x" }], workspaces: [] });
  try {
    const adoptable = await h.service.listAdoptable();
    assert.equal(adoptable.length, 1);
    const bot = await h.service.createBot({ id: "scout", name: "Scout", adoptPaneId: "w7:p3" });
    assert.equal(bot.adopted, true);
    assert.equal(bot.kind, "grok");
    assert.equal(bot.cwd, "/work/x");
    assert.equal(h.fake.readState().agents[0]?.name, "scout");
    assert.equal((await h.service.listAdoptable()).length, 0);
    assert.equal(h.service.resolveBotByPane("w7:p3")?.id, "scout");
    await h.service.deleteBot("scout");
    assert.equal(h.fake.readState().agents[0]?.name, null);
    assert.equal(h.fake.readState().closedPanes, undefined);
    assert.equal(h.profiles.get("scout"), null);
  } finally {
    h.temp.cleanup();
  }
});

test("deleting a spawned bot closes its pane and removes it from rooms", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    await h.service.createBot({ id: "b", name: "B" });
    const room = h.service.createRoom({ name: "Auth", memberIds: ["a", "b"] });
    assert.ok(room.id.startsWith("room-auth-"));
    await h.service.deleteBot("a");
    assert.deepEqual(h.fake.readState().closedPanes, ["w1:p1"]);
    assert.deepEqual(h.rooms.get(room.id)?.memberIds, ["b"]);
    assert.throws(() => h.service.setRoomMembers(room.id, ["b", "ghost"]), (e: unknown) => e instanceof RosterError && e.code === "unknown_bot");
    assert.throws(() => h.service.createRoom({ name: "big", memberIds: ["b", "b1", "b2", "b3", "b4", "b5", "b6"] }), (e: unknown) => e instanceof RosterError && e.code === "too_many_members");
  } finally {
    h.temp.cleanup();
  }
});

test("updateProfile and rooms round-trip", async () => {
  const h = harness();
  try {
    await h.service.createBot({ id: "a", name: "A" });
    const updated = h.service.updateProfile("a", { name: "Ava", description: "helps", isHiddenFromSidebar: true });
    assert.equal(updated?.name, "Ava");
    assert.equal(updated?.isHiddenFromSidebar, true);
    const room = h.service.createRoom({ name: "r", memberIds: ["a"] });
    assert.equal(h.service.updateRoom(room.id, { name: "renamed" })?.name, "renamed");
    h.service.deleteRoom(room.id);
    assert.equal(existsSync(`${h.temp.home}/rooms/${room.id}`), false);
    assert.deepEqual(h.service.memberIdFor("a"), { id: "a", name: "Ava", description: "helps" });
  } finally {
    h.temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/roster-service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/services/workspace-registry.ts`:
```ts
import { hostPaths } from "../config.ts";
import { readJsonFile, writeJsonFileAtomic } from "../store/json-file.ts";

interface WorkspaceMap {
  readonly byCwd: Readonly<Record<string, string>>;
}

function projectMap(value: unknown): WorkspaceMap | null {
  if (typeof value !== "object" || value === null) return null;
  const byCwd = (value as { byCwd?: unknown }).byCwd;
  if (typeof byCwd !== "object" || byCwd === null) return { byCwd: {} };
  const result: Record<string, string> = {};
  for (const [cwd, id] of Object.entries(byCwd as Record<string, unknown>)) if (typeof id === "string") result[cwd] = id;
  return { byCwd: result };
}

export class WorkspaceRegistry {
  readonly path: string;

  constructor(home: string) {
    this.path = hostPaths.workspaces(home);
  }

  get(cwd: string): string | null {
    return (readJsonFile(this.path, projectMap) ?? { byCwd: {} }).byCwd[cwd] ?? null;
  }

  set(cwd: string, workspaceId: string): void {
    const current = readJsonFile(this.path, projectMap) ?? { byCwd: {} };
    writeJsonFileAtomic(this.path, { byCwd: { ...current.byCwd, [cwd]: workspaceId } });
  }
}
```

`core/src/services/roster-service.ts`:
```ts
import { basename } from "node:path";
import type { HostConfig } from "../config.ts";
import { buildIdentityBrief } from "../bots/prompts.ts";
import { isSupportedKind, launchArgsFor } from "../bots/launch-args.ts";
import { GROUP_MAX_MEMBERS, type GroupMember } from "../group/group-chat.ts";
import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { HerdrError, type HerdrAgentInfo } from "../herdr/types.ts";
import { log } from "../log.ts";
import { isValidBotId, makeRoomId, suggestBotId } from "../model/ids.ts";
import type { BotProfile, PermissionMode, ProfileStore } from "../store/profile-store.ts";
import type { RoomConfig, RoomStore } from "../store/room-store.ts";
import { WorkspaceRegistry } from "./workspace-registry.ts";

export type RosterErrorCode = "invalid_bot_id" | "bot_exists" | "unknown_bot" | "unknown_room" | "too_many_members" | "unsupported_kind" | "herdr_error";

export class RosterError extends Error {
  readonly code: RosterErrorCode;

  constructor(code: RosterErrorCode, message: string) {
    super(message);
    this.name = "RosterError";
    this.code = code;
  }
}

export interface CreateBotArgs {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly kind?: string;
  readonly cwd?: string;
  readonly permissionMode?: PermissionMode;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
  readonly adoptPaneId?: string;
}

export interface RosterServiceDeps {
  readonly config: HostConfig;
  readonly profiles: ProfileStore;
  readonly rooms: RoomStore;
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  readonly now?: () => number;
  readonly onNotice?: (chatId: string, text: string) => void;
}

function toMember(profile: BotProfile): GroupMember {
  return { id: profile.id, name: profile.name, description: profile.description };
}

export class RosterService {
  readonly #deps: RosterServiceDeps;
  readonly #workspaces: WorkspaceRegistry;

  constructor(deps: RosterServiceDeps) {
    this.#deps = deps;
    this.#workspaces = new WorkspaceRegistry(deps.config.home);
  }

  async createBot(args: CreateBotArgs): Promise<BotProfile> {
    const id = args.id ?? suggestBotId(args.name);
    if (!isValidBotId(id)) throw new RosterError("invalid_bot_id", `"${id}" must match ^[a-z][a-z0-9_-]{0,31}$ and not start with "room-"`);
    if (this.#deps.profiles.get(id) != null) throw new RosterError("bot_exists", `bot "${id}" already exists`);
    const profile = args.adoptPaneId == null ? await this.#spawn(id, args) : await this.#adopt(id, args, args.adoptPaneId);
    this.#deps.profiles.save(profile);
    await this.#deps.mirror.refresh();
    await this.#sendBrief(profile);
    return profile;
  }

  async deleteBot(id: string): Promise<void> {
    const profile = this.#requireBot(id);
    const paneId = this.#deps.mirror.get(id).paneId ?? profile.herdr.paneId;
    try {
      if (profile.adopted) await this.#deps.cli.agentRename(id, null);
      else if (paneId != null) await this.#deps.cli.paneClose(paneId);
    } catch (error) {
      log("roster", `herdr cleanup for ${id} failed; removing profile anyway`, error instanceof Error ? error.message : String(error));
    }
    for (const room of this.#deps.rooms.list()) {
      if (room.memberIds.includes(id)) this.#deps.rooms.save({ ...room, memberIds: room.memberIds.filter((member) => member !== id), updatedAt: this.#now() });
    }
    this.#deps.profiles.delete(id);
    await this.#deps.mirror.refresh();
  }

  updateProfile(id: string, patch: { readonly name?: string; readonly description?: string; readonly notifyOnUpdatesEnabled?: boolean; readonly isHiddenFromSidebar?: boolean }): BotProfile | null {
    const current = this.#deps.profiles.get(id);
    if (current == null) return null;
    const next: BotProfile = {
      ...current,
      ...(patch.name == null || patch.name.trim().length === 0 ? {} : { name: patch.name.trim() }),
      ...(patch.description == null ? {} : { description: patch.description }),
      ...(patch.notifyOnUpdatesEnabled == null ? {} : { notifyOnUpdatesEnabled: patch.notifyOnUpdatesEnabled }),
      ...(patch.isHiddenFromSidebar == null ? {} : { isHiddenFromSidebar: patch.isHiddenFromSidebar }),
      updatedAt: this.#now(),
    };
    this.#deps.profiles.save(next);
    return next;
  }

  createRoom(args: { readonly name: string; readonly description?: string; readonly memberIds: readonly string[] }): RoomConfig {
    const memberIds = this.#validMembers(args.memberIds);
    const now = this.#now();
    const room: RoomConfig = { id: makeRoomId(args.name), name: args.name.trim().length > 0 ? args.name.trim() : "New room", description: args.description ?? "", memberIds, isHiddenFromSidebar: false, createdAt: now, updatedAt: now };
    this.#deps.rooms.save(room);
    return room;
  }

  setRoomMembers(id: string, memberIds: readonly string[]): RoomConfig | null {
    const room = this.#deps.rooms.get(id);
    if (room == null) return null;
    const next = { ...room, memberIds: this.#validMembers(memberIds), updatedAt: this.#now() };
    this.#deps.rooms.save(next);
    return next;
  }

  updateRoom(id: string, patch: { readonly name?: string; readonly description?: string; readonly isHiddenFromSidebar?: boolean }): RoomConfig | null {
    const room = this.#deps.rooms.get(id);
    if (room == null) return null;
    const next: RoomConfig = {
      ...room,
      ...(patch.name == null || patch.name.trim().length === 0 ? {} : { name: patch.name.trim() }),
      ...(patch.description == null ? {} : { description: patch.description }),
      ...(patch.isHiddenFromSidebar == null ? {} : { isHiddenFromSidebar: patch.isHiddenFromSidebar }),
      updatedAt: this.#now(),
    };
    this.#deps.rooms.save(next);
    return next;
  }

  deleteRoom(id: string): void {
    this.#deps.rooms.delete(id);
  }

  async listAdoptable(): Promise<HerdrAgentInfo[]> {
    const known = new Set(this.#deps.profiles.list().map((profile) => profile.id));
    const agents = await this.#deps.cli.agentList();
    return agents.filter((agent) => agent.name == null || !known.has(agent.name));
  }

  resolveBotByPane(paneId: string): BotProfile | null {
    for (const [botId, runtime] of this.#deps.mirror.snapshot()) {
      if (runtime.paneId === paneId) return this.#deps.profiles.get(botId);
    }
    return this.#deps.profiles.list().find((profile) => profile.herdr.paneId === paneId) ?? null;
  }

  memberIdFor(chatId: string): GroupMember | null {
    const profile = this.#deps.profiles.get(chatId);
    return profile == null ? null : toMember(profile);
  }

  async focus(target: string): Promise<void> {
    try {
      await this.#deps.cli.agentFocus(target);
    } catch (error) {
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }

  #requireBot(id: string): BotProfile {
    const profile = this.#deps.profiles.get(id);
    if (profile == null) throw new RosterError("unknown_bot", `no bot "${id}"`);
    return profile;
  }

  #validMembers(memberIds: readonly string[]): string[] {
    const unique = [...new Set(memberIds)];
    if (unique.length > GROUP_MAX_MEMBERS) throw new RosterError("too_many_members", `a room holds at most ${GROUP_MAX_MEMBERS} bots`);
    for (const id of unique) this.#requireBot(id);
    return unique;
  }

  async #spawn(id: string, args: CreateBotArgs): Promise<BotProfile> {
    const kind = args.kind ?? this.#deps.config.defaultKind;
    if (!isSupportedKind(kind)) throw new RosterError("unsupported_kind", `herdr does not support agent kind "${kind}"`);
    const cwd = args.cwd ?? this.#deps.config.defaultCwd;
    const permissionMode = args.permissionMode ?? "ask";
    const location = await this.#locationFor(cwd, id);
    const launchArgs = launchArgsFor(kind, permissionMode, this.#deps.config.cliPath);
    let sessionId: string | null = null;
    try {
      const started = await this.#deps.cli.agentStart({ name: id, kind, paneId: location.paneId, agentArgs: launchArgs });
      sessionId = started.agent_session?.value ?? null;
    } catch (error) {
      if (error instanceof HerdrError && error.code === "agent_not_ready") {
        this.#deps.onNotice?.(id, `${id} needs first-run setup in herdr (pane ${location.paneId}); finish it there and the bot will come online.`);
      } else {
        throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
      }
    }
    const now = this.#now();
    return {
      id, name: args.name.trim().length > 0 ? args.name.trim() : id, description: args.description ?? "", kind, cwd, permissionMode,
      avatarShape: args.avatarShape ?? null, avatarColor: args.avatarColor ?? null, adopted: false,
      herdr: { paneId: location.paneId, workspaceId: location.workspaceId, sessionId },
      notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false, createdAt: now, updatedAt: now,
    };
  }

  async #adopt(id: string, args: CreateBotArgs, paneId: string): Promise<BotProfile> {
    let info: HerdrAgentInfo;
    try {
      info = await this.#deps.cli.agentGet(paneId);
      if (info.name !== id) await this.#deps.cli.agentRename(paneId, id);
    } catch (error) {
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
    const now = this.#now();
    return {
      id, name: args.name.trim().length > 0 ? args.name.trim() : id, description: args.description ?? "", kind: info.agent ?? "unknown", cwd: info.cwd ?? this.#deps.config.defaultCwd,
      permissionMode: args.permissionMode ?? "ask", avatarShape: args.avatarShape ?? null, avatarColor: args.avatarColor ?? null, adopted: true,
      herdr: { paneId: info.pane_id, workspaceId: info.workspace_id, sessionId: info.agent_session?.value ?? null },
      notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false, createdAt: now, updatedAt: now,
    };
  }

  async #locationFor(cwd: string, botId: string): Promise<{ workspaceId: string; paneId: string }> {
    try {
      const known = this.#workspaces.get(cwd);
      const live = known == null ? false : (await this.#deps.cli.workspaceList()).some((workspace) => workspace.workspace_id === known);
      if (known != null && live) {
        const tab = await this.#deps.cli.tabCreate({ workspaceId: known, cwd, label: botId });
        return { workspaceId: known, paneId: tab.rootPaneId };
      }
      const created = await this.#deps.cli.workspaceCreate({ cwd, label: `herdr-bot: ${basename(cwd)}` });
      this.#workspaces.set(cwd, created.workspaceId);
      return { workspaceId: created.workspaceId, paneId: created.rootPaneId };
    } catch (error) {
      throw new RosterError("herdr_error", error instanceof Error ? error.message : String(error));
    }
  }

  async #sendBrief(profile: BotProfile): Promise<void> {
    const brief = buildIdentityBrief({ bot: toMember(profile), userName: this.#deps.config.userName, cliPath: this.#deps.config.cliPath });
    try {
      await this.#deps.cli.agentPrompt({ target: profile.id, text: brief, wait: true, timeoutMs: this.#deps.config.briefTimeoutMs });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log("roster", `identity brief for ${profile.id} was not confirmed`, detail);
      this.#deps.onNotice?.(profile.id, `${profile.id} did not confirm its room briefing yet (${detail}). It will still receive turn prompts.`);
    }
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/roster-service.test.ts && npm run typecheck
```
Expected: `# pass 6`.

- [ ] **Step 5: 커밋**

```bash
git add core/src/services/workspace-registry.ts core/src/services/roster-service.ts core/test/roster-service.test.ts
git commit -m "feat(core): spawn, adopt, and delete bots and manage rooms through herdr"
```

---

### Task 14: ChatService + RunQueue + TurnService (사용자 메시지 → 오케스트레이션)

**Files:**
- Create: `core/src/host-events.ts`, `core/src/services/chat-service.ts`, `core/src/services/run-queue.ts`, `core/src/services/turn-service.ts`
- Test: `core/test/run-queue.test.ts`, `core/test/chat-service.test.ts`, `core/test/turn-service.test.ts`

**Interfaces:**
- Consumes: 스토어(Task 3/4), 엔트리/서머리(Task 5), 오케스트레이터(Task 7), `runBotTurn`/`SayInbox`(Task 12), `RosterService`(Task 13), 프롬프트(Task 10)
- Produces:
  - `host-events.ts`: `type HostEventFamily = "agents" | "agent-upserted" | "transcript"`, `class HostEvents { on(family, listener: (payload: unknown) => void): () => void; emit(family, payload): void }`
  - `chat-service.ts`:
    ```ts
    class ChatService {
      constructor(deps: { config; profiles; rooms; view: ViewStateStore; mirror; events: HostEvents; isTurnActive: (chatId) => boolean; now? })
      chatKind(chatId): "bot" | "room" | null
      transcript(chatId): TranscriptStore                              // 캐시
      appendUser(chatId, args: { content; clientNonce?; richText?; replyTo? }): StoredEntry   // + activity + emit transcript/agent-upserted
      appendBot(chatId, author, content): StoredEntry
      appendNotice(chatId, content): StoredEntry
      history(chatId): GroupMessage[]
      tail(chatId, limit, beforeSeq?): TranscriptPage
      thread(chatId, rootId): StoredEntry[]
      react(chatId, entryId, emoji): StoredEntry | null                // emit transcript updated
      markViewed(chatId): void; setUnread(chatId, isUnread): void
      summary(chatId): AgentSummary | null; listSummaries(): AgentSummary[]
      emitRoster(): void; emitUpsert(chatId): void
    }
    ```
    이벤트 페이로드: `transcript` → `{ type: "appended" | "updated", agentId, entry }`; `agents` → `AgentSummary[]`; `agent-upserted` → `AgentSummary`.
  - `run-queue.ts`: `class RunQueue { nextEpoch(chatId): number; currentEpoch(chatId): number; isRunning(chatId): boolean; enqueue(chatId, run: () => Promise<void>): Promise<void> }` — chat별 직렬 실행.
  - `turn-service.ts`: `class TurnService { constructor(deps: { config; roster; chat; runQueue; cli; mirror; inbox: SayInbox }); schedule(chatId): Promise<void>; isTurnActive(chatId): boolean; handleSay(paneId, chatId, text): { entryId; mode }; handlePass(paneId, chatId): void }`
- `schedule(chatId)`: `epoch = runQueue.nextEpoch(chatId)`; `enqueue(chatId, () => runTurn(chatId, epoch))`. `runTurn`: 방이면 멤버 = room.memberIds, 봇이면 `[botId]`(maxRounds 1). 오케스트레이터 deps: `resolveMembers` = 프로필 있는 것만, `readHistory` = `chat.history(chatId)`, `isCurrent` = `runQueue.currentEpoch(chatId) === epoch`, `runMemberTurn` = 프롬프트 빌드 → `runBotTurn`. `onMemberTurnEnded`에서 `busy/blocked/stalled/timeout/offline/error`는 notice 문장을 붙인다(`settled`는 무음). 턴 시작/종료 시 `chat.emitUpsert(chatId)`(isRunning 반영).
- `handleSay`: `roster.resolveBotByPane(paneId)` 없으면 `ControlError("unknown_pane")`; 방이면 멤버 검사(`not_a_member`), DM이면 chatId === botId여야 함; `inbox.accept` → `over-cap`이면 `ControlError("over_cap")`; 그 외 `chat.appendBot` 후 `{entryId, mode}`.

- [ ] **Step 1: 실패하는 테스트**

`core/test/run-queue.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RunQueue } from "../src/services/run-queue.ts";

test("runs per chat are serialized and epochs advance", async () => {
  const queue = new RunQueue();
  const order: string[] = [];
  const e1 = queue.nextEpoch("r");
  const e2 = queue.nextEpoch("r");
  assert.equal(e2, e1 + 1);
  assert.equal(queue.currentEpoch("r"), e2);
  const first = queue.enqueue("r", async () => { order.push("a-start"); await new Promise((r) => setTimeout(r, 30)); order.push("a-end"); });
  const second = queue.enqueue("r", async () => { order.push("b"); });
  assert.equal(queue.isRunning("r"), true);
  await Promise.all([first, second]);
  assert.deepEqual(order, ["a-start", "a-end", "b"]);
  assert.equal(queue.isRunning("r"), false);
});

test("a failing run does not poison the queue", async () => {
  const queue = new RunQueue();
  await queue.enqueue("r", async () => { throw new Error("boom"); }).catch(() => undefined);
  let ran = false;
  await queue.enqueue("r", async () => { ran = true; });
  assert.equal(ran, true);
});
```

`core/test/chat-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../src/config.ts";
import { HostEvents } from "../src/host-events.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

function harness() {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BOT_USER_NAME: "ray" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  profiles.save(sampleProfile({ id: "reviewer", name: "Reviewer" }));
  profiles.save(sampleProfile({ id: "fixer", name: "Fixer" }));
  rooms.save(sampleRoom({ id: "room-auth-1a2b", memberIds: ["reviewer", "fixer"] }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  const events = new HostEvents();
  const seen: { family: string; payload: unknown }[] = [];
  for (const family of ["agents", "agent-upserted", "transcript"] as const) events.on(family, (payload) => seen.push({ family, payload }));
  let now = 100;
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: () => false, now: () => (now += 1) });
  return { temp, chat, seen };
}

test("appendUser stores the renderer message shape, marks activity, and emits transcript + upsert", () => {
  const h = harness();
  try {
    const entry = h.chat.appendUser("room-auth-1a2b", { content: "go", clientNonce: "n1" });
    assert.equal(entry.kind, "message");
    assert.equal(entry.clientNonce, "n1");
    assert.deepEqual(entry.author, { id: "user", name: "ray" });
    const transcript = h.seen.find((e) => e.family === "transcript")?.payload as { type: string; agentId: string; entry: { id: string } };
    assert.deepEqual([transcript.type, transcript.agentId, transcript.entry.id], ["appended", "room-auth-1a2b", "e1"]);
    const upsert = h.seen.find((e) => e.family === "agent-upserted")?.payload as { id: string; hasUnread: boolean; lastMessagePreview: string };
    assert.equal(upsert.id, "room-auth-1a2b");
    assert.equal(upsert.lastMessagePreview, "go");
    assert.deepEqual(h.chat.history("room-auth-1a2b"), [{ speaker: { kind: "user", name: "ray" }, content: "go" }]);
  } finally {
    h.temp.cleanup();
  }
});

test("bot messages, notices, reactions, and view state flow through summaries", () => {
  const h = harness();
  try {
    h.chat.appendUser("room-auth-1a2b", { content: "go" });
    const said = h.chat.appendBot("room-auth-1a2b", { id: "reviewer", name: "Reviewer" }, "done");
    h.chat.appendNotice("room-auth-1a2b", "fixer is busy");
    assert.equal(h.chat.history("room-auth-1a2b").length, 2);
    const reacted = h.chat.react("room-auth-1a2b", said.id, "👍");
    assert.deepEqual(reacted?.reactions, [{ emoji: "👍", by: "me" }]);
    assert.equal((h.seen.at(-1)?.payload as { type: string }).type, "updated");
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, true);
    h.chat.markViewed("room-auth-1a2b");
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, false);
    h.chat.setUnread("room-auth-1a2b", true);
    assert.equal(h.chat.summary("room-auth-1a2b")?.hasUnread, true);
    const page = h.chat.tail("room-auth-1a2b", 2);
    assert.equal(page.entries.length, 2);
    assert.equal(page.nextBeforeSeq, 2);
  } finally {
    h.temp.cleanup();
  }
});

test("listSummaries includes bots and rooms; unknown chats are null", () => {
  const h = harness();
  try {
    const ids = h.chat.listSummaries().map((s) => s.id).sort();
    assert.deepEqual(ids, ["fixer", "reviewer", "room-auth-1a2b"]);
    assert.equal(h.chat.summary("nope"), null);
    assert.equal(h.chat.chatKind("reviewer"), "bot");
    assert.equal(h.chat.chatKind("room-auth-1a2b"), "room");
    assert.throws(() => h.chat.appendUser("nope", { content: "x" }));
  } finally {
    h.temp.cleanup();
  }
});
```

`core/test/turn-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { resolveConfig } from "../src/config.ts";
import { HostEvents } from "../src/host-events.ts";
import { SayInbox } from "../src/bots/say-inbox.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { StatusMirror } from "../src/herdr/status-mirror.ts";
import { ChatService } from "../src/services/chat-service.ts";
import { RosterService } from "../src/services/roster-service.ts";
import { RunQueue } from "../src/services/run-queue.ts";
import { TurnService } from "../src/services/turn-service.ts";
import { ProfileStore } from "../src/store/profile-store.ts";
import { RoomStore } from "../src/store/room-store.ts";
import { ViewStateStore } from "../src/store/view-state-store.ts";
import { startControlServer } from "../src/control/server.ts";
import { ControlError } from "../src/control/protocol.ts";
import { installFakeHerdr, type FakeHerdrState } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";
import { sampleProfile, sampleRoom } from "./helpers/fixtures.ts";

const agent = (name: string, status: "idle" | "working" | "blocked" = "idle") => ({ name, agent: "claude", agent_status: status, pane_id: `w1:p-${name}`, tab_id: "w1:t1", workspace_id: "w1", cwd: "/tmp" });

async function harness(state: FakeHerdrState) {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, state);
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_TURN_TIMEOUT_MS: "5000" });
  const profiles = new ProfileStore(temp.home);
  const rooms = new RoomStore(temp.home);
  for (const a of state.agents) profiles.save(sampleProfile({ id: a.name ?? "x", name: (a.name ?? "x").toUpperCase(), herdr: { paneId: a.pane_id, workspaceId: "w1", sessionId: null } }));
  rooms.save(sampleRoom({ id: "room-1", memberIds: state.agents.map((a) => a.name ?? "") }));
  const cli = createHerdrCli(fake.binPath, fake.env);
  const mirror = new StatusMirror({ cli, socketPath: null, botIds: () => profiles.list().map((p) => p.id), onChange: () => undefined });
  await mirror.refresh();
  const events = new HostEvents();
  const runQueue = new RunQueue();
  const inbox = new SayInbox();
  let turns: TurnService | null = null;
  const chat = new ChatService({ config, profiles, rooms, view: new ViewStateStore(temp.home), mirror, events, isTurnActive: (id) => turns?.isTurnActive(id) ?? false });
  const roster = new RosterService({ config, profiles, rooms, cli, mirror });
  turns = new TurnService({ config, roster, chat, runQueue, cli, mirror, inbox });
  const server = await startControlServer(join(temp.home, "host.sock"), async (method, params) => {
    if (method === "say") return turns!.handleSay(String(params.paneId), String(params.chatId), String(params.text));
    throw new ControlError("unknown_method", method);
  });
  return { temp, fake, chat, turns, cleanup: async () => { await server.close(); temp.cleanup(); } };
}

test("a user message runs a full room turn: every member speaks, replies land in the transcript with authors", async () => {
  const h = await harness({ agents: [agent("a"), agent("b")], workspaces: [], onPrompt: { a: { say: ["a says hi"], sayOnce: true }, b: { say: ["b says hi"], sayOnce: true } } });
  try {
    h.chat.appendUser("room-1", { content: "hello everyone" });
    await h.turns.schedule("room-1");
    const texts = h.chat.transcript("room-1").readAll().map((e) => `${(e.author as { id: string } | undefined)?.id ?? "-"}:${e.kind}`);
    assert.deepEqual(texts.slice(0, 3), ["user:message", "a:send-message", "b:send-message"]);
    const prompts = h.fake.readState().prompts ?? [];
    assert.match(prompts[0]!.text, /\[herdr-bot room "auth" - with B\]/);
    assert.match(prompts[0]!.text, /ray \(user\): hello everyone/);
    assert.match(prompts[1]!.text, /A: a says hi/);
  } finally {
    await h.cleanup();
  }
});

test("mentions limit responders, busy bots get a notice, and DM turns run a single round", async () => {
  const h = await harness({ agents: [agent("a"), agent("b", "working")], workspaces: [], onPrompt: { a: { say: ["only me"], sayOnce: true } } });
  try {
    h.chat.appendUser("room-1", { content: "@a please" });
    await h.turns.schedule("room-1");
    const kinds = h.chat.transcript("room-1").readAll().map((e) => e.kind);
    assert.deepEqual(kinds, ["message", "send-message"]);
    h.chat.appendUser("room-1", { content: "@b you too" });
    await h.turns.schedule("room-1");
    const notice = h.chat.transcript("room-1").readAll().find((e) => e.kind === "notice");
    assert.match(String(notice?.content), /B is busy/);
    h.chat.appendUser("a", { content: "dm hi" });
    await h.turns.schedule("a");
    const dm = h.fake.readState().prompts?.find((p) => /\[herdr-bot DM\]/.test(p.text));
    assert.ok(dm);
    assert.match(dm!.text, /say a "/);
  } finally {
    await h.cleanup();
  }
});

test("handleSay enforces pane identity and membership; late says are appended", async () => {
  const h = await harness({ agents: [agent("a")], workspaces: [] });
  try {
    assert.throws(() => h.turns.handleSay("w9:p9", "room-1", "x"), (e: unknown) => e instanceof ControlError && e.code === "unknown_pane");
    assert.throws(() => h.turns.handleSay("w1:p-a", "room-other", "x"), (e: unknown) => e instanceof ControlError && e.code === "unknown_chat");
    const late = h.turns.handleSay("w1:p-a", "room-1", "late thought");
    assert.equal(late.mode, "late");
    assert.equal(h.chat.transcript("room-1").last()?.kind, "send-message");
  } finally {
    await h.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/run-queue.test.ts core/test/chat-service.test.ts core/test/turn-service.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`core/src/host-events.ts`:
```ts
export type HostEventFamily = "agents" | "agent-upserted" | "transcript";

type Listener = (payload: unknown) => void;

export class HostEvents {
  readonly #listeners = new Map<HostEventFamily, Set<Listener>>();

  on(family: HostEventFamily, listener: Listener): () => void {
    const set = this.#listeners.get(family) ?? new Set<Listener>();
    set.add(listener);
    this.#listeners.set(family, set);
    return () => {
      set.delete(listener);
    };
  }

  emit(family: HostEventFamily, payload: unknown): void {
    for (const listener of [...(this.#listeners.get(family) ?? [])]) listener(payload);
  }
}
```

`core/src/services/run-queue.ts`:
```ts
interface ChatQueue {
  readonly epoch: number;
  readonly tail: Promise<void>;
  readonly running: number;
}

export class RunQueue {
  #queues = new Map<string, ChatQueue>();

  currentEpoch(chatId: string): number {
    return this.#queues.get(chatId)?.epoch ?? 0;
  }

  nextEpoch(chatId: string): number {
    const current = this.#get(chatId);
    const next = { ...current, epoch: current.epoch + 1 };
    this.#queues.set(chatId, next);
    return next.epoch;
  }

  isRunning(chatId: string): boolean {
    return (this.#queues.get(chatId)?.running ?? 0) > 0;
  }

  enqueue(chatId: string, run: () => Promise<void>): Promise<void> {
    const current = this.#get(chatId);
    const tail = current.tail.then(run, run).finally(() => {
      const after = this.#get(chatId);
      this.#queues.set(chatId, { ...after, running: after.running - 1 });
    });
    this.#queues.set(chatId, { ...current, tail: tail.catch(() => undefined), running: current.running + 1 });
    return tail;
  }

  #get(chatId: string): ChatQueue {
    return this.#queues.get(chatId) ?? { epoch: 0, tail: Promise.resolve(), running: 0 };
  }
}
```

`core/src/services/chat-service.ts`:
```ts
import { hostPaths, type HostConfig } from "../config.ts";
import type { GroupMessage } from "../group/group-chat.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import type { HostEvents } from "../host-events.ts";
import { botMessageEntry, noticeEntry, toGroupMessage, toggleReaction, userMessageEntry, type Author } from "../model/entries.ts";
import { isRoomId } from "../model/ids.ts";
import { botSummary, roomSummary, type AgentSummary } from "../model/summaries.ts";
import type { ProfileStore } from "../store/profile-store.ts";
import type { RoomStore } from "../store/room-store.ts";
import { TranscriptStore, type NewEntry, type StoredEntry, type TranscriptPage } from "../store/transcript-store.ts";
import type { ViewStateStore } from "../store/view-state-store.ts";
import { ControlError } from "../control/protocol.ts";

export interface ChatServiceDeps {
  readonly config: HostConfig;
  readonly profiles: ProfileStore;
  readonly rooms: RoomStore;
  readonly view: ViewStateStore;
  readonly mirror: StatusMirror;
  readonly events: HostEvents;
  readonly isTurnActive: (chatId: string) => boolean;
  readonly now?: () => number;
}

export type ChatKind = "bot" | "room";

export class ChatService {
  readonly #deps: ChatServiceDeps;
  readonly #transcripts = new Map<string, TranscriptStore>();

  constructor(deps: ChatServiceDeps) {
    this.#deps = deps;
  }

  chatKind(chatId: string): ChatKind | null {
    if (isRoomId(chatId)) return this.#deps.rooms.get(chatId) == null ? null : "room";
    return this.#deps.profiles.get(chatId) == null ? null : "bot";
  }

  transcript(chatId: string): TranscriptStore {
    const cached = this.#transcripts.get(chatId);
    if (cached != null) return cached;
    const path = isRoomId(chatId) ? hostPaths.roomTranscript(this.#deps.config.home, chatId) : hostPaths.botTranscript(this.#deps.config.home, chatId);
    const store = new TranscriptStore(path);
    this.#transcripts.set(chatId, store);
    return store;
  }

  appendUser(chatId: string, args: { readonly content: string; readonly clientNonce?: string; readonly richText?: string; readonly replyTo?: string }): StoredEntry {
    this.#requireChat(chatId);
    const entry = userMessageEntry({ ...args, timestampMs: this.#now(), userName: this.#deps.config.userName });
    return this.#append(chatId, entry, true);
  }

  appendBot(chatId: string, author: Author, content: string): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, botMessageEntry({ content, author, timestampMs: this.#now() }), false);
  }

  appendNotice(chatId: string, content: string): StoredEntry {
    this.#requireChat(chatId);
    return this.#append(chatId, noticeEntry({ content, timestampMs: this.#now() }), false);
  }

  history(chatId: string): GroupMessage[] {
    return this.transcript(chatId).readAll().flatMap((entry) => {
      const message = toGroupMessage(entry);
      return message == null ? [] : [message];
    });
  }

  tail(chatId: string, limit: number, beforeSeq?: number): TranscriptPage {
    return this.transcript(chatId).tail(limit, beforeSeq);
  }

  thread(chatId: string, rootId: string): StoredEntry[] {
    return this.transcript(chatId).readAll().filter((entry) => entry.id === rootId || entry.replyTo === rootId);
  }

  react(chatId: string, entryId: string, emoji: string): StoredEntry | null {
    const updated = this.transcript(chatId).update(entryId, (entry) => toggleReaction(entry, emoji));
    if (updated != null) this.#deps.events.emit("transcript", { type: "updated", agentId: chatId, entry: updated });
    return updated;
  }

  markViewed(chatId: string): void {
    this.#deps.view.markViewed(chatId, this.#now());
    this.emitUpsert(chatId);
  }

  setUnread(chatId: string, isUnread: boolean): void {
    this.#deps.view.setManuallyUnread(chatId, isUnread);
    this.emitUpsert(chatId);
  }

  summary(chatId: string): AgentSummary | null {
    const view = this.#deps.view.get(chatId);
    const isTurnActive = this.#deps.isTurnActive(chatId);
    if (isRoomId(chatId)) {
      const room = this.#deps.rooms.get(chatId);
      return room == null ? null : roomSummary({ room, last: this.transcript(chatId).last(), view, isTurnActive });
    }
    const profile = this.#deps.profiles.get(chatId);
    return profile == null ? null : botSummary({ profile, runtime: this.#deps.mirror.get(chatId), last: this.transcript(chatId).last(), view, isTurnActive });
  }

  listSummaries(): AgentSummary[] {
    const ids = [...this.#deps.profiles.list().map((profile) => profile.id), ...this.#deps.rooms.list().map((room) => room.id)];
    return ids.flatMap((id) => {
      const summary = this.summary(id);
      return summary == null ? [] : [summary];
    });
  }

  emitRoster(): void {
    this.#deps.events.emit("agents", this.listSummaries());
  }

  emitUpsert(chatId: string): void {
    const summary = this.summary(chatId);
    if (summary != null) this.#deps.events.emit("agent-upserted", summary);
  }

  #append(chatId: string, entry: NewEntry, fromUser: boolean): StoredEntry {
    const stored = this.transcript(chatId).append(entry);
    const now = this.#now();
    this.#deps.view.markActivity(chatId, now);
    if (fromUser) this.#deps.view.markViewed(chatId, now);
    this.#deps.events.emit("transcript", { type: "appended", agentId: chatId, entry: stored });
    this.emitUpsert(chatId);
    return stored;
  }

  #requireChat(chatId: string): void {
    if (this.chatKind(chatId) == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }
}
```

`core/src/services/turn-service.ts`:
```ts
import type { HostConfig } from "../config.ts";
import { buildDmTurnPrompt, buildRoomTurnPrompt } from "../bots/prompts.ts";
import type { SayInbox } from "../bots/say-inbox.ts";
import { runBotTurn } from "../bots/turn-runner.ts";
import { ControlError } from "../control/protocol.ts";
import type { GroupMember, GroupMessage } from "../group/group-chat.ts";
import { GroupChatOrchestrator, type MemberTurnResult } from "../group/orchestrator.ts";
import type { HerdrCli } from "../herdr/cli.ts";
import type { StatusMirror } from "../herdr/status-mirror.ts";
import { log } from "../log.ts";
import type { ChatService } from "./chat-service.ts";
import type { RosterService } from "./roster-service.ts";
import type { RunQueue } from "./run-queue.ts";

export interface TurnServiceDeps {
  readonly config: HostConfig;
  readonly roster: RosterService;
  readonly chat: ChatService;
  readonly runQueue: RunQueue;
  readonly cli: HerdrCli;
  readonly mirror: StatusMirror;
  readonly inbox: SayInbox;
}

export function outcomeNotice(member: GroupMember, result: MemberTurnResult, paneId: string | null, turnTimeoutMs: number): string | null {
  const where = paneId == null ? "" : ` (pane ${paneId})`;
  switch (result.outcome) {
    case "settled": return null;
    case "busy": return `${member.name} is busy with other work in herdr${where}; skipped this turn.`;
    case "blocked": return `${member.name} is waiting for an approval or answer in herdr${where}. Resolve it there to let the bot continue.`;
    case "stalled": return `${member.name} did not react to the turn prompt${where}; check its pane.`;
    case "timeout": return `${member.name} did not finish its turn within ${Math.round(turnTimeoutMs / 1000)}s${where}.`;
    case "offline": return `${member.name} is offline (no herdr agent named "${member.id}").`;
    case "error": return `${member.name}'s turn failed; see the host log.`;
  }
}

export class TurnService {
  readonly #deps: TurnServiceDeps;
  readonly #active = new Set<string>();

  constructor(deps: TurnServiceDeps) {
    this.#deps = deps;
  }

  isTurnActive(chatId: string): boolean {
    return this.#active.has(chatId);
  }

  schedule(chatId: string): Promise<void> {
    const epoch = this.#deps.runQueue.nextEpoch(chatId);
    return this.#deps.runQueue.enqueue(chatId, () => this.#runTurn(chatId, epoch));
  }

  handleSay(paneId: string, chatId: string, text: string): { entryId: string; mode: "in-turn" | "late" } {
    const bot = this.#deps.roster.resolveBotByPane(paneId);
    if (bot == null) throw new ControlError("unknown_pane", `pane ${paneId} is not a herdr-bot bot`);
    this.#assertMember(bot.id, chatId);
    const mode = this.#deps.inbox.accept(chatId, bot.id, text);
    if (mode === "over-cap") throw new ControlError("over_cap", "you already said the maximum number of messages this turn; wait for your next turn");
    const entry = this.#deps.chat.appendBot(chatId, { id: bot.id, name: bot.name }, text);
    return { entryId: entry.id, mode };
  }

  handlePass(paneId: string, chatId: string): void {
    const bot = this.#deps.roster.resolveBotByPane(paneId);
    if (bot == null) throw new ControlError("unknown_pane", `pane ${paneId} is not a herdr-bot bot`);
    this.#assertMember(bot.id, chatId);
  }

  #assertMember(botId: string, chatId: string): void {
    const kind = this.#deps.chat.chatKind(chatId);
    if (kind == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
    if (kind === "bot" && chatId !== botId) throw new ControlError("not_a_member", `"${chatId}" is another bot's DM`);
    if (kind === "room") {
      const members = this.#roomMembers(chatId);
      if (members != null && !members.includes(botId)) throw new ControlError("not_a_member", `${botId} is not a member of ${chatId}`);
    }
  }

  #roomMembers(chatId: string): readonly string[] | null {
    const summary = this.#deps.chat.summary(chatId);
    return summary?.isGroup === true ? summary.memberIds : null;
  }

  async #runTurn(chatId: string, epoch: number): Promise<void> {
    const kind = this.#deps.chat.chatKind(chatId);
    if (kind == null) return;
    const memberIds = kind === "room" ? this.#roomMembers(chatId) ?? [] : [chatId];
    this.#active.add(chatId);
    this.#deps.chat.emitUpsert(chatId);
    try {
      const orchestrator = new GroupChatOrchestrator({
        resolveMembers: async (ids) => ids.flatMap((id) => { const member = this.#deps.roster.memberIdFor(id); return member == null ? [] : [member]; }),
        readHistory: () => this.#deps.chat.history(chatId),
        isCurrent: () => this.#deps.runQueue.currentEpoch(chatId) === epoch,
        runMemberTurn: ({ member, peers, newMessages }) => this.#memberTurn(chatId, kind, member, peers, newMessages),
        onMemberTurnEnded: (member, result) => {
          const notice = outcomeNotice(member, result, this.#deps.mirror.get(member.id).paneId, this.#deps.config.turnTimeoutMs);
          if (notice != null) this.#deps.chat.appendNotice(chatId, notice);
        },
      }, kind === "bot" ? { maxRounds: 1 } : {});
      await orchestrator.run({ memberIds });
    } catch (error) {
      log("turn", `turn for ${chatId} crashed`, error instanceof Error ? error.message : String(error));
    } finally {
      this.#active.delete(chatId);
      this.#deps.chat.emitUpsert(chatId);
    }
  }

  #memberTurn(chatId: string, kind: "bot" | "room", member: GroupMember, peers: readonly GroupMember[], newMessages: readonly GroupMessage[]): Promise<MemberTurnResult> {
    const cliPath = this.#deps.config.cliPath;
    const prompt = kind === "room"
      ? buildRoomTurnPrompt({ room: this.#roomIdentity(chatId), member, peers, newMessages, cliPath })
      : buildDmTurnPrompt({ bot: member, chatId, userName: this.#deps.config.userName, newMessages, cliPath });
    return runBotTurn({ cli: this.#deps.cli, mirror: this.#deps.mirror, inbox: this.#deps.inbox, turnTimeoutMs: this.#deps.config.turnTimeoutMs }, { chatId, botId: member.id, prompt });
  }

  #roomIdentity(chatId: string): { id: string; name: string; description: string } {
    const summary = this.#deps.chat.summary(chatId);
    return { id: chatId, name: summary?.name ?? chatId, description: summary?.description ?? "" };
  }
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test core/test/run-queue.test.ts core/test/chat-service.test.ts core/test/turn-service.test.ts && npm run typecheck
```
Expected: `# pass 8` (+ import된 샘플 테스트). 첫 turn-service 테스트는 가짜 herdr가 control 소켓으로 `say`를 보내고 그것이 트랜스크립트에 저자와 함께 붙는 **전체 루프**를 검증한다.

- [ ] **Step 5: 커밋**

```bash
git add core/src/host-events.ts core/src/services core/test/run-queue.test.ts core/test/chat-service.test.ts core/test/turn-service.test.ts
git commit -m "feat(core): orchestrate room and DM turns from user messages over herdr"
```

---

### Task 15: Host 구성 루트 + control 핸들러 + coordinator 디스패처/포트 서버

**Files:**
- Create: `core/src/host.ts`, `core/src/control/handlers.ts`, `core/src/coordinator/frames.ts`, `core/src/coordinator/port-server.ts`, `core/src/coordinator/dispatcher.ts`, `core/src/index.ts`
- Test: `core/test/host.test.ts`, `core/test/coordinator-dispatcher.test.ts`, `core/test/coordinator-port-server.test.ts`

**Interfaces:**
- Produces:
  - `host.ts`:
    ```ts
    interface Host {
      readonly config: HostConfig; readonly events: HostEvents;
      readonly roster: RosterService; readonly chat: ChatService; readonly turns: TurnService; readonly mirror: StatusMirror;
      start(): Promise<void>;      // control 서버 listen + mirror.start
      stop(): Promise<void>;
      sendUserMessage(chatId, args: { content; clientNonce?; richText?; replyTo?; attachmentPaths?: string[] }): StoredEntry  // append + schedule (fire-and-forget)
      status(): { home; bots: number; rooms: number; runningTurns: string[] }
    }
    createHost(config: HostConfig, overrides?: { cli?: HerdrCli; socketPath?: string | null; now?: () => number }): Host
    ```
  - `control/handlers.ts`: `createControlHandler(host: Host): ControlHandler` — 프로토콜 표의 모든 메서드 구현.
  - `coordinator/frames.ts`: grok-bot `coordinator-port.ts`와 동일한 프레임 타입/파서 재구현: `COORDINATOR_PROTOCOL_VERSION = 1`, `COORDINATOR_UNKNOWN_METHOD = "unknown-method"`, `COORDINATOR_CANCELLED = "cancelled"`, `type CoordinatorFrame`, `type CoordinatorReplyOutcome`, `parseCoordinatorFrame(value): { accepted: true; frame } | { accepted: false; rejection: { code: "malformed-frame"; detail } }`
  - `coordinator/port-server.ts`: `interface RendererPort { post(frame): void; close(): void }`, `createRendererPortServer(port, options: { dispatchRequest(method, args, signal): Promise<CoordinatorReplyOutcome>; onServing?() }): { handleMessage(value): void; handlePortClosed(): void; postEvent(family, payload): void; settled: Promise<Settlement> }` — hello/ready 핸드셰이크, 요청 중복 id 검출, cancel.
  - `coordinator/dispatcher.ts`: `createCoordinatorDispatcher(host): (method: string, args: unknown) => Promise<CoordinatorReplyOutcome>` — 아래 표.
  - `index.ts`: public re-exports.

**coordinator 메서드 구현 표** (인자 이름은 렌더러 호출부 기준):

| method | args | reply |
|---|---|---|
| `listAgents` | — | `AgentSummary[]` |
| `countAgents` | — | `number` |
| `searchAgents` | `{query}` | 이름/설명 부분 일치 `AgentSummary[]` |
| `createAgent` | `{name, description?, avatarShape?, avatarColor?, clientNonce?, herdrBot?: {id?, kind?, cwd?, permissionMode?, adoptPaneId?}}` | `{agent: AgentSummary, transcript: []}` |
| `createGroup` | `{name, description?, memberIds}` | `{agent: AgentSummary, transcript: []}` |
| `setGroupMembers` | `{id, memberAgentIds}` | `AgentSummary \| null` |
| `updateAgent` | `{id, profile: {name, title?, description}}` | `AgentSummary \| null` (봇/방 모두) |
| `deleteAgents` | `{ids}` | `{deletedIds: string[]}` |
| `duplicateAgent` | `{id}` | failure `unsupported` |
| `openAgentTail` | `{id, limit}` | `{entries, nextBeforeSeq?}` + `markViewed` |
| `getAgentTranscriptTail` | `{id, limit, beforeSeq?}` | `{entries, nextBeforeSeq?}` |
| `getAgentTranscriptWindow` | `{id, beforeSeq?, limit?}` | `{entries, nextBeforeSeq?, threadCounts: {}}` |
| `getAgentThread` | `{id, rootId}` | `{entries}` |
| `sendPrompt` | `{agentId, prompt, clientNonce?, richText?, replyToId?, attachmentPaths?, attachmentNames?}` | `{accepted: true, entryId}` |
| `reactToMessage` | `{agentId, entryId, emoji}` | `null` |
| `setAgentUnread` | `{id, isUnread}` | `null` |
| `setAgentHiddenFromSidebar` | `{id, isHidden}` | `null` |
| `setAgentNotifyOnUpdates` | `{id, isEnabled}` | `AgentSummary \| null` |
| `herdrBot.listAdoptable` | — | `HerdrAgentInfo[]` |
| `herdrBot.focus` | `{id}` | `null` (`herdr agent focus`) |
| stub → `[]`: `getAsyncTasks`, `getAgentWorkflows`, `getAgentAutomations`, `listAllAutomations`, `getTrays`, `getSubagents`, `getConversationOutline`, `searchMedia` | | |
| stub → `null`: `getForeverBoxStatus`, `ensureForeverBox`, `handBackForeverBox`, `dismissTray`, `clearTrays`, `getCloudAgentInfo`, `respondToWidget`, `dismissWidget`, `resolveLocalToolPermission`, `resolveAutoReviewApproval`, `submitSecret`, `getListenerConnectUrl` | | |
| stub → `false`: `isAgentNetworkEnabled`, `isGlobalSearchEnabled`, `isEgressTunnelAvailable` | | |
| stub → 객체: `getSharingState` → `{isEnabled:false, selfAuthId:null, pendingJoinRequests:[], rooms:[], typingUsers:[]}`, `getListenerIntegrations` → `{}`, `getAgentChannels`/`connectChannel`/`disconnectChannel`/`refreshChannel` → `{channels: []}`, `getTeachRecordingStatus` → `{status:"idle"}`, `getPluginSyncStatus` → `{}`, `getSkillPublishTargets` → `{}` | | |
| 그 외 | | failure `{code: "unknown-method", message}` |

`sendPrompt`의 `attachmentPaths`는 v1에서 본문 뒤에 `\n\n(attached: <path>)` 줄로 덧붙인다(봇은 로컬 파일을 직접 읽을 수 있다).

- [ ] **Step 1: 실패하는 테스트**

`core/test/coordinator-port-server.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRendererPortServer } from "../src/coordinator/port-server.ts";
import type { CoordinatorFrame } from "../src/coordinator/frames.ts";

function harness(dispatch = async (method: string, args: unknown) => ({ status: "ok" as const, value: { method, args } })) {
  const posted: CoordinatorFrame[] = [];
  let closed = false;
  const server = createRendererPortServer({ post: (frame) => posted.push(frame), close: () => { closed = true; } }, { dispatchRequest: dispatch });
  return { posted, server, isClosed: () => closed };
}

test("hello → ready handshake, then requests get replies and events are forwarded", async () => {
  const h = harness();
  h.server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
  assert.deepEqual(h.posted[0], { kind: "lifecycle", phase: "ready", protocolVersion: 1 });
  h.server.handleMessage({ kind: "request", requestId: "r1", method: "listAgents", args: {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(h.posted[1], { kind: "reply", requestId: "r1", outcome: { status: "ok", value: { method: "listAgents", args: {} } } });
  h.server.postEvent("agents", [1]);
  assert.deepEqual(h.posted[2], { kind: "event", family: "agents", payload: [1] });
});

test("protocol breaches shut the session down", async () => {
  const h = harness();
  h.server.handleMessage({ kind: "request", requestId: "r1", method: "x", args: {} });
  const settlement = await h.server.settled;
  assert.equal(settlement.outcome, "protocol-breach");
  assert.equal(h.isClosed(), true);
  assert.equal((h.posted[0] as { phase: string }).phase, "shutdown");
});

test("wrong protocol version and malformed frames are rejected", async () => {
  const h = harness();
  h.server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 2 });
  assert.equal((await h.server.settled).outcome, "protocol-breach");
  const g = harness();
  g.server.handleMessage("garbage");
  assert.equal((await g.server.settled).outcome, "protocol-breach");
});

test("cancel aborts an in-flight request", async () => {
  let aborted = false;
  const h = harness((_method, _args) => new Promise((resolve) => { setTimeout(() => resolve({ status: "ok", value: 1 }), 50); }));
  h.server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
  const server = createRendererPortServer({ post: (frame) => h.posted.push(frame), close: () => undefined }, {
    dispatchRequest: (_m, _a, signal) => new Promise((resolve) => { signal.addEventListener("abort", () => { aborted = true; }); setTimeout(() => resolve({ status: "ok", value: 1 }), 50); }),
  });
  server.handleMessage({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
  server.handleMessage({ kind: "request", requestId: "r1", method: "slow", args: {} });
  server.handleMessage({ kind: "cancel", requestId: "r1" });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(aborted, true);
  assert.ok(h.posted.some((f) => f.kind === "reply" && f.requestId === "r1" && f.outcome.status === "failed" && f.outcome.failure.code === "cancelled"));
});
```

`core/test/coordinator-dispatcher.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { createCoordinatorDispatcher } from "../src/coordinator/dispatcher.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

async function harness() {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { reviewer: { say: ["hi from reviewer"] } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null });
  await host.start();
  const dispatch = createCoordinatorDispatcher(host);
  const call = async (method: string, args: unknown = {}) => {
    const outcome = await dispatch(method, args);
    if (outcome.status !== "ok") throw new Error(`${method}: ${outcome.failure.code} ${outcome.failure.message}`);
    return outcome.value as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test convenience
  };
  return { temp, fake, host, dispatch, call, cleanup: async () => { await host.stop(); temp.cleanup(); } };
}

test("createAgent / createGroup / listAgents / updateAgent / deleteAgents round-trip", async () => {
  const h = await harness();
  try {
    const created = await h.call("createAgent", { name: "Reviewer", description: "", herdrBot: { id: "reviewer", kind: "claude", permissionMode: "ask" } });
    assert.equal(created.agent.id, "reviewer");
    assert.deepEqual(created.transcript, []);
    const group = await h.call("createGroup", { name: "Auth", description: "fix login", memberIds: ["reviewer"] });
    assert.equal(group.agent.isGroup, true);
    assert.deepEqual((await h.call("listAgents")).map((a: { id: string }) => a.id).sort(), ["reviewer", group.agent.id].sort());
    assert.equal(await h.call("countAgents"), 2);
    const renamed = await h.call("updateAgent", { id: "reviewer", profile: { name: "Ava", description: "helps" } });
    assert.equal(renamed.name, "Ava");
    assert.equal((await h.call("updateAgent", { id: group.agent.id, profile: { name: "Login", description: "" } })).name, "Login");
    assert.deepEqual(await h.call("setGroupMembers", { id: group.agent.id, memberAgentIds: [] }).then((s: { memberIds: string[] }) => s.memberIds), []);
    assert.deepEqual(await h.call("deleteAgents", { ids: [group.agent.id, "reviewer"] }), { deletedIds: [group.agent.id, "reviewer"] });
    assert.deepEqual(await h.call("listAgents"), []);
  } finally {
    await h.cleanup();
  }
});

test("sendPrompt appends the user message with clientNonce, triggers a turn, and the bot reply is visible in the tail", async () => {
  const h = await harness();
  try {
    await h.call("createAgent", { name: "Reviewer", herdrBot: { id: "reviewer" } });
    const events: unknown[] = [];
    h.host.events.on("transcript", (payload) => events.push(payload));
    const result = await h.call("sendPrompt", { agentId: "reviewer", prompt: "hello", clientNonce: "n-1", attachmentPaths: ["/tmp/a.txt"], attachmentNames: ["a.txt"] });
    assert.equal(result.accepted, true);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const tail = await h.call("openAgentTail", { id: "reviewer", limit: 50 });
    assert.equal(tail.entries[0].clientNonce, "n-1");
    assert.match(tail.entries[0].content, /\(attached: \/tmp\/a.txt\)/);
    assert.equal(tail.entries.at(-1).message.content, "hi from reviewer");
    assert.ok(events.some((e) => (e as { type: string }).type === "appended"));
    const window = await h.call("getAgentTranscriptWindow", { id: "reviewer", limit: 10 });
    assert.deepEqual(window.threadCounts, {});
    await h.call("reactToMessage", { agentId: "reviewer", entryId: tail.entries[0].id, emoji: "👍" });
    assert.deepEqual((await h.call("getAgentTranscriptTail", { id: "reviewer", limit: 1, beforeSeq: 2 })).entries[0].reactions, [{ emoji: "👍", by: "me" }]);
  } finally {
    await h.cleanup();
  }
});

test("stubs and unknown methods behave as the renderer expects", async () => {
  const h = await harness();
  try {
    assert.deepEqual(await h.call("getAsyncTasks", { id: "x" }), []);
    assert.equal(await h.call("getForeverBoxStatus", { id: "x" }), null);
    assert.equal(await h.call("isGlobalSearchEnabled"), false);
    assert.equal((await h.call("getSharingState")).isEnabled, false);
    const unknown = await h.dispatch("definitelyNotAMethod", {});
    assert.equal(unknown.status, "failed");
    assert.equal(unknown.status === "failed" && unknown.failure.code, "unknown-method");
    const invalid = await h.dispatch("sendPrompt", { agentId: 42 });
    assert.equal(invalid.status === "failed" && invalid.failure.code, "invalid-args");
  } finally {
    await h.cleanup();
  }
});
```

`core/test/host.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHost } from "../src/host.ts";
import { resolveConfig } from "../src/config.ts";
import { createHerdrCli } from "../src/herdr/cli.ts";
import { controlRequest } from "../src/control/client.ts";
import { ControlError } from "../src/control/protocol.ts";
import { installFakeHerdr } from "./helpers/fake-herdr-state.ts";
import { makeTempHome } from "./helpers/temp-home.ts";

test("host serves the control protocol end to end", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home, { agents: [], workspaces: [], onPrompt: { a: { say: ["A here"], sayOnce: true }, b: { say: ["B here"], sayOnce: true } } });
  const config = resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath, HERDR_BOT_USER_NAME: "ray", HERDR_BOT_DEFAULT_CWD: "/tmp/repo" });
  const host = createHost(config, { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null });
  await host.start();
  const sock = config.controlSocketPath;
  try {
    await controlRequest(sock, "bot.create", { id: "a", name: "A" });
    await controlRequest(sock, "bot.create", { id: "b", name: "B", kind: "codex", permissionMode: "auto" });
    const room = (await controlRequest(sock, "room.create", { name: "Auth", memberIds: ["a", "b"] })) as { id: string };
    const sent = (await controlRequest(sock, "send", { chatId: room.id, text: "hello team" })) as { entryId: string };
    assert.equal(sent.entryId, "e1");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const read = (await controlRequest(sock, "read", { chatId: room.id })) as { entries: { author: string; text: string }[] };
    assert.deepEqual(read.entries.map((e) => `${e.author}: ${e.text}`), ["ray: hello team", "A: A here", "B: B here"]);
    const who = (await controlRequest(sock, "whoami", { paneId: "w1:p1" })) as { bot: { id: string } };
    assert.equal(who.bot.id, "a");
    await assert.rejects(controlRequest(sock, "whoami", { paneId: "w9:p9" }), (e: unknown) => e instanceof ControlError && e.code === "unknown_pane");
    const rooms = (await controlRequest(sock, "rooms", {})) as { rooms: { id: string }[] };
    assert.equal(rooms.rooms[0]?.id, room.id);
    const status = (await controlRequest(sock, "status", {})) as { bots: number; rooms: number };
    assert.deepEqual([status.bots, status.rooms], [2, 1]);
    await assert.rejects(controlRequest(sock, "nope", {}), (e: unknown) => e instanceof ControlError && e.code === "unknown_method");
  } finally {
    await host.stop();
    temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test core/test/coordinator-port-server.test.ts core/test/coordinator-dispatcher.test.ts core/test/host.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: 구현 — frames + port-server**

`core/src/coordinator/frames.ts`:
```ts
export const COORDINATOR_PROTOCOL_VERSION = 1;
export const COORDINATOR_UNKNOWN_METHOD = "unknown-method";
export const COORDINATOR_CANCELLED = "cancelled";
export const COORDINATOR_INVALID_ARGS = "invalid-args";
export const COORDINATOR_TRANSPORT_STATE_FAMILY = "coordinator-transport-state";

export interface CoordinatorFailure {
  readonly code: string;
  readonly message: string;
  readonly transportKind?: string;
}

export type CoordinatorReplyOutcome =
  | { readonly status: "ok"; readonly value: unknown }
  | { readonly status: "failed"; readonly failure: CoordinatorFailure };

export type CoordinatorFrame =
  | { readonly kind: "lifecycle"; readonly phase: "hello" | "ready"; readonly protocolVersion: number }
  | { readonly kind: "lifecycle"; readonly phase: "shutdown"; readonly reason: "requested" | "protocol-error"; readonly detail: string | null }
  | { readonly kind: "request"; readonly requestId: string; readonly method: string; readonly args: unknown }
  | { readonly kind: "cancel"; readonly requestId: string }
  | { readonly kind: "reply"; readonly requestId: string; readonly outcome: CoordinatorReplyOutcome }
  | { readonly kind: "event"; readonly family: string; readonly payload: unknown };

export type CoordinatorFrameParseResult =
  | { readonly accepted: true; readonly frame: CoordinatorFrame }
  | { readonly accepted: false; readonly rejection: { readonly code: "malformed-frame"; readonly detail: string } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function reject(detail: string): CoordinatorFrameParseResult {
  return { accepted: false, rejection: { code: "malformed-frame", detail } };
}

function accept(frame: CoordinatorFrame): CoordinatorFrameParseResult {
  return { accepted: true, frame };
}

function parseOutcome(value: unknown): CoordinatorReplyOutcome | null {
  if (!isRecord(value)) return null;
  if (value.status === "ok") return "value" in value ? { status: "ok", value: value.value } : null;
  if (value.status !== "failed" || !isRecord(value.failure)) return null;
  const { code, message, transportKind } = value.failure;
  if (!nonEmptyString(code) || typeof message !== "string") return null;
  return { status: "failed", failure: { code, message, ...(nonEmptyString(transportKind) ? { transportKind } : {}) } };
}

function parseLifecycle(value: Record<string, unknown>): CoordinatorFrameParseResult {
  if (value.phase === "hello" || value.phase === "ready") {
    return typeof value.protocolVersion === "number"
      ? accept({ kind: "lifecycle", phase: value.phase, protocolVersion: value.protocolVersion })
      : reject(`lifecycle.${value.phase}.protocolVersion must be a number`);
  }
  if (value.phase === "shutdown") {
    if (value.reason !== "requested" && value.reason !== "protocol-error") return reject("lifecycle.shutdown.reason must be requested or protocol-error");
    if (value.reason === "protocol-error" && !nonEmptyString(value.detail)) return reject("lifecycle.shutdown.detail must name the breach");
    if (value.reason === "requested" && value.detail !== null) return reject("lifecycle.shutdown.detail must be null for a requested shutdown");
    return accept({ kind: "lifecycle", phase: "shutdown", reason: value.reason, detail: value.detail as string | null });
  }
  return reject("lifecycle.phase must be hello, ready, or shutdown");
}

export function parseCoordinatorFrame(value: unknown): CoordinatorFrameParseResult {
  if (!isRecord(value)) return reject("frame must be an object");
  switch (value.kind) {
    case "lifecycle":
      return parseLifecycle(value);
    case "request":
      if (!nonEmptyString(value.requestId)) return reject("request.requestId must be a non-empty string");
      if (!nonEmptyString(value.method)) return reject("request.method must be a non-empty string");
      if (!("args" in value)) return reject("request.args is missing");
      return accept({ kind: "request", requestId: value.requestId, method: value.method, args: value.args });
    case "cancel":
      return nonEmptyString(value.requestId) ? accept({ kind: "cancel", requestId: value.requestId }) : reject("cancel.requestId must be a non-empty string");
    case "reply": {
      if (!nonEmptyString(value.requestId)) return reject("reply.requestId must be a non-empty string");
      const outcome = parseOutcome(value.outcome);
      return outcome == null ? reject("reply.outcome is not a valid outcome") : accept({ kind: "reply", requestId: value.requestId, outcome });
    }
    case "event":
      if (!nonEmptyString(value.family)) return reject("event.family must be a non-empty string");
      if (!("payload" in value)) return reject("event.payload is missing");
      return accept({ kind: "event", family: value.family, payload: value.payload });
    default:
      return reject("frame.kind must be lifecycle, request, cancel, reply, or event");
  }
}
```

`core/src/coordinator/port-server.ts`:
```ts
import { COORDINATOR_CANCELLED, COORDINATOR_PROTOCOL_VERSION, COORDINATOR_UNKNOWN_METHOD, parseCoordinatorFrame, type CoordinatorFrame, type CoordinatorReplyOutcome } from "./frames.ts";

export interface RendererPort {
  post(frame: CoordinatorFrame): void;
  close(): void;
}

export type RendererPortSettlement =
  | { readonly outcome: "shutdown-requested" | "port-closed" }
  | { readonly outcome: "protocol-breach"; readonly detail: string };

export interface RendererPortServerOptions {
  readonly dispatchRequest?: (method: string, args: unknown, signal: AbortSignal) => Promise<CoordinatorReplyOutcome>;
  readonly onServing?: () => void;
}

export interface RendererPortServer {
  handleMessage(value: unknown): void;
  handlePortClosed(): void;
  postEvent(family: string, payload: unknown): void;
  readonly settled: Promise<RendererPortSettlement>;
}

/** Serves one renderer MessagePort: hello → ready, then requests/replies/events until shutdown. */
export function createRendererPortServer(port: RendererPort, options: RendererPortServerOptions = {}): RendererPortServer {
  let phase: "awaiting-hello" | "serving" | "settled" = "awaiting-hello";
  const inFlight = new Map<string, AbortController>();
  let resolveSettled: (settlement: RendererPortSettlement) => void = () => undefined;
  const settled = new Promise<RendererPortSettlement>((resolve) => {
    resolveSettled = resolve;
  });

  const settle = (settlement: RendererPortSettlement): void => {
    if (phase === "settled") return;
    phase = "settled";
    for (const controller of inFlight.values()) controller.abort();
    inFlight.clear();
    port.close();
    resolveSettled(settlement);
  };
  const breach = (detail: string): void => {
    if (phase === "settled") return;
    port.post({ kind: "lifecycle", phase: "shutdown", reason: "protocol-error", detail });
    settle({ outcome: "protocol-breach", detail });
  };
  const reply = (requestId: string, outcome: CoordinatorReplyOutcome): void => port.post({ kind: "reply", requestId, outcome });

  const dispatch = (requestId: string, method: string, args: unknown): void => {
    const dispatchRequest = options.dispatchRequest;
    if (dispatchRequest == null) {
      reply(requestId, { status: "failed", failure: { code: COORDINATOR_UNKNOWN_METHOD, message: "no method table serves this session yet" } });
      return;
    }
    const controller = new AbortController();
    inFlight.set(requestId, controller);
    void dispatchRequest(method, args, controller.signal).then(
      (outcome) => {
        if (phase !== "serving" || inFlight.get(requestId) !== controller) return;
        inFlight.delete(requestId);
        reply(requestId, outcome);
      },
      () => breach(`request ${requestId} dispatch rejected instead of settling`),
    );
  };

  const handleFrame = (frame: CoordinatorFrame): void => {
    if (frame.kind === "lifecycle" && frame.phase === "shutdown") return settle({ outcome: "shutdown-requested" });
    if (frame.kind === "reply" || frame.kind === "event") return breach(`client posted a server-direction ${frame.kind} frame`);
    if (frame.kind === "lifecycle" && frame.phase === "ready") return breach("client posted a server-direction ready frame");
    if (phase === "awaiting-hello") {
      if (frame.kind !== "lifecycle") return breach(`${frame.kind} frame before hello`);
      if (frame.protocolVersion !== COORDINATOR_PROTOCOL_VERSION) return breach(`hello.protocolVersion ${frame.protocolVersion} is not the supported ${COORDINATOR_PROTOCOL_VERSION}`);
      phase = "serving";
      port.post({ kind: "lifecycle", phase: "ready", protocolVersion: COORDINATOR_PROTOCOL_VERSION });
      options.onServing?.();
      return;
    }
    if (frame.kind === "lifecycle") return breach("hello repeated on a live session");
    if (frame.kind === "request") {
      if (inFlight.has(frame.requestId)) return breach(`request.requestId ${frame.requestId} reused while in flight`);
      return dispatch(frame.requestId, frame.method, frame.args);
    }
    const controller = inFlight.get(frame.requestId);
    if (controller == null) return;
    inFlight.delete(frame.requestId);
    controller.abort();
    reply(frame.requestId, { status: "failed", failure: { code: COORDINATOR_CANCELLED, message: "request cancelled" } });
  };

  return {
    handleMessage(value) {
      if (phase === "settled") return;
      const intake = parseCoordinatorFrame(value);
      if (!intake.accepted) return breach(intake.rejection.detail);
      handleFrame(intake.frame);
    },
    handlePortClosed() {
      settle({ outcome: "port-closed" });
    },
    postEvent(family, payload) {
      if (phase === "serving") port.post({ kind: "event", family, payload });
    },
    settled,
  };
}
```

- [ ] **Step 4: 구현 — host + control 핸들러**

`core/src/host.ts`:
```ts
import type { HostConfig } from "./config.ts";
import { SayInbox } from "./bots/say-inbox.ts";
import { startControlServer, type ControlServer } from "./control/server.ts";
import { createControlHandler } from "./control/handlers.ts";
import { createHerdrCli, type HerdrCli } from "./herdr/cli.ts";
import { StatusMirror } from "./herdr/status-mirror.ts";
import { HostEvents } from "./host-events.ts";
import { log } from "./log.ts";
import { ChatService } from "./services/chat-service.ts";
import { RosterService } from "./services/roster-service.ts";
import { RunQueue } from "./services/run-queue.ts";
import { TurnService } from "./services/turn-service.ts";
import { ProfileStore } from "./store/profile-store.ts";
import { RoomStore } from "./store/room-store.ts";
import type { StoredEntry } from "./store/transcript-store.ts";
import { ViewStateStore } from "./store/view-state-store.ts";

export interface SendUserMessageArgs {
  readonly content: string;
  readonly clientNonce?: string;
  readonly richText?: string;
  readonly replyTo?: string;
  readonly attachmentPaths?: readonly string[];
}

export interface HostStatus {
  readonly home: string;
  readonly bots: number;
  readonly rooms: number;
  readonly runningTurns: readonly string[];
}

export interface Host {
  readonly config: HostConfig;
  readonly events: HostEvents;
  readonly roster: RosterService;
  readonly chat: ChatService;
  readonly turns: TurnService;
  readonly mirror: StatusMirror;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendUserMessage(chatId: string, args: SendUserMessageArgs): StoredEntry;
  status(): HostStatus;
}

export interface HostOverrides {
  readonly cli?: HerdrCli;
  readonly socketPath?: string | null;
  readonly now?: () => number;
}

function withAttachments(content: string, paths: readonly string[] | undefined): string {
  if (paths == null || paths.length === 0) return content;
  return `${content}\n\n${paths.map((path) => `(attached: ${path})`).join("\n")}`;
}

export function createHost(config: HostConfig, overrides: HostOverrides = {}): Host {
  const cli = overrides.cli ?? createHerdrCli(config.herdrBin);
  const profiles = new ProfileStore(config.home);
  const rooms = new RoomStore(config.home);
  const view = new ViewStateStore(config.home);
  const events = new HostEvents();
  const runQueue = new RunQueue();
  const inbox = new SayInbox();
  let turns: TurnService | null = null;
  let chatRef: ChatService | null = null;

  const mirror = new StatusMirror({
    cli,
    socketPath: overrides.socketPath === undefined ? config.herdrSocketPath : overrides.socketPath,
    botIds: () => profiles.list().map((profile) => profile.id),
    onChange: (botId) => chatRef?.emitUpsert(botId),
  });
  const chat = new ChatService({ config, profiles, rooms, view, mirror, events, isTurnActive: (chatId) => turns?.isTurnActive(chatId) ?? false, ...(overrides.now == null ? {} : { now: overrides.now }) });
  chatRef = chat;
  const roster = new RosterService({ config, profiles, rooms, cli, mirror, ...(overrides.now == null ? {} : { now: overrides.now }), onNotice: (chatId, text) => chat.appendNotice(chatId, text) });
  turns = new TurnService({ config, roster, chat, runQueue, cli, mirror, inbox });
  const turnService: TurnService = turns;

  let controlServer: ControlServer | null = null;
  const host: Host = {
    config,
    events,
    roster,
    chat,
    turns: turnService,
    mirror,
    async start() {
      controlServer = await startControlServer(config.controlSocketPath, createControlHandler(host));
      mirror.start();
      log("host", `listening on ${config.controlSocketPath}`);
    },
    async stop() {
      mirror.stop();
      await controlServer?.close();
      controlServer = null;
    },
    sendUserMessage(chatId, args) {
      const entry = chat.appendUser(chatId, {
        content: withAttachments(args.content, args.attachmentPaths),
        ...(args.clientNonce == null ? {} : { clientNonce: args.clientNonce }),
        ...(args.richText == null ? {} : { richText: args.richText }),
        ...(args.replyTo == null ? {} : { replyTo: args.replyTo }),
      });
      void turnService.schedule(chatId);
      return entry;
    },
    status() {
      return { home: config.home, bots: profiles.list().length, rooms: rooms.list().length, runningTurns: [...profiles.list().map((p) => p.id), ...rooms.list().map((r) => r.id)].filter((id) => turnService.isTurnActive(id)) };
    },
  };
  return host;
}
```

`core/src/control/handlers.ts`:
```ts
import type { Host } from "../host.ts";
import { entryText, projectAuthor } from "../model/entries.ts";
import { RosterError } from "../services/roster-service.ts";
import type { PermissionMode } from "../store/profile-store.ts";
import type { ControlHandler } from "./server.ts";
import { ControlError, optionalString, optionalStringArray, requireString } from "./protocol.ts";

function permissionMode(value: unknown): PermissionMode | undefined {
  return value === "ask" || value === "auto" ? value : undefined;
}

function rethrow(error: unknown): never {
  if (error instanceof ControlError) throw error;
  if (error instanceof RosterError) throw new ControlError(error.code === "unknown_bot" ? "unknown_bot" : error.code === "unknown_room" ? "unknown_chat" : "invalid_params", `${error.code}: ${error.message}`);
  throw error;
}

export function createControlHandler(host: Host): ControlHandler {
  const summaryOf = (chatId: string) => {
    const summary = host.chat.summary(chatId);
    if (summary == null) throw new ControlError("unknown_chat", `no chat "${chatId}"`);
    return summary;
  };

  return async (method, params) => {
    try {
      switch (method) {
        case "say":
          return host.turns.handleSay(requireString(params, "paneId"), requireString(params, "chatId"), requireString(params, "text"));
        case "pass":
          host.turns.handlePass(requireString(params, "paneId"), requireString(params, "chatId"));
          return { ok: true };
        case "read": {
          const chatId = requireString(params, "chatId");
          summaryOf(chatId);
          const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 40;
          const entries = host.chat.tail(chatId, limit).entries.flatMap((entry) => {
            const text = entryText(entry);
            if (text == null) return [];
            const author = entry.kind === "notice" ? "system" : projectAuthor(entry.author)?.name ?? "?";
            return [{ id: entry.id, author, text, timestampMs: entry.timestampMs }];
          });
          return { entries };
        }
        case "rooms":
          return { rooms: host.chat.listSummaries().filter((s) => s.isGroup).map((s) => ({ id: s.id, name: s.name, memberIds: s.memberIds })) };
        case "whoami": {
          const bot = host.roster.resolveBotByPane(requireString(params, "paneId"));
          if (bot == null) throw new ControlError("unknown_pane", "this pane is not a herdr-bot bot");
          return { bot: { id: bot.id, name: bot.name } };
        }
        case "send": {
          const chatId = requireString(params, "chatId");
          summaryOf(chatId);
          return { entryId: host.sendUserMessage(chatId, { content: requireString(params, "text") }).id };
        }
        case "bot.create": {
          const profile = await host.roster.createBot({
            ...(optionalString(params, "id") == null ? {} : { id: optionalString(params, "id")! }),
            name: requireString(params, "name"),
            ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }),
            ...(optionalString(params, "kind") == null ? {} : { kind: optionalString(params, "kind")! }),
            ...(optionalString(params, "cwd") == null ? {} : { cwd: optionalString(params, "cwd")! }),
            ...(permissionMode(params.permissionMode) == null ? {} : { permissionMode: permissionMode(params.permissionMode)! }),
          });
          host.chat.emitRoster();
          return summaryOf(profile.id);
        }
        case "bot.adopt": {
          const profile = await host.roster.createBot({ id: requireString(params, "id"), name: optionalString(params, "name") ?? requireString(params, "id"), adoptPaneId: requireString(params, "paneId"), ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }) });
          host.chat.emitRoster();
          return summaryOf(profile.id);
        }
        case "bot.list":
          return { agents: host.chat.listSummaries() };
        case "bot.adoptable":
          return { agents: await host.roster.listAdoptable() };
        case "bot.delete": {
          const id = requireString(params, "id");
          await host.roster.deleteBot(id);
          host.chat.emitRoster();
          return { deletedIds: [id] };
        }
        case "room.create": {
          const room = host.roster.createRoom({ name: requireString(params, "name"), ...(optionalString(params, "description") == null ? {} : { description: optionalString(params, "description")! }), memberIds: optionalStringArray(params, "memberIds") ?? [] });
          host.chat.emitRoster();
          return summaryOf(room.id);
        }
        case "room.set-members": {
          const room = host.roster.setRoomMembers(requireString(params, "id"), optionalStringArray(params, "memberIds") ?? []);
          if (room == null) throw new ControlError("unknown_chat", "no such room");
          host.chat.emitUpsert(room.id);
          return summaryOf(room.id);
        }
        case "status":
          return host.status();
        default:
          throw new ControlError("unknown_method", `unknown control method "${method}"`);
      }
    } catch (error) {
      return rethrow(error);
    }
  };
}
```

- [ ] **Step 5: 구현 — coordinator 디스패처 + index**

`core/src/coordinator/dispatcher.ts`:
```ts
import type { Host } from "../host.ts";
import { RosterError } from "../services/roster-service.ts";
import type { PermissionMode } from "../store/profile-store.ts";
import { COORDINATOR_INVALID_ARGS, COORDINATOR_UNKNOWN_METHOD, type CoordinatorReplyOutcome } from "./frames.ts";

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ArgsError extends Error {}

function str(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) throw new ArgsError(`${key} must be a non-empty string`);
  return value;
}

function optStr(args: Args, key: string): string | undefined {
  return typeof args[key] === "string" && (args[key] as string).length > 0 ? (args[key] as string) : undefined;
}

function num(args: Args, key: string, fallback: number): number {
  return typeof args[key] === "number" && Number.isFinite(args[key]) ? (args[key] as number) : fallback;
}

function strArray(args: Args, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new ArgsError(`${key} must be an array of strings`);
  return value as string[];
}

const EMPTY_ARRAY_METHODS = new Set(["getAsyncTasks", "getAgentWorkflows", "getAgentAutomations", "listAllAutomations", "getTrays", "getSubagents", "getConversationOutline", "searchMedia"]);
const NULL_METHODS = new Set(["getForeverBoxStatus", "ensureForeverBox", "handBackForeverBox", "dismissTray", "clearTrays", "getCloudAgentInfo", "respondToWidget", "dismissWidget", "resolveLocalToolPermission", "resolveAutoReviewApproval", "submitSecret", "getListenerConnectUrl"]);
const FALSE_METHODS = new Set(["isAgentNetworkEnabled", "isGlobalSearchEnabled", "isEgressTunnelAvailable"]);
const OBJECT_STUBS: Readonly<Record<string, unknown>> = {
  getSharingState: { isEnabled: false, selfAuthId: null, pendingJoinRequests: [], rooms: [], typingUsers: [] },
  getListenerIntegrations: {},
  getAgentChannels: { channels: [] },
  connectChannel: { channels: [] },
  disconnectChannel: { channels: [] },
  refreshChannel: { channels: [] },
  getTeachRecordingStatus: { status: "idle" },
  getPluginSyncStatus: {},
  getSkillPublishTargets: {},
};

function ok(value: unknown): CoordinatorReplyOutcome {
  return { status: "ok", value };
}

function failed(code: string, message: string): CoordinatorReplyOutcome {
  return { status: "failed", failure: { code, message } };
}

export function createCoordinatorDispatcher(host: Host): (method: string, args: unknown) => Promise<CoordinatorReplyOutcome> {
  const summaryOrNull = (id: string) => host.chat.summary(id);
  const requireSummary = (id: string) => {
    const summary = host.chat.summary(id);
    if (summary == null) throw new ArgsError(`no chat "${id}"`);
    return summary;
  };

  const handle = async (method: string, raw: unknown): Promise<unknown> => {
    const args: Args = isRecord(raw) ? raw : {};
    if (EMPTY_ARRAY_METHODS.has(method)) return [];
    if (NULL_METHODS.has(method)) return null;
    if (FALSE_METHODS.has(method)) return false;
    if (method in OBJECT_STUBS) return OBJECT_STUBS[method];
    switch (method) {
      case "listAgents": return host.chat.listSummaries();
      case "countAgents": return host.chat.listSummaries().length;
      case "searchAgents": {
        const query = (optStr(args, "query") ?? "").toLowerCase();
        return host.chat.listSummaries().filter((s) => s.name.toLowerCase().includes(query) || s.description.toLowerCase().includes(query));
      }
      case "createAgent": {
        const bot = isRecord(args.herdrBot) ? args.herdrBot : {};
        const mode = bot.permissionMode === "ask" || bot.permissionMode === "auto" ? (bot.permissionMode as PermissionMode) : undefined;
        const profile = await host.roster.createBot({
          name: str(args, "name"),
          ...(optStr(bot, "id") == null ? {} : { id: optStr(bot, "id")! }),
          ...(optStr(args, "description") == null ? {} : { description: optStr(args, "description")! }),
          ...(optStr(bot, "kind") == null ? {} : { kind: optStr(bot, "kind")! }),
          ...(optStr(bot, "cwd") == null ? {} : { cwd: optStr(bot, "cwd")! }),
          ...(mode == null ? {} : { permissionMode: mode }),
          ...(optStr(bot, "adoptPaneId") == null ? {} : { adoptPaneId: optStr(bot, "adoptPaneId")! }),
          avatarShape: optStr(args, "avatarShape") ?? null,
          avatarColor: optStr(args, "avatarColor") ?? null,
        });
        host.chat.emitRoster();
        return { agent: requireSummary(profile.id), transcript: [] };
      }
      case "createGroup": {
        const room = host.roster.createRoom({ name: str(args, "name"), ...(optStr(args, "description") == null ? {} : { description: optStr(args, "description")! }), memberIds: strArray(args, "memberIds") });
        host.chat.emitRoster();
        return { agent: requireSummary(room.id), transcript: [] };
      }
      case "setGroupMembers": {
        const room = host.roster.setRoomMembers(str(args, "id"), strArray(args, "memberAgentIds"));
        if (room != null) host.chat.emitUpsert(room.id);
        return room == null ? null : summaryOrNull(room.id);
      }
      case "updateAgent": {
        const id = str(args, "id");
        const profile = isRecord(args.profile) ? args.profile : {};
        const patch = { ...(optStr(profile, "name") == null ? {} : { name: optStr(profile, "name")! }), ...(typeof profile.description === "string" ? { description: profile.description } : {}) };
        const updated = host.chat.chatKind(id) === "room" ? host.roster.updateRoom(id, patch) : host.roster.updateProfile(id, patch);
        if (updated != null) host.chat.emitUpsert(id);
        return updated == null ? null : summaryOrNull(id);
      }
      case "deleteAgents": {
        const ids = strArray(args, "ids");
        for (const id of ids) {
          if (host.chat.chatKind(id) === "room") host.roster.deleteRoom(id);
          else if (host.chat.chatKind(id) === "bot") await host.roster.deleteBot(id);
        }
        host.chat.emitRoster();
        return { deletedIds: ids };
      }
      case "duplicateAgent":
        throw new ArgsError("duplicating bots is not supported");
      case "openAgentTail": {
        const id = str(args, "id");
        requireSummary(id);
        host.chat.markViewed(id);
        return host.chat.tail(id, num(args, "limit", 200));
      }
      case "getAgentTranscriptTail": {
        const id = str(args, "id");
        requireSummary(id);
        return host.chat.tail(id, num(args, "limit", 200), typeof args.beforeSeq === "number" ? args.beforeSeq : undefined);
      }
      case "getAgentTranscriptWindow": {
        const id = str(args, "id");
        requireSummary(id);
        return { ...host.chat.tail(id, num(args, "limit", 200), typeof args.beforeSeq === "number" ? args.beforeSeq : undefined), threadCounts: {} };
      }
      case "getAgentThread":
        return { entries: host.chat.thread(str(args, "id"), str(args, "rootId")) };
      case "sendPrompt": {
        const agentId = str(args, "agentId");
        requireSummary(agentId);
        const entry = host.sendUserMessage(agentId, {
          content: typeof args.prompt === "string" ? args.prompt : "",
          ...(optStr(args, "clientNonce") == null ? {} : { clientNonce: optStr(args, "clientNonce")! }),
          ...(optStr(args, "richText") == null ? {} : { richText: optStr(args, "richText")! }),
          ...(optStr(args, "replyToId") == null ? {} : { replyTo: optStr(args, "replyToId")! }),
          ...(Array.isArray(args.attachmentPaths) ? { attachmentPaths: args.attachmentPaths.filter((p): p is string => typeof p === "string") } : {}),
        });
        return { accepted: true, entryId: entry.id };
      }
      case "reactToMessage":
        host.chat.react(str(args, "agentId"), str(args, "entryId"), str(args, "emoji"));
        return null;
      case "setAgentUnread":
        host.chat.setUnread(str(args, "id"), args.isUnread === true);
        return null;
      case "setAgentHiddenFromSidebar": {
        const id = str(args, "id");
        const hidden = args.isHidden === true;
        if (host.chat.chatKind(id) === "room") host.roster.updateRoom(id, { isHiddenFromSidebar: hidden });
        else host.roster.updateProfile(id, { isHiddenFromSidebar: hidden });
        host.chat.emitUpsert(id);
        return null;
      }
      case "setAgentNotifyOnUpdates": {
        const id = str(args, "id");
        host.roster.updateProfile(id, { notifyOnUpdatesEnabled: args.isEnabled === true });
        host.chat.emitUpsert(id);
        return summaryOrNull(id);
      }
      case "herdrBot.listAdoptable":
        return host.roster.listAdoptable();
      case "herdrBot.focus": {
        const id = str(args, "id");
        await host.roster.focus(host.mirror.get(id).paneId ?? id);
        return null;
      }
      default:
        throw new UnknownMethod(method);
    }
  };

  return async (method, args) => {
    try {
      return ok(await handle(method, args));
    } catch (error) {
      if (error instanceof UnknownMethod) return failed(COORDINATOR_UNKNOWN_METHOD, `no coordinator method "${method}"`);
      if (error instanceof ArgsError) return failed(COORDINATOR_INVALID_ARGS, error.message);
      if (error instanceof RosterError) return failed(error.code, error.message);
      return failed("internal", error instanceof Error ? error.message : String(error));
    }
  };
}

class UnknownMethod extends Error {}
```

`core/src/index.ts`:
```ts
export { resolveConfig, hostPaths, type HostConfig } from "./config.ts";
export { createHost, type Host, type HostStatus, type SendUserMessageArgs } from "./host.ts";
export { HostEvents, type HostEventFamily } from "./host-events.ts";
export { createHerdrCli, type HerdrCli } from "./herdr/cli.ts";
export { HerdrError, type HerdrAgentInfo, type BotRuntime } from "./herdr/types.ts";
export { createCoordinatorDispatcher } from "./coordinator/dispatcher.ts";
export { createRendererPortServer, type RendererPort, type RendererPortServer } from "./coordinator/port-server.ts";
export { COORDINATOR_PROTOCOL_VERSION, type CoordinatorFrame, type CoordinatorReplyOutcome } from "./coordinator/frames.ts";
export { controlRequest } from "./control/client.ts";
export { ControlError } from "./control/protocol.ts";
export type { AgentSummary } from "./model/summaries.ts";
export type { BotProfile, PermissionMode } from "./store/profile-store.ts";
export type { RoomConfig } from "./store/room-store.ts";
export type { StoredEntry, TranscriptPage } from "./store/transcript-store.ts";
export { SUPPORTED_KINDS } from "./bots/launch-args.ts";
```

- [ ] **Step 6: 통과 확인**

```bash
npm test && npm run typecheck
```
Expected: 전체 pass, fail 0. `host.test.ts`에서 `read`가 `["ray: hello team", "A: A here", "B: B here"]`를 돌려주면 사용자 메시지 → 오케스트레이션 → 가짜 봇 `say` → 트랜스크립트가 control 소켓만으로 end-to-end 검증된 것이다.

- [ ] **Step 7: 커밋**

```bash
git add core/src core/test
git commit -m "feat(core): compose the host with control handlers and the coordinator dispatcher"
```

---

### Task 16: `herdr-bot` CLI (say/pass/read/…/serve/install-shim)

**Files:**
- Create: `cli/package.json`, `cli/tsconfig.json`
- Modify: `package.json` (루트 workspaces/scripts에 `cli` 추가)
- Create: `cli/src/args.ts`, `cli/src/shim.ts`, `cli/src/main.ts`
- Test: `cli/test/args.test.ts`, `cli/test/shim.test.ts`

**Interfaces:**
- Consumes: `controlRequest`, `ControlError`, `resolveConfig`, `createHost`(core)
- Produces:
  - `args.ts`: `parseCliArgs(argv: string[]): CliCommand | { error: string }` —
    ```
    herdr-bot say <chatId> <text...>          → { kind: "control", method: "say", params: { chatId, text, paneId: $HERDR_PANE_ID } }
    herdr-bot pass <chatId>                   → control pass
    herdr-bot read <chatId> [--limit N]       → control read (출력: "HH:MM author: text" 줄)
    herdr-bot rooms | whoami | status
    herdr-bot send <chatId> <text...>         → control send
    herdr-bot bot create <id> --name <n> [--kind k] [--cwd c] [--permission ask|auto] [--description d]
    herdr-bot bot adopt <paneId> <id> [--name n]
    herdr-bot bot list | bot adoptable | bot delete <id>
    herdr-bot room create <name> --members a,b [--description d]
    herdr-bot room members <roomId> a,b
    herdr-bot serve                           → { kind: "serve" }
    herdr-bot install-shim                    → { kind: "install-shim" }
    ```
  - `shim.ts`: `shimScript(nodePath, mainPath): string`, `installShim(home, nodePath, mainPath): string`(생성 경로 반환; `0o755`)
  - `main.ts`: 진입점. 성공 시 JSON 또는 사람 친화 텍스트 출력; `ControlError`는 `herdr-bot: <code>: <message>` 한 줄 stderr + exit 1.

- [ ] **Step 1: cli 워크스페이스 패키지 파일 + 루트 스크립트 확장**

`cli/package.json`:
```json
{
  "name": "herdr-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "herdr-bot": "./src/main.ts" },
  "scripts": {
    "test": "node --test \"test/**/*.test.ts\"",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```

`cli/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test", "../core/src"]
}
```

루트 `package.json`의 두 줄을 바꾼다 (Task 1에서는 core만 포함했다):
```json
  "workspaces": ["core", "cli"],
  "scripts": {
    "test": "node --test \"core/test/**/*.test.ts\" \"cli/test/**/*.test.ts\"",
    "typecheck": "tsc -p core/tsconfig.json && tsc -p cli/tsconfig.json",
    "check": "npm run typecheck && npm test"
  },
```

```bash
npm install
```

- [ ] **Step 2: 실패하는 테스트**

`cli/test/args.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "../src/args.ts";

const env = { HERDR_PANE_ID: "w1:p2" };

test("say joins the remaining words and carries the pane id", () => {
  assert.deepEqual(parseCliArgs(["say", "room-1", "hello", "there"], env), { kind: "control", method: "say", params: { chatId: "room-1", text: "hello there", paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["pass", "room-1"], env), { kind: "control", method: "pass", params: { chatId: "room-1", paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["say", "room-1"], env), { error: "say needs <chatId> and <text>" });
});

test("read/rooms/whoami/status/send map to control methods", () => {
  assert.deepEqual(parseCliArgs(["read", "room-1", "--limit", "5"], env), { kind: "control", method: "read", params: { chatId: "room-1", limit: 5 }, output: "transcript" });
  assert.deepEqual(parseCliArgs(["rooms"], env), { kind: "control", method: "rooms", params: {}, output: "json" });
  assert.deepEqual(parseCliArgs(["whoami"], env), { kind: "control", method: "whoami", params: { paneId: "w1:p2" }, output: "json" });
  assert.deepEqual(parseCliArgs(["send", "room-1", "go", "team"], env), { kind: "control", method: "send", params: { chatId: "room-1", text: "go team" }, output: "json" });
  assert.deepEqual(parseCliArgs(["status"], env), { kind: "control", method: "status", params: {}, output: "json" });
});

test("bot and room admin commands", () => {
  assert.deepEqual(parseCliArgs(["bot", "create", "reviewer", "--name", "Code Reviewer", "--kind", "claude", "--cwd", "/repo", "--permission", "auto"], env),
    { kind: "control", method: "bot.create", params: { id: "reviewer", name: "Code Reviewer", kind: "claude", cwd: "/repo", permissionMode: "auto" }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "adopt", "w7:p3", "scout"], env), { kind: "control", method: "bot.adopt", params: { paneId: "w7:p3", id: "scout", name: "scout" }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "list"], env), { kind: "control", method: "bot.list", params: {}, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "adoptable"], env), { kind: "control", method: "bot.adoptable", params: {}, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "delete", "x"], env), { kind: "control", method: "bot.delete", params: { id: "x" }, output: "json" });
  assert.deepEqual(parseCliArgs(["room", "create", "Auth", "--members", "a,b"], env), { kind: "control", method: "room.create", params: { name: "Auth", memberIds: ["a", "b"] }, output: "json" });
  assert.deepEqual(parseCliArgs(["room", "members", "room-1", "a"], env), { kind: "control", method: "room.set-members", params: { id: "room-1", memberIds: ["a"] }, output: "json" });
  assert.deepEqual(parseCliArgs(["bot", "create", "--name", "x"], env), { error: "bot create needs <id>" });
});

test("serve and install-shim are local commands; unknown commands error", () => {
  assert.deepEqual(parseCliArgs(["serve"], env), { kind: "serve" });
  assert.deepEqual(parseCliArgs(["install-shim"], env), { kind: "install-shim" });
  assert.deepEqual(parseCliArgs([], env), { error: "usage: herdr-bot <say|pass|read|rooms|whoami|send|bot|room|status|serve|install-shim> ..." });
  assert.deepEqual(parseCliArgs(["dance"], env), { error: 'unknown command "dance"' });
});
```

`cli/test/shim.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { installShim, shimScript } from "../src/shim.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("shim execs node on the CLI entry with all arguments", () => {
  assert.equal(shimScript("/usr/local/bin/node", "/repo/cli/src/main.ts"), '#!/bin/sh\nexec "/usr/local/bin/node" "/repo/cli/src/main.ts" "$@"\n');
});

test("installShim writes an executable at <home>/bin/herdr-bot", () => {
  const temp = makeTempHome();
  try {
    const path = installShim(temp.home, "/usr/local/bin/node", "/repo/cli/src/main.ts");
    assert.equal(path, join(temp.home, "bin", "herdr-bot"));
    assert.match(readFileSync(path, "utf8"), /exec "\/usr\/local\/bin\/node"/);
    assert.equal(statSync(path).mode & 0o111, 0o111);
  } finally {
    temp.cleanup();
  }
});
```

- [ ] **Step 3: 실패 확인**

```bash
node --test cli/test/args.test.ts cli/test/shim.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: 구현**

`cli/src/args.ts`:
```ts
export type CliOutput = "json" | "transcript";

export type CliCommand =
  | { readonly kind: "control"; readonly method: string; readonly params: Record<string, unknown>; readonly output: CliOutput }
  | { readonly kind: "serve" }
  | { readonly kind: "install-shim" };

export type CliParse = CliCommand | { readonly error: string };

const USAGE = "usage: herdr-bot <say|pass|read|rooms|whoami|send|bot|room|status|serve|install-shim> ...";

function flags(argv: readonly string[]): { positional: string[]; options: Record<string, string> } {
  const positional: string[] = [];
  const options: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith("--")) {
      options[token.slice(2)] = argv[index + 1] ?? "";
      index += 1;
    } else {
      positional.push(token);
    }
  }
  return { positional, options };
}

function control(method: string, params: Record<string, unknown>, output: CliOutput = "json"): CliCommand {
  return { kind: "control", method, params, output };
}

function withOptional(params: Record<string, unknown>, options: Record<string, string>, mapping: Record<string, string>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [flag, key] of Object.entries(mapping)) if (options[flag] != null && options[flag].length > 0) extra[key] = options[flag];
  return { ...params, ...extra };
}

function parseBot(argv: readonly string[]): CliParse {
  const [sub, ...rest] = argv;
  const { positional, options } = flags(rest);
  switch (sub) {
    case "create": {
      const id = positional[0];
      if (id == null) return { error: "bot create needs <id>" };
      return control("bot.create", withOptional({ id, name: options.name ?? id }, options, { kind: "kind", cwd: "cwd", permission: "permissionMode", description: "description" }));
    }
    case "adopt": {
      const [paneId, id] = positional;
      if (paneId == null || id == null) return { error: "bot adopt needs <paneId> and <id>" };
      return control("bot.adopt", withOptional({ paneId, id, name: options.name ?? id }, options, { description: "description" }));
    }
    case "list": return control("bot.list", {});
    case "adoptable": return control("bot.adoptable", {});
    case "delete": return positional[0] == null ? { error: "bot delete needs <id>" } : control("bot.delete", { id: positional[0] });
    default: return { error: "usage: herdr-bot bot <create|adopt|list|adoptable|delete>" };
  }
}

function parseRoom(argv: readonly string[]): CliParse {
  const [sub, ...rest] = argv;
  const { positional, options } = flags(rest);
  if (sub === "create") {
    const name = positional[0];
    if (name == null) return { error: "room create needs <name>" };
    const memberIds = (options.members ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    return control("room.create", withOptional({ name, memberIds }, options, { description: "description" }));
  }
  if (sub === "members") {
    const [id, list] = positional;
    if (id == null || list == null) return { error: "room members needs <roomId> and <a,b,...>" };
    return control("room.set-members", { id, memberIds: list.split(",").map((s) => s.trim()).filter((s) => s.length > 0) });
  }
  return { error: "usage: herdr-bot room <create|members>" };
}

export function parseCliArgs(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): CliParse {
  const [command, ...rest] = argv;
  const paneId = env.HERDR_PANE_ID ?? "";
  switch (command) {
    case undefined: return { error: USAGE };
    case "say": {
      const [chatId, ...words] = rest;
      if (chatId == null || words.length === 0) return { error: "say needs <chatId> and <text>" };
      return control("say", { chatId, text: words.join(" "), paneId });
    }
    case "pass": return rest[0] == null ? { error: "pass needs <chatId>" } : control("pass", { chatId: rest[0], paneId });
    case "read": {
      const { positional, options } = flags(rest);
      if (positional[0] == null) return { error: "read needs <chatId>" };
      const limit = options.limit == null ? undefined : Number.parseInt(options.limit, 10);
      return control("read", { chatId: positional[0], ...(limit == null || Number.isNaN(limit) ? {} : { limit }) }, "transcript");
    }
    case "rooms": return control("rooms", {});
    case "whoami": return control("whoami", { paneId });
    case "status": return control("status", {});
    case "send": {
      const [chatId, ...words] = rest;
      if (chatId == null || words.length === 0) return { error: "send needs <chatId> and <text>" };
      return control("send", { chatId, text: words.join(" ") });
    }
    case "bot": return parseBot(rest);
    case "room": return parseRoom(rest);
    case "serve": return { kind: "serve" };
    case "install-shim": return { kind: "install-shim" };
    default: return { error: `unknown command "${command}"` };
  }
}
```

`cli/src/shim.ts`:
```ts
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function shimScript(nodePath: string, mainPath: string): string {
  return `#!/bin/sh\nexec "${nodePath}" "${mainPath}" "$@"\n`;
}

export function installShim(home: string, nodePath: string, mainPath: string): string {
  const dir = join(home, "bin");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "herdr-bot");
  writeFileSync(path, shimScript(nodePath, mainPath), "utf8");
  chmodSync(path, 0o755);
  return path;
}
```

`cli/src/main.ts`:
```ts
#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../../core/src/config.ts";
import { controlRequest } from "../../core/src/control/client.ts";
import { ControlError } from "../../core/src/control/protocol.ts";
import { createHost } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import { parseCliArgs, type CliCommand } from "./args.ts";
import { installShim } from "./shim.ts";

function printTranscript(result: unknown): void {
  const entries = (result as { entries?: { author: string; text: string; timestampMs: number }[] }).entries ?? [];
  for (const entry of entries) {
    const time = new Date(entry.timestampMs).toISOString().slice(11, 16);
    process.stdout.write(`[${time}] ${entry.author}: ${entry.text}\n`);
  }
}

/** Spawning or adopting a bot waits on `herdr agent start` (30 s) plus the identity brief (60 s). */
const LONG_RUNNING_METHODS = new Set(["bot.create", "bot.adopt"]);
const DEFAULT_TIMEOUT_MS = 10_000;
const LONG_RUNNING_TIMEOUT_MS = 120_000;

async function runControl(command: Extract<CliCommand, { kind: "control" }>): Promise<void> {
  const config = resolveConfig();
  const timeoutMs = LONG_RUNNING_METHODS.has(command.method) ? LONG_RUNNING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const result = await controlRequest(config.controlSocketPath, command.method, command.params, timeoutMs);
  if (command.output === "transcript") printTranscript(result);
  else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function serve(): Promise<void> {
  const config = resolveConfig();
  const host = createHost(config);
  await host.start();
  installShim(config.home, process.execPath, fileURLToPath(import.meta.url));
  log("cli", `herdr-bot host is serving (home ${config.home}). Press Ctrl+C to stop.`);
  await new Promise<void>((resolve) => {
    const stop = (): void => { void host.stop().then(resolve); };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  if ("error" in parsed) {
    process.stderr.write(`herdr-bot: ${parsed.error}\n`);
    process.exit(2);
  }
  if (parsed.kind === "serve") return serve();
  if (parsed.kind === "install-shim") {
    const path = installShim(resolveConfig().home, process.execPath, fileURLToPath(import.meta.url));
    process.stdout.write(`${path}\n`);
    return;
  }
  await runControl(parsed);
}

main().catch((error: unknown) => {
  if (error instanceof ControlError) {
    process.stderr.write(`herdr-bot: ${error.code}: ${error.message}\n`);
    if (error.code === "connect_failed") process.stderr.write("herdr-bot: is the host running? start it with `herdr-bot serve` or open the herdr-bot app.\n");
  } else {
    process.stderr.write(`herdr-bot: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(1);
});
```

- [ ] **Step 5: 통과 확인**

```bash
npm test && npm run typecheck
chmod +x cli/src/main.ts
node cli/src/main.ts            # → "herdr-bot: usage: ..." exit 2
node cli/src/main.ts rooms      # 호스트 없으면 → "herdr-bot: connect_failed: ..." + 힌트, exit 1
```

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json cli
git commit -m "feat(cli): add herdr-bot command line for bots, admins, serve, and shim install"
```

---

### Task 17: 실제 herdr에서 라이브 E2E + README

**Files:**
- Create: `README.md`
- 검증 대상: 실제 herdr 0.9.0 (`HERDR_ENV=1`인 pane에서 실행), claude CLI 로그인 상태

이 태스크는 자동 테스트가 아니라 **수동 체크리스트**다. 각 단계의 기대 출력을 그대로 확인하고, 다르면 그 시점에서 멈춰 보고한다. 실제 `~/.herdr-bot`을 쓰지 않고 `HERDR_BOT_HOME`을 임시 경로로 둔다.

- [ ] **Step 1: 호스트 띄우기 (별도 pane)**

```bash
cd /Users/goorm/Desktop/ray/workspace/herdr-bot
export HERDR_BOT_HOME=/tmp/hb-live
HOST_PANE=$(herdr pane split --current --direction down --cwd "$PWD" --no-focus | python3 -c 'import sys,json; print(json.load(sys.stdin)["result"]["pane"]["pane_id"])')
herdr pane run "$HOST_PANE" "HERDR_BOT_HOME=/tmp/hb-live node cli/src/main.ts serve"
herdr pane wait-output "$HOST_PANE" --match "is serving" --timeout 15000
ls -la /tmp/hb-live/bin/herdr-bot /tmp/hb-live/host.sock
```
Expected: 두 파일이 존재. shim이 실행 가능(`-rwxr-xr-x`).

- [ ] **Step 2: 봇 스폰 (claude, ask 모드)**

```bash
node cli/src/main.ts bot create reviewer --name "Reviewer" --kind claude --cwd "$PWD" --permission ask
herdr agent list | python3 -c 'import sys,json; print([ (a.get("name"), a["agent_status"], a["pane_id"]) for a in json.load(sys.stdin)["result"]["agents"] if a.get("name")=="reviewer"])'
```
Expected: JSON에 `"id": "reviewer"`, `"herdrBot": {"kind": "claude", ...}`. 두 번째 명령이 `[('reviewer', 'idle', 'w?:p?')]`. herdr 사이드바에 `herdr-bot: herdr-bot` 워크스페이스가 새로 보이고 그 안에 claude가 떠 있음. claude 화면에 identity brief가 전달되어 "ok" 류 응답이 보임.
- `agent_not_ready`(trust folder / bypass 확인)가 나면 그 pane에서 사람이 수락 → `herdr agent list`에서 idle 확인 후 진행.

- [ ] **Step 3: 두 번째 봇 + 방 만들기**

```bash
node cli/src/main.ts bot create writer --name "Writer" --kind claude --cwd "$PWD" --permission ask
ROOM=$(node cli/src/main.ts room create "자기소개" --members reviewer,writer | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
echo "$ROOM"
```
Expected: 같은 워크스페이스에 `writer` 탭이 추가됨(`tab create` 경로). `$ROOM`이 `room-chat-xxxx` 형태.

- [ ] **Step 4: 방에 말하고 결과 읽기**

```bash
node cli/src/main.ts send "$ROOM" "둘 다 한 줄로 자기소개 해줘. @writer 는 마지막에 이모지 하나 붙여줘."
sleep 60
node cli/src/main.ts read "$ROOM"
```
Expected (순서·문구는 다를 수 있음):
```
[HH:MM] goorm: 둘 다 한 줄로 자기소개 해줘. ...
[HH:MM] Reviewer: 안녕하세요, 저는 ...
[HH:MM] Writer: ... ✨
```
- Reviewer 턴 동안 `herdr agent get reviewer`가 `working`; herdr pane에서 claude가 `Bash(/tmp/hb-live/bin/herdr-bot say ...)`를 실행하는 것이 보임(ask 모드라도 `--allowedTools` 덕에 승인 없이 실행).
- 봇이 `say`를 안 하고 터미널에만 답했다면(프롬프트 미준수) `read`에 봇 줄이 없다 → 봇 pane 화면을 읽어 원인 기록. 이 경우 Task 10 프롬프트 문구를 강화하는 후속 커밋 대상.

- [ ] **Step 5: 멘션·busy·blocked 시나리오**

```bash
node cli/src/main.ts send "$ROOM" "@reviewer 만 답해: 이 레포의 package.json에 workspaces가 몇 개야?"
sleep 40; node cli/src/main.ts read "$ROOM" --limit 3
```
Expected: Writer는 답하지 않고 Reviewer만 답함(`2개` 등). 그 다음, reviewer pane에서 사람이 직접 `claude`에 긴 작업을 시켜 `working`으로 만든 뒤 방에 다시 말하면 `read`에 `system: Reviewer is busy ...` notice가 남는다.

- [ ] **Step 6: 채택(adopt) 시나리오**

이미 떠 있는 다른 에이전트(예: 다른 워크스페이스의 grok)를 채택:
```bash
node cli/src/main.ts bot adoptable | python3 -c 'import sys,json; print([(a["agent"], a["pane_id"], a["cwd"]) for a in json.load(sys.stdin)["agents"]])'
node cli/src/main.ts bot adopt <pane_id> scout --name "Scout"
node cli/src/main.ts room members "$ROOM" reviewer,writer,scout
node cli/src/main.ts send "$ROOM" "@scout 너는 어느 디렉터리에서 일하고 있어?"
sleep 40; node cli/src/main.ts read "$ROOM" --limit 2
```
Expected: `herdr agent list`에서 그 pane의 `name`이 `scout`로 바뀜. Scout이 자기 cwd를 답함. `bot delete scout` 후 이름이 해제되고 pane은 그대로 살아 있음.

- [ ] **Step 7: 정리**

```bash
node cli/src/main.ts bot delete writer
node cli/src/main.ts bot delete reviewer
herdr pane send-keys "$HOST_PANE" ctrl+c
```
Expected: 두 봇 pane이 닫힘(스폰된 봇). 워크스페이스는 남아 있어도 됨(사용자가 닫는다).

- [ ] **Step 8: README 작성**

`README.md`:
```markdown
# herdr-bot

herdr 위에서 돌아가는 코딩 에이전트(claude / codex / grok …)들을 **봇**으로 묶어, 단체방에서 사용자와 봇들이 대화하며 일을 끝내는 앱. UI는 grok-bot 0.18의 리액트 렌더러를 기반으로 하고(별도 플랜), 이 저장소의 `core/`는 헤드리스 호스트, `cli/`는 봇과 사람이 쓰는 `herdr-bot` 명령이다.

## 요구사항

- herdr ≥ 0.9.0 (실행 중), Node ≥ 24
- 봇으로 쓸 에이전트 CLI가 로그인된 상태 (claude, codex, grok …)

## 빠른 시작 (헤드리스)

```bash
npm install
node cli/src/main.ts serve                 # 호스트 (herdr pane 안에서 실행)
node cli/src/main.ts bot create reviewer --name Reviewer --kind claude --cwd ~/repo
node cli/src/main.ts room create "auth 리팩터링" --members reviewer
node cli/src/main.ts send <room-id> "로그인 버그 원인부터 정리해줘"
node cli/src/main.ts read <room-id>
```

## 동작 원리

- 봇 = herdr가 pane 안에서 감지하는 이름 붙은 에이전트. 스폰(`herdr agent start`)하거나 이미 떠 있는 에이전트를 채택(`herdr agent rename`).
- 방에 사용자가 말하면 호스트가 grok-bot식 라운드로빈(최대 3라운드·10발언, @멘션이면 그 봇만)을 돌린다. 각 턴은 `herdr agent prompt <bot> … --wait`.
- 봇이 방에 말하는 유일한 방법은 `~/.herdr-bot/bin/herdr-bot say <room> "…"`. 터미널 출력은 방에 보이지 않는다.
- 상태 저장: `~/.herdr-bot/` (`HERDR_BOT_HOME`으로 변경). 트랜스크립트는 JSONL.

## 환경변수

| 변수 | 기본 | 의미 |
|---|---|---|
| `HERDR_BOT_HOME` | `~/.herdr-bot` | 상태 루트 |
| `HERDR_BIN_PATH` | `herdr` | herdr 바이너리 |
| `HERDR_SOCKET_PATH` | `~/.config/herdr/herdr.sock` | herdr 이벤트 구독용 |
| `HERDR_BOT_USER_NAME` | OS 사용자명 | 방에서 보이는 사용자 이름 |
| `HERDR_BOT_TURN_TIMEOUT_MS` | `180000` | 봇 한 턴 최대 대기 |
| `HERDR_BOT_DEFAULT_KIND` / `HERDR_BOT_DEFAULT_CWD` | `claude` / `$HOME` | 봇 생성 기본값 |

## 개발

```bash
npm run check      # typecheck + node --test
```
```

- [ ] **Step 9: 커밋**

```bash
git add README.md
git commit -m "docs: describe herdr-bot core, headless quick start, and live verification"
```

라이브 검증 중 발견한 어긋남(프롬프트 문구, herdr 에러 코드 이름, codex 샌드박스에서 소켓 연결 가능 여부 등)은 각각 별도 `fix:` 커밋으로 남기고, 이 플랜 파일의 해당 태스크 아래에 한 줄 메모를 추가한다.

---

## 자체 점검 결과 (Self-Review)

- **스펙 커버리지:** 봇 = herdr 에이전트(스폰/채택, claude·codex·grok) → Task 8/10/13. grok-bot식 평평한 단체방(라운드로빈·@멘션·pass·상한) → Task 6/7/14. 봇이 백그라운드에서 일하고 채팅에는 `say`로만 말함 → Task 10/12/14/16. UI가 소비할 coordinator 계약 → Task 15. 실제 herdr 검증 → Task 17.
- **알려진 미결(데스크톱 플랜 또는 후속):** 첨부파일은 경로 텍스트로만 전달(v1). 봇 아바타 이미지 없음(shape/color만). 봇→봇 직접 메시지(grok-bot의 SendToAgent 1:1)는 방 안 @멘션으로 대체. codex `workspace-write` 샌드박스가 유닉스 소켓 연결을 막는지는 Task 17에서 확인해야 함 — 막히면 codex는 `auto`에서 `--dangerously-bypass-approvals-and-sandbox`가 아니라 **HTTP 루프백**(host가 127.0.0.1 포트도 여는 것) 대안을 후속으로 검토.
- **타입 일관성:** `AgentSummary.herdrBot`, `BotRuntime.status`, `MemberTurnResult.outcome`, control 메서드 이름(`room.set-members`, `bot.adoptable`)이 Task 5/7/11/15/16에서 동일하게 쓰였는지 확인함.
