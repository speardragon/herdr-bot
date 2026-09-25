# 봇 협업 및 실행 설정 구현 계획

> **에이전트 작업자 안내:** 필수 하위 스킬: 작업별 구현에는 superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans 사용. 진행 단계는 체크박스(`- [ ]`)로 추적

**Goal:** 아바타 멘션 칩, DM·그룹 채팅 내 봇 간 메시지 전송, 봇 생성 시 작업 디렉터리·AI 프로바이더·모델·추론 수준 설정 제공

**Architecture:** 메시지 권한 검사와 수신 채팅 깨우기를 `TurnService`에 두고 pane 인증 CLI 명령으로 제공해 프롬프트가 사용자 메시지를 위조하지 않도록 구성. 실행 옵션은 `BotProfile`에 저장하고 단일 core 모듈에서 프로바이더별 프로세스 인자로 변환. 저장된 rich text를 다시 쓰지 않고 현재 roster 데이터로 멘션을 렌더링해 아바타·프로필 변경 반영

**Tech Stack:** TypeScript 7, Node.js test runner, React, Tiptap/ProseMirror, Electron renderer, 기존 JSON control protocol 및 herdr CLI 연동

## Global Constraints

- 색상 미지정 시 기존 무작위 아바타 색상 동작 유지
- 기존 앱 관리 온보딩 인사말 및 프로필 수정 명령 유지
- 봇은 호출 pane에 연결된 자기 자신으로만 메시지 작성 가능, CLI에서 호출자가 author ID를 지정하는 방식 금지
- 봇은 다른 봇의 DM에 메시지 전송 가능, 그룹 채팅에는 해당 채팅 멤버인 경우에만 전송 가능
- 봇 A가 봇 B에게 요청하면 A는 사용자에게 전달 사실을 알리고, B의 답변이 A의 DM에 도착할 때까지 대기. A는 답변 수신 후 핵심 내용을 사용자에게 요약
- 봇 이름 변경 및 다른 봇에게 메시지 전송 시 해당 채팅에 시스템 안내 기록. 시간 구분선은 각 메시지가 아닌 날짜 변경 또는 30분 이상 대화 공백에서 표시
- 현재 배정된 턴 응답에는 `say` 사용, 다른 채팅으로 보내는 메시지에는 새 `message` 명령 사용
- 멘션 문서에는 안정적인 `id`, `label` 속성만 저장하고, 렌더링 시점에 현재 roster에서 아바타 데이터 조회
- 모델 값은 프로바이더 고유 문자열로 유지. 모델 선택지는 해당 사용자 환경에서 조회 가능한 최신 목록 또는 CLI의 최신 모델 별칭으로 구성. 추론 수준은 `low`, `medium`, `high`, `xhigh`, `max`이며 지원 CLI flag가 없는 프로바이더에서는 거부
- 이미 실행 중인 프로세스는 herdr-bot에서 설정을 소급 변경할 수 없으므로, adopt pane의 `model` 및 `reasoningEffort` 값은 `null` 유지
- runtime dependency 추가 금지

---

## 파일 구성

- `core/src/bots/launch-args.ts`: 프로바이더 기능, 실행 옵션 검증, 프로바이더별 CLI 인자 담당
- `core/src/bots/model-catalog.ts`: 설치된 CLI별 모델 목록 조회·정규화·캐시 및 최신 별칭 제공
- `core/src/bots/model-fallbacks.ts`: CLI에서 모델 목록을 가져올 수 없는 프로바이더의 사용자 제공 고정 선택지 관리
- `core/src/store/profile-store.ts`: 봇의 선택 모델 및 추론 수준 저장
- `core/src/services/roster-service.ts`: 생성 입력 검증 및 선택한 설정 기록·실행
- `core/src/model/summaries.ts`: 실행 설정을 renderer에 제공
- `core/src/services/turn-service.ts`: 봇 작성 교차 채팅 메시지 권한 검사 및 수신 채팅 실행 예약
- `core/src/model/bot-system-events.ts`: 이름 변경·봇 간 메시지 전송의 구조화된 시스템 안내 데이터
- `core/src/control/handlers.ts`: 인증된 control 요청을 `TurnService`에 연결
- `core/src/coordinator/dispatcher.ts`: renderer의 모델 목록 조회 요청 처리
- `cli/src/args.ts` 및 `cli/src/main.ts`: `herdr-bot message <chat-id> <text>`와 봇 생성 옵션 파싱·전달
- `core/src/bots/prompts.ts`: `say`와 `message` 사용 시점 안내
- `renderer/src/recovered/features/conversation/workspace/mention-chip.tsx`: 현재 아바타를 사용하는 재사용 멘션 렌더링
- `renderer/src/recovered/features/conversation/workspace/rich-text-editor.tsx`: 편집 가능한 Tiptap 내용에 멘션 칩 적용
- `renderer/src/recovered/features/conversation/workspace/transcript.tsx`: 저장된 읽기 전용 내용에 동일한 멘션 칩 적용
- `renderer/src/production/NewChatDialog.tsx`: 프로바이더·모델·추론 수준·작업 디렉터리 입력
- `renderer/src/production/ProductionRenderer.tsx`: 생성 설정 전달 및 roster 기반 멘션 정보 제공
- `renderer/src/production/model.ts`: 저장된 실행 설정을 `RendererAgent`에 투영
- `renderer/src/production/transcript-time-separators.ts`: 날짜 변경·긴 대화 공백에 따른 시간 구분선 생성
- `renderer/src/production/minimal.css`: 멘션 배경 및 아바타 스타일

---

### Task 1: 프로바이더 실행 옵션 정의 및 저장

**파일:**
- 수정: `core/src/bots/launch-args.ts`
- 수정: `core/src/store/profile-store.ts`
- 수정: `core/src/services/roster-service.ts`
- 수정: `core/src/model/summaries.ts`
- 테스트: `core/test/launch-args.test.ts`
- 테스트: `core/test/profile-store.test.ts`
- 테스트: `core/test/roster-service.test.ts`

**인터페이스:**
- 제공: `ReasoningEffort`, `AgentLaunchOptions`, `providerLaunchCapabilities(kind)`, `launchArgsFor(kind, permissionMode, cliPath, options)`
- 제공: `BotProfile.model: string | null`, `BotProfile.reasoningEffort: ReasoningEffort | null`
- 사용: 기존 `PermissionMode`, 지원 kind 검증, profile-store migration/default 처리 방식

- [ ] **1단계: 실패하는 실행 인자 테스트 작성**

```ts
test("provider launch options become exact CLI arguments", () => {
  const cli = "/opt/herdr-bot";
  assert.deepEqual(launchArgsFor("claude", "ask", cli, { model: "claude-sonnet-4-5", reasoningEffort: "high" }), [
    "--allowedTools", `Bash(${cli} *)`, "--model", "claude-sonnet-4-5", "--effort", "high",
  ]);
  assert.deepEqual(launchArgsFor("codex", "auto", cli, { model: "gpt-5.4", reasoningEffort: "xhigh" }), [
    "-s", "workspace-write", "-a", "on-request", "--model", "gpt-5.4", "--config", 'model_reasoning_effort="xhigh"',
  ]);
  assert.deepEqual(launchArgsFor("grok", "ask", cli, { model: "grok-code-fast-1", reasoningEffort: "high" }), [
    "--model", "grok-code-fast-1", "--reasoning-effort", "high",
  ]);
  assert.deepEqual(launchArgsFor("gemini", "ask", cli, { model: "gemini-2.5-pro", reasoningEffort: null }), ["--model", "gemini-2.5-pro"]);
  assert.deepEqual(launchArgsFor("opencode", "ask", cli, { model: "anthropic/claude-sonnet-4-5", reasoningEffort: null }), ["--model", "anthropic/claude-sonnet-4-5"]);
});

test("provider capabilities reject unsupported reasoning", () => {
  assert.equal(providerLaunchCapabilities("gemini").reasoning, false);
  assert.throws(
    () => launchArgsFor("gemini", "ask", "/opt/herdr-bot", { model: null, reasoningEffort: "high" }),
    /gemini does not support reasoning effort/,
  );
});
```

- [ ] **2단계: 대상 테스트를 실행해 새 API 부재 확인**

실행: `npm test -- --test-name-pattern='provider launch options|provider capabilities' core/test/launch-args.test.ts`

예상 결과: `providerLaunchCapabilities` 및 `launchArgsFor`의 네 번째 매개변수가 없어 FAIL

- [ ] **3단계: 프로바이더 기능 및 인자 변환 추가**

```ts
export const REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export interface AgentLaunchOptions {
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
}

export interface ProviderLaunchCapabilities {
  readonly model: boolean;
  readonly reasoning: boolean;
}

export function providerLaunchCapabilities(kind: string): ProviderLaunchCapabilities {
  return {
    model: ["claude", "codex", "grok", "gemini", "opencode"].includes(kind),
    reasoning: ["claude", "codex", "grok"].includes(kind),
  };
}

export function launchArgsFor(
  kind: string,
  permissionMode: PermissionMode,
  cliPath: string,
  options: AgentLaunchOptions = { model: null, reasoningEffort: null },
): string[] {
  const capabilities = providerLaunchCapabilities(kind);
  if (options.model != null && !capabilities.model) throw new Error(`${kind} does not support model selection`);
  if (options.reasoningEffort != null && !capabilities.reasoning) throw new Error(`${kind} does not support reasoning effort`);

  const args = kind === "claude"
    ? permissionMode === "auto" ? ["--permission-mode", "bypassPermissions"] : ["--allowedTools", `Bash(${cliPath} *)`]
    : kind === "codex" && permissionMode === "auto" ? ["-s", "workspace-write", "-a", "on-request"] : [];
  if (options.model != null) args.push("--model", options.model);
  if (options.reasoningEffort != null) {
    if (kind === "claude") args.push("--effort", options.reasoningEffort);
    if (kind === "codex") args.push("--config", `model_reasoning_effort="${options.reasoningEffort}"`);
    if (kind === "grok") args.push("--reasoning-effort", options.reasoningEffort);
  }
  return args;
}
```

- [ ] **4단계: 저장 필드 및 하위 호환 디코딩 테스트 추가**

```ts
test("older bot profiles load with null launch selections", async () => {
  const store = await profileHarnessWithRawBot({ id: "old", name: "Old", kind: "claude", cwd: "/tmp", permissionMode: "ask" });
  const bot = store.getBot("old");
  assert.equal(bot?.model, null);
  assert.equal(bot?.reasoningEffort, null);
});
```

`BotProfile`과 parser, 기본값, serialization에 다음 필드 추가:

```ts
readonly model: string | null;
readonly reasoningEffort: ReasoningEffort | null;
```

공백 제거 후 비어 있지 않은 모델 문자열 및 `REASONING_EFFORTS` 값만 허용, 저장된 값이 없으면 `null`로 디코딩

- [ ] **5단계: 봇 생성·실행·요약에 선택값 연결**

```ts
export interface CreateBotArgs {
  // retain existing fields
  readonly model?: string | null;
  readonly reasoningEffort?: ReasoningEffort | null;
}
```

`RosterService.createBot`에서 선택값을 한 번 정규화하고, 지원하지 않는 조합은 `RosterError("invalid_launch_options", message)`로 거부. 두 필드 저장 후 다음 호출:

```ts
launchArgsFor(profile.kind, profile.permissionMode, this.#deps.config.cliPath, {
  model: profile.model,
  reasoningEffort: profile.reasoningEffort,
});
```

agent summary의 `herdrBot` 항목에 두 nullable 필드 노출. adopt-pane 경로에서는 두 값을 모두 `null`로 설정

- [ ] **6단계: core 테스트 실행 및 commit**

실행: `npm test -- core/test/launch-args.test.ts core/test/profile-store.test.ts core/test/roster-service.test.ts`

예상 결과: PASS

```bash
git add core/src/bots/launch-args.ts core/src/store/profile-store.ts core/src/services/roster-service.ts core/src/model/summaries.ts core/test/launch-args.test.ts core/test/profile-store.test.ts core/test/roster-service.test.ts
git commit -m "feat: persist bot launch selections"
```

### Task 2: control protocol 및 CLI에 실행 설정 노출

**파일:**
- 수정: `core/src/control/handlers.ts`
- 수정: `core/src/coordinator/dispatcher.ts`
- 수정: `cli/src/args.ts`
- 수정: `cli/src/main.ts`
- 테스트: `core/test/coordinator-dispatcher.test.ts`
- 테스트: `cli/test/args.test.ts`

**인터페이스:**
- 사용: 작업 1에서 추가한 `CreateBotArgs.model`, `CreateBotArgs.reasoningEffort`
- 제공: `bot create ... --cwd <path> --kind <provider> --model <model> --reasoning <effort>` 파싱 및 동등한 renderer RPC 필드

- [ ] **1단계: 실패하는 parser 및 dispatcher 테스트 추가**

```ts
test("bot create parses working directory and launch selections", () => {
  assert.deepEqual(parseArgs(["bot", "create", "reviewer", "--cwd", "/work/repo", "--kind", "codex", "--model", "gpt-5.4", "--reasoning", "high"]), {
    command: "bot-create", id: "reviewer", cwd: "/work/repo", kind: "codex", model: "gpt-5.4", reasoningEffort: "high",
  });
});
```

dispatcher harness에서 `model`, `reasoningEffort`를 지정해 `herdrBot.createAgent` 호출. 캡처한 `roster.createBot` 입력에 두 값이 그대로 포함되는지 검증

- [ ] **2단계: 테스트 실행 후 옵션 거부 또는 누락 확인**

실행: `npm test -- cli/test/args.test.ts core/test/coordinator-dispatcher.test.ts`

예상 결과: 새 assertion에서 FAIL

- [ ] **3단계: 필드 파싱·검증·전달**

생성형 봇 명령에만 선택적 `--model`, `--reasoning` 옵션 추가. `--reasoning` 파싱 방식:

```ts
function parseReasoningEffort(value: string): ReasoningEffort {
  if (!REASONING_EFFORTS.includes(value as ReasoningEffort)) {
    throw new UsageError(`--reasoning must be one of: ${REASONING_EFFORTS.join(", ")}`);
  }
  return value as ReasoningEffort;
}
```

CLI control 요청과 `herdrBot.createAgent` 양쪽에 `model`, `reasoningEffort` 전달. adopt 명령에서는 해당 옵션 미지원. CLI 도움말에 다음 예시 추가:

```text
herdr-bot bot create reviewer --cwd /work/repo --kind codex --model gpt-5.4 --reasoning high
```

- [ ] **4단계: 테스트 실행 및 commit**

실행: `npm test -- cli/test/args.test.ts core/test/coordinator-dispatcher.test.ts`

예상 결과: PASS

```bash
git add core/src/control/handlers.ts core/src/coordinator/dispatcher.ts cli/src/args.ts cli/src/main.ts cli/test/args.test.ts core/test/coordinator-dispatcher.test.ts
git commit -m "feat: accept bot launch settings"
```

### Task 3: pane 인증 기반 봇 간 메시지 전송

**파일:**
- 수정: `core/src/services/turn-service.ts`
- 수정: `core/src/control/handlers.ts`
- 수정: `cli/src/args.ts`
- 수정: `cli/src/main.ts`
- 테스트: `core/test/turn-service.test.ts`
- 테스트: `cli/test/args.test.ts`

**인터페이스:**
- 제공: `TurnService.handleMessage(paneId: string, chatId: string, text: string): { entryId: string }`
- 제공: CLI 명령 `message <chat-id> <text>`. control payload에는 CLI runtime이 확인한 pane ID를 항상 포함
- 사용: 기존 `RosterService.resolveBotByPane`, `ChatService.chatKind`/`appendBot`, `SayInbox.isOpen`, room 멤버 확인, `TurnService.schedule`

- [ ] **1단계: 실패하는 권한 및 전달 테스트 작성**

```ts
test("a bot can message another bot DM and wake the recipient", async () => {
  const h = await makeTurnHarness();
  const result = h.turns.handleMessage("w1:p-a", "bot-b", "Can you inspect the parser?");
  assert.match(result.entryId, /^entry-/);
  assert.deepEqual(h.chat.entries("bot-b").at(-1), matchBotMessage({ authorId: "bot-a", text: "Can you inspect the parser?" }));
  await h.flush();
  assert.deepEqual(h.startedTurns, [{ chatId: "bot-b", botId: "bot-b" }]);
});

test("room messaging requires membership and schedules the room", async () => {
  const h = await makeTurnHarness();
  assert.throws(() => h.turns.handleMessage("w1:p-outsider", "room-1", "hello"), hasControlCode("not_a_member"));
  h.turns.handleMessage("w1:p-a", "room-1", "I found the issue");
  await h.flush();
  assert.equal(h.chat.entries("room-1").at(-1)?.authorId, "bot-a");
});

test("message cannot bypass the active-turn say limit", async () => {
  const h = await makeTurnHarnessWithOpenInbox("room-1", "bot-a");
  assert.throws(() => h.turns.handleMessage("w1:p-a", "room-1", "third reply"), hasControlCode("use_say"));
});
```

- [ ] **2단계: 대상 테스트를 실행해 `handleMessage` 부재 확인**

실행: `npm test -- --test-name-pattern='message another bot|room messaging|cannot bypass' core/test/turn-service.test.ts`

예상 결과: `handleMessage`가 없어 FAIL

- [ ] **3단계: 권한 경계 구현**

기존 `SayInbox.isOpen(chatId, botId): boolean` 사용. 다음 순서로 `handleMessage` 구현:

```ts
handleMessage(paneId: string, chatId: string, text: string): { entryId: string } {
  const sender = this.#deps.roster.resolveBotByPane(paneId);
  if (sender == null) throw new ControlError("unknown_pane", `No bot is bound to pane ${paneId}`);
  const body = text.trim();
  if (body.length === 0) throw new ControlError("invalid_params", "Message text must not be empty");
  if (this.#deps.inbox.isOpen(chatId, sender.id)) {
    throw new ControlError("use_say", "Use say for the chat whose turn is currently open");
  }

  const kind = this.#deps.chat.chatKind(chatId);
  if (kind == null) throw new ControlError("unknown_chat", `Unknown chat: ${chatId}`);
  const targetBot = kind === "bot" ? this.#deps.roster.memberIdFor(chatId) : null;
  const roomMemberIds = kind === "room" ? this.#roomMembers(chatId) ?? [] : [];
  if (kind === "room" && !roomMemberIds.includes(sender.id)) {
    throw new ControlError("not_a_member", `${sender.id} is not a member of ${chatId}`);
  }
  if (kind === "bot" && targetBot == null) throw new ControlError("bot_not_ready", `${chatId} is not ready`);

  const entry = this.#deps.chat.appendBot(chatId, { id: sender.id, name: sender.name }, body);
  void this.schedule(chatId);
  return { entryId: entry.id };
}
```

전달 방식: A가 B의 DM에 쓰면 A 작성 메시지를 B의 DM에 추가하고 B의 턴 실행. B는 `message A ...`로 A의 DM에 응답. 그룹 채팅 메시지는 봇 작성 메시지로 추가하고 일반 room 응답 순서 실행

- [ ] **4단계: CLI 명령 및 control handler 추가**

파싱 형식:

```text
herdr-bot message <bot-id|room-id> "<message>"
```

CLI는 `say`와 동일한 신뢰 가능한 환경·runtime 경로에서 `paneId` 확인. payload 형식은 `{ paneId, chatId, text }`. control method `message`를 `host.turns.handleMessage(...)`에 연결. 따옴표로 감싼 여러 줄 텍스트 parser 테스트 및 본문 누락 usage-error 테스트 포함

- [ ] **5단계: 테스트 실행 및 commit**

실행: `npm test -- core/test/turn-service.test.ts cli/test/args.test.ts`

예상 결과: PASS

```bash
git add core/src/services/turn-service.ts core/src/control/handlers.ts cli/src/args.ts cli/src/main.ts core/test/turn-service.test.ts cli/test/args.test.ts
git commit -m "feat: let bots message DMs and rooms"
```

### Task 4: 모든 봇 턴에 교차 채팅 메시지 사용법 안내

**파일:**
- 수정: `core/src/bots/prompts.ts`
- 수정: `core/src/group/group-chat.ts`
- 테스트: `core/test/prompts.test.ts`

**인터페이스:**
- 사용: 작업 3의 `herdr-bot message`
- 제공: 현재 턴 응답과 교차 채팅 메시지를 구분하는 DM·room 지침
- 제공: 봇 작성 메시지의 이름과 안정적인 bot ID를 함께 보여 주는 `formatGroupLine`

- [ ] **1단계: 실패하는 prompt-contract 테스트 추가**

```ts
test("DM prompt exposes safe bot and room messaging", () => {
  const prompt = buildDirectPrompt(fixture);
  assert.match(prompt, /herdr-bot message <bot-id> "<message>"/);
  assert.match(prompt, /herdr-bot message <room-id> "<message>"/);
  assert.match(prompt, /Use say only for this DM turn/);
  assert.match(prompt, /Do not send acknowledgement-only messages back and forth/);
});

test("room prompt tells the bot to use say in the active room", () => {
  const prompt = buildRoomPrompt(fixture);
  assert.match(prompt, /Use say for this room/);
  assert.match(prompt, /Use message only for a different DM or room/);
});

test("bot relay prompts require delivery acknowledgement and result summary", () => {
  const prompt = buildDirectPrompt(botRelayFixture);
  assert.match(prompt, /bot id: bot-a/);
  assert.match(prompt, /tell the user only after message succeeds/);
  assert.match(prompt, /send the result back to the requesting bot/);
  assert.match(prompt, /summarize the received result to the user/);
});
```

- [ ] **2단계: prompt 테스트를 실행해 지침 부재 확인**

실행: `npm test -- core/test/prompts.test.ts`

예상 결과: 새 assertion에서 FAIL

- [ ] **3단계: identity block 다음에 간결한 사용 지침 추가**

설정된 CLI 경로를 넣어 다음 정책 문구 그대로 사용:

```text
To contact another bot in that bot's DM:
  <cli> message <bot-id> "<message>"
To post to another room you belong to:
  <cli> message <room-id> "<message>"
Use say only for the chat whose turn is currently open. Use message only for a different DM or room.
Send cross-chat messages only when requested or useful to the task. Do not send acknowledgement-only messages back and forth.
When a user asks you to contact another bot, call message first. Only after it succeeds, say in your current chat that you sent the request and will report back when the answer arrives. End this turn; do not claim an answer yet.
When another bot asks you to work, do the work, then send the result back to the requesting bot's id with message. A say in your own DM does not reach the requester.
When you receive a result from a bot you contacted, summarize the received result to the user with say. Do not send the result back to that bot again.
```

`formatGroupLine`에서 봇 작성 줄을 `표시 이름 (bot id: <id>): <content>` 형태로 변경. 이름이 중복되거나 변경되어도 수신 봇이 `message` 대상 ID를 확인 가능. 기존 이름·label·description context와 프로필 수정 안내 유지

- [ ] **4단계: 테스트 실행 및 commit**

실행: `npm test -- core/test/prompts.test.ts core/test/blocked-prompt.test.ts`

예상 결과: PASS

```bash
git add core/src/bots/prompts.ts core/src/group/group-chat.ts core/test/prompts.test.ts core/test/blocked-prompt.test.ts
git commit -m "feat: document bot collaboration commands in turns"
```

### Task 5: 배경 및 현재 아바타가 있는 멘션 렌더링

**파일:**
- 생성: `renderer/src/recovered/features/conversation/workspace/mention-chip.tsx`
- 수정: `renderer/src/recovered/features/conversation/workspace/rich-text-editor.tsx`
- 수정: `renderer/src/recovered/features/conversation/workspace/editor-suggestion-provider.ts`
- 수정: `renderer/src/recovered/features/conversation/workspace/transcript.tsx`
- 수정: `renderer/src/production/ProductionRenderer.tsx`
- 수정: `renderer/src/production/minimal.css`
- 테스트: `renderer/test/mention-polish.test.ts`

**인터페이스:**
- 제공: `MentionIdentity`, `MentionChip({ id, label, identity })`
- 제공: editor/transcript provider의 `resolveMentionIdentity(id: string): MentionIdentity | null`
- 사용: `AgentAvatar`, 현재 roster의 아바타 색상·모양·data URL, 기존 Tiptap 멘션 `id`/`label` 속성

- [ ] **1단계: 실패하는 구조 및 렌더링 테스트 추가**

편집·읽기 전용 멘션 경로 모두 `MentionChip`을 사용하고, 저장된 mention JSON에는 `id`, `label`만 포함되는지 assertion 추가. 다음 component 테스트 추가:

```tsx
const html = renderToStaticMarkup(
  <MentionChip id="reviewer" label="Reviewer" identity={{ color: "blue", shape: "circle", dataUrl: null }} />,
);
assert.match(html, /class="sand-mention"/);
assert.match(html, /sand-agent-avatar/);
assert.match(html, /@Reviewer/);
assert.match(html, /--mention-color:/);
```

- [ ] **2단계: renderer 대상 테스트 실행**

실행: `npm test -- renderer/test/mention-polish.test.ts`

예상 결과: `mention-chip.tsx` 및 resolver 연결이 없어 FAIL

- [ ] **3단계: 재사용 멘션 component 생성**

```tsx
import { AgentAvatar } from "./agent-avatar";
import { resolvePersonaColorHex } from "../../onboarding/signed-in/character";

export interface MentionIdentity {
  readonly color: string | null;
  readonly shape: string | null;
  readonly dataUrl: string | null;
}

export function MentionChip({ id, label, identity }: {
  readonly id: string;
  readonly label: string;
  readonly identity: MentionIdentity | null;
}) {
  const color = identity?.color ?? null;
  return <span className="sand-mention" data-type="mention" style={{ "--mention-color": resolvePersonaColorHex(id, color) } as React.CSSProperties}>
    <AgentAvatar agentId={id} color={color ?? undefined} dataUrl={identity?.dataUrl ?? undefined} isStatic shape={identity?.shape ?? undefined} size="xs" />
    <span>@{label}</span>
  </span>;
}
```

기존 `AgentAvatarProps.size="xs"` 매핑 사용. 16 px로 렌더링

- [ ] **4단계: editor에서 React node view 사용**

멘션의 `simpleNodeView`를 `ReactNodeViewRenderer`로 교체. node-view component에서 `node.attrs.id`, `node.attrs.label`을 읽고 현재 provider의 `resolveMentionIdentity(id)` 호출. `NodeViewWrapper` 안에 `contentEditable={false}`인 `MentionChip` 렌더링. 기존 mention provider contract에 resolver를 추가하고 `ProductionRenderer.tsx`에서 현재 agent roster 기반으로 제공

Tiptap mention 속성이나 command 삽입 데이터에 아바타 필드 추가 금지. 저장 문서 호환성 유지 및 프로필 변경 즉시 반영

- [ ] **5단계: 읽기 전용 transcript에도 동일 resolver 적용**

private renderer signature를 일관되게 변경:

```ts
type ResolveMentionIdentity = (id: string) => MentionIdentity | null;
function renderRichTextNode(node: ProseMirrorNode, key: string, resolveMentionIdentity: ResolveMentionIdentity): ReactNode;
function readOnlyRichTextContent(value: string, resolveMentionIdentity: ResolveMentionIdentity): ReactNode | null;
```

재귀 호출마다 resolver 전달. mention node 렌더링 형식:

```tsx
const id = String(node.attrs.id ?? "");
const label = String(node.attrs.label ?? id);
return <MentionChip id={id} identity={resolveMentionIdentity(id)} key={key} label={label} />;
```

`ProductionRenderer.tsx`의 기존 transcript roster/avatar projection에서 resolver 제공. 알 수 없거나 삭제된 ID에도 결정적 fallback avatar 렌더링

- [ ] **6단계: 간결한 멘션 배경 스타일 적용**

```css
.sand-mention {
  align-items: center;
  background: color-mix(in srgb, var(--mention-color) 14%, var(--cursor-bg-elevated));
  border: 1px solid color-mix(in srgb, var(--mention-color) 28%, transparent);
  border-radius: 999px;
  color: var(--cursor-text-primary);
  display: inline-flex;
  gap: 4px;
  line-height: 20px;
  padding: 1px 6px 1px 2px;
  vertical-align: baseline;
  white-space: nowrap;
}
```

- [ ] **7단계: renderer 테스트 실행 및 commit**

실행: `npm test -- renderer/test/mention-polish.test.ts && npm run renderer:typecheck`

예상 결과: PASS

```bash
git add renderer/src/recovered/features/conversation/workspace/mention-chip.tsx renderer/src/recovered/features/conversation/workspace/rich-text-editor.tsx renderer/src/recovered/features/conversation/workspace/editor-suggestion-provider.ts renderer/src/recovered/features/conversation/workspace/transcript.tsx renderer/src/production/ProductionRenderer.tsx renderer/src/production/minimal.css renderer/test/mention-polish.test.ts
git commit -m "feat: show avatars in mention chips"
```

### Task 6: 프로바이더별 모델 목록 조회 및 최신 별칭 제공

**파일:**
- 생성: `core/src/bots/model-catalog.ts`
- 생성: `core/src/bots/model-fallbacks.ts`
- 수정: `core/src/coordinator/dispatcher.ts`
- 테스트: `core/test/model-catalog.test.ts`

**인터페이스:**
- 제공: `listBotModels(kind: string): Promise<ModelCatalogResult>` 및 renderer RPC `herdrBot.listModels`
- `ModelCatalogResult`: `{ models: readonly { id: string; label: string }[]; source: "installed-cli" | "latest-alias" | "user-fallback" | "unavailable"; error?: string }`
- 사용: 설치된 CLI 및 기존 renderer RPC 경로

- [ ] **1단계: CLI 목록과 별칭 동작 테스트 작성**

fixture CLI 출력으로 `grok models`, `opencode models`, Codex app-server `model/list` 응답을 검증. Claude에서는 `opus`·`sonnet`·`haiku`, Gemini에서는 `auto`·`pro`·`flash`·`flash-lite` 별칭 노출 확인. 빈 출력·실행 실패·시간 초과 시 `source: "unavailable"` 반환 확인. 중복 ID 제거 및 설치된 CLI 목록 순서 유지 검증

- [ ] **2단계: 모델 목록 조회 구현**

| 프로바이더 | 조회 경로 | 선택지 처리 |
| --- | --- | --- |
| Grok | `grok models` | 설치·로그인된 CLI가 보여 주는 모델 ID를 그대로 사용 |
| OpenCode | `opencode models` | 연결된 provider의 `provider/model` ID 사용 |
| Codex | `codex app-server`의 `model/list` | 현재 계정에서 노출되는 모델과 지원 추론 수준 사용 |
| Claude Code | CLI `--model`의 `opus`, `sonnet`, `haiku` | 최신 버전으로 이동하는 별칭 사용, 사용자 제공 고정 ID가 있으면 함께 표시 |
| Gemini CLI | CLI `--model`의 `auto`, `pro`, `flash`, `flash-lite` | 최신 버전으로 이동하는 별칭 사용, 사용자 제공 고정 ID가 있으면 함께 표시 |

실행 파일은 현재 herdr agent kind가 사용하는 CLI 경로 기준으로 조회. 외부 프로세스 실행은 인자 배열 사용, shell 문자열 보간 금지. 5초 제한 및 5분 메모리 캐시 적용. dialog 재열기 시 캐시 결과를 먼저 보여 주고 백그라운드에서 갱신. 조회 실패 시 사용자 제공 고정 선택지가 있으면 `model-fallbacks.ts`에서 표시하고, 없으면 오류 안내·사용자 지정 모델 ID 입력 제공. 사용자 지정 ID는 실제 CLI 실행 시 검증되므로 목록에 없다는 이유만으로 거부하지 않음. Claude·Gemini의 별칭을 포함한 목록을 가져오는 비대화형 CLI 경로가 확인되면 이 별칭 경로보다 우선 적용. 사용자 제공 고정 ID는 확인 전 임의로 작성하지 않음

공식 근거: [Grok CLI](https://docs.x.ai/build/cli/reference), [OpenCode CLI](https://opencode.ai/docs/cli/), [Codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code/cli-usage), [Gemini CLI 모델 선택](https://geminicli.com/docs/cli/model/)

- [ ] **3단계: renderer RPC 연결**

`herdrBot.listModels` 요청에 `{ kind }` 전달, 응답으로 `ModelCatalogResult` 반환. adopt pane에는 모델 목록을 조회하지 않음. CLI 목록에 계정별 사용 가능 정보가 포함되지 않으면 이를 추측해 필터링하지 않음

- [ ] **4단계: 대상 테스트 실행 및 commit**

실행: `npm test -- core/test/model-catalog.test.ts core/test/coordinator-dispatcher.test.ts`

예상 결과: 목록 정규화, 별칭, 실패 상태, RPC 전달 테스트 PASS

```bash
git add core/src/bots/model-catalog.ts core/src/bots/model-fallbacks.ts core/src/coordinator/dispatcher.ts core/test/model-catalog.test.ts core/test/coordinator-dispatcher.test.ts
git commit -m "feat: discover available bot models"
```

### Task 7: 봇 생성 화면에 프로바이더·모델·추론·디렉터리 설정 추가

**파일:**
- 수정: `renderer/src/production/NewChatDialog.tsx`
- 수정: `renderer/src/production/ProductionRenderer.tsx`
- 수정: `renderer/src/production/model.ts`
- 수정: `renderer/src/production/FirstBotPanel.tsx`
- 테스트: `renderer/test/new-chat-model.test.ts`
- 테스트: `renderer/test/new-chat-header.test.ts`

**인터페이스:**
- 사용: 작업 1–2의 renderer RPC `herdrBot.createAgent` 필드·프로바이더 기능 정보 및 작업 6의 `herdrBot.listModels`
- 제공: `CreateBotRequest.model: string | null`, `CreateBotRequest.reasoningEffort: ReasoningEffort | null`

- [ ] **1단계: 실패하는 요청 생성 테스트 추가**

form 동작을 DOM event simulation에 의존시키지 않도록 순수 builder 추출 및 테스트:

```ts
assert.deepEqual(buildCreateBotRequest({
  name: "Reviewer", description: "Reviews changes", kind: "codex", cwd: "/work/repo",
  permissionMode: "auto", model: " gpt-5.4 ", reasoningEffort: "high", source: "__spawn__", takenIds: new Set(),
}), {
  id: "reviewer", name: "Reviewer", description: "Reviews changes", kind: "codex", cwd: "/work/repo",
  permissionMode: "auto", model: "gpt-5.4", reasoningEffort: "high",
});

assert.deepEqual(buildCreateBotRequest({
  name: "Adopted", description: "", kind: "codex", cwd: "/work/repo", permissionMode: "ask",
  model: "gpt-5.4", reasoningEffort: "high", source: "w1:p2", takenIds: new Set(),
}), {
  id: "adopted", name: "Adopted", description: "", kind: "codex", cwd: "/work/repo",
  permissionMode: "ask", model: null, reasoningEffort: null, adoptPaneId: "w1:p2",
});
```

- [ ] **2단계: 테스트를 실행해 필드 및 builder 부재 확인**

실행: `npm test -- renderer/test/new-chat-model.test.ts renderer/test/new-chat-header.test.ts`

예상 결과: 새 assertion에서 FAIL

- [ ] **3단계: dialog contract 및 state 확장**

```ts
export interface CreateBotRequest {
  // retain existing fields
  readonly model: string | null;
  readonly reasoningEffort: ReasoningEffort | null;
}
```

`model`, `reasoningEffort` state 추가. dialog를 열 때 두 값 초기화, 추론 미지원 프로바이더 선택 시 reasoning 초기화. 프로바이더가 바뀌면 `herdrBot.listModels` 재조회 및 이전 프로바이더의 선택 모델 초기화. 기존 `kind` selector label을 `AI provider`로 변경. 기존 directory picker 및 검증을 유지하고 label은 `Working directory`로 설정

spawn bot의 `Model` 필드는 조회된 최신 모델·별칭·사용자 제공 고정 선택지로 표시하고 첫 항목에 CLI 기본값(`null`) 배치. 목록 조회 실패 시 고정 선택지가 있으면 이를 표시하고, 없으면 오류 안내와 사용자 지정 모델 ID 입력 표시. 목록 조회 성공 시에도 사용자 지정 모델 ID 입력 경로 제공. Claude·Codex·Grok에만 `Default`, `Low`, `Medium`, `High`, `XHigh`, `Max` 선택형 `Reasoning` 표시. `Default`는 `null`로 변환. Codex의 모델별 지원 추론 수준은 `model/list` metadata로 제한. pane adopt 시 두 필드 비활성화 및 기존 프로세스 실행 설정 변경 불가 안내

- [ ] **4단계: 선택값 제출 및 projection 반영**

`ProductionRenderer.tsx`를 통해 요청을 변경 없이 `herdrBot.createAgent`에 전달. 생성 후 설정 확인이 가능하도록 `RendererAgent.herdrBot` projection에 nullable `model`, `reasoningEffort` 추가

일반 New Bot dialog를 설정 가능한 기본 생성 경로로 사용. `FirstBotPanel.tsx`에 dialog를 여는 `Advanced setup` 동작 추가. 기존 첫 실행 흐름을 빠르게 유지하도록 원클릭 quick creation은 기본 설정 전용 단축 경로로 유지

- [ ] **5단계: renderer 테스트 실행 및 commit**

실행: `npm test -- renderer/test/new-chat-model.test.ts renderer/test/new-chat-header.test.ts && npm run renderer:typecheck`

예상 결과: PASS

```bash
git add renderer/src/production/NewChatDialog.tsx renderer/src/production/ProductionRenderer.tsx renderer/src/production/model.ts renderer/src/production/FirstBotPanel.tsx renderer/test/new-chat-model.test.ts renderer/test/new-chat-header.test.ts
git commit -m "feat: configure bot provider model and reasoning"
```

### Task 8: 통합 협업 흐름 검증

**파일:**
- 수정: `README.md`
- 테스트: `core/test/turn-service.test.ts`
- 테스트: `core/test/prompts.test.ts`
- 테스트: `renderer/test/mention-polish.test.ts`

**Interfaces:**
- 사용: 작업 1–7에서 제공한 전체 interface
- 제공: 사용자·agent workflow 문서 및 전체 회귀 검증

- [ ] **1단계: 통합형 메시지 전달 테스트 추가**

```ts
test("bot A and bot B exchange DM messages and bot B posts to their room", async () => {
  const h = await makeTurnHarnessWithBotsAndRoom(["bot-a", "bot-b"]);
  h.turns.handleMessage("w1:p-a", "bot-b", "Please review change 42");
  await h.flush();
  h.turns.handleMessage("w1:p-b", "bot-a", "Review complete");
  h.turns.handleMessage("w1:p-b", "room-1", "@Bot A review complete");
  await h.flush();
  assert.equal(h.chat.entries("bot-b").at(-1)?.authorId, "bot-a");
  assert.equal(h.chat.entries("bot-a").at(-1)?.authorId, "bot-b");
  assert.equal(h.chat.entries("room-1").at(-1)?.authorId, "bot-b");
});
```

- [ ] **2단계: 구체적인 사용 흐름 문서화**

README에 다음 예시 추가:

```bash
herdr-bot bot create reviewer --cwd /work/repo --kind codex --model gpt-5.4 --reasoning high
herdr-bot message researcher "Please inspect the failing parser test."
herdr-bot message room-release "Parser review is complete."
```

`say`는 활성 채팅에 응답, `message`는 다른 채팅 대상, 봇은 참여 중인 그룹 채팅에만 전송 가능, 멘션 칩은 현재 아바타 사용, adopt된 프로세스 설정은 소급 변경 불가 내용을 명시

- [ ] **3단계: 전체 품질 검사 실행**

실행: `npm run check`

예상 결과: 네 workspace typecheck 및 전체 Node test 통과

- [ ] **4단계: desktop app 수동 smoke test**

실행: `npm run desktop:dev:fake`

검증 항목:

1. 새 봇 생성 시 작업 디렉터리·프로바이더·조회된 최신 모델 또는 별칭·지원 추론 수준 설정 가능
2. 모델 목록 조회 실패 시 사용자 지정 모델 ID 입력 가능
3. adopt pane에서 model/reasoning을 사용할 수 없는 상태로 표시
4. composer에서 `@Bot` 선택 시 아바타 및 옅은 배경 표시
5. 메시지 전송 후 다시 열어도 멘션 칩 유지, 이후 아바타 수정 시 칩에 반영
6. Bot A가 Bot B의 DM으로 메시지 전송, Bot B가 턴을 받아 Bot A에게 회신 가능
7. room 멤버의 `message` 전송 성공, 비멤버는 `not_a_member` 수신 및 transcript 항목 미추가
8. 기존 무작위 색상·온보딩·프로필 수정·일반 `say`·room 턴 제한 정상 동작

- [ ] **5단계: 문서 및 최종 회귀 테스트 commit**

```bash
git add README.md core/test/turn-service.test.ts core/test/prompts.test.ts renderer/test/mention-polish.test.ts
git commit -m "test: verify bot collaboration flow"
```

### Task 9: 이름 변경 및 봇 간 전송 시스템 안내

**파일:**
- 생성: `core/src/model/bot-system-events.ts`
- 수정: `core/src/model/entries.ts`
- 수정: `core/src/services/chat-service.ts`
- 수정: `core/src/services/roster-service.ts`
- 수정: `core/src/services/turn-service.ts`
- 수정: `core/src/host.ts`
- 수정: `renderer/src/production/model.ts`
- 수정: `renderer/src/production/ProductionRenderer.tsx`
- 수정: `renderer/src/recovered/features/conversation/workspace/model.ts`
- 수정: `renderer/src/recovered/features/conversation/workspace/transcript.tsx`
- 수정: `renderer/src/recovered/features/conversation/cards/notice/view.tsx`
- 테스트: `core/test/roster-service.test.ts`
- 테스트: `core/test/turn-service.test.ts`
- 테스트: `renderer/test/notice-events.test.ts`

**인터페이스:**
- 제공: `BotSystemEvent = { type: "bot-renamed"; oldName: string; newName: string } | { type: "bot-message-sent"; targetChatId: string; targetName: string; targetKind: "bot" | "room" }`
- 제공: `ChatService.appendBotEvent(chatId: string, event: BotSystemEvent): StoredEntry`
- 사용: 기존 `notice` transcript 항목과 `SayInbox.openChatFor(botId)`

- [ ] **1단계: 실패하는 시스템 안내 테스트 추가**

`RosterService.updateProfile`에서 실제 이름 변경 시 봇 DM에 안내 항목 1개 생성 확인. 동일 이름 재저장·label/description만 수정 시 이름 변경 안내 미생성 확인. A가 B의 DM에 `message` 전송하면 A의 현재 채팅에 대상 B의 ID·이름이 포함된 안내 1개 생성, B의 DM에는 A가 작성한 실제 메시지 1개만 생성 확인. A의 현재 채팅이 없으면 A 자신의 DM을 출처로 사용 확인. 전송 실패 시 성공 안내 미생성 확인

- [ ] **2단계: 구조화된 안내 데이터 정의 및 저장**

```ts
export type BotSystemEvent =
  | { readonly type: "bot-renamed"; readonly oldName: string; readonly newName: string }
  | { readonly type: "bot-message-sent"; readonly targetChatId: string; readonly targetName: string; readonly targetKind: "bot" | "room" };

export function botSystemNoticeEntry(event: BotSystemEvent, timestampMs: number): NewEntry {
  const content = event.type === "bot-renamed"
    ? `이름 변경됨: ${event.newName}`
    : `메시지 보냄: ${event.targetName}`;
  return { kind: "notice", content, event, timestampMs };
}
```

기존 일반 `notice` 동작은 유지. `ChatService.appendBotEvent`에서 채팅 존재 확인 후 위 entry 저장. 안내 항목은 기존 `ChatService` 규칙대로 읽지 않은 봇 메시지에 포함하지 않음

- [ ] **3단계: 이름 변경·메시지 전송 경로 연결**

`RosterService.updateProfile`의 저장 성공 후 `current.name !== next.name`이면 `onBotEvent(id, { type: "bot-renamed", oldName: current.name, newName: next.name })` 1회 호출. `host.ts`에서 callback을 `chat.appendBotEvent`에 연결해 UI 수정과 bot CLI `profile update` 양쪽에 동일하게 적용

`TurnService.handleMessage`에서 대상 메시지 저장 성공 후 출처 채팅을 `inbox.openChatFor(sender.id) ?? sender.id`로 확인. 출처와 대상이 다르면 출처에 `bot-message-sent` 기록. 전송 실패 시 안내 기록 금지. 안내 저장만 실패하면 대상 메시지를 재전송하지 않고 로그에 오류 기록. 출처와 대상이 같으면 `say`를 쓰도록 기존 `use_say` 처리 유지

- [ ] **4단계: transcript 안내 표시**

`projectTranscriptEntry`에서 `notice.event`를 검증해 `TranscriptNotice`에 전달. `TranscriptNoticeCard`는 `bot-renamed`를 가운데 정렬된 `이름 변경됨: <새 이름>`으로 표시. `bot-message-sent`는 `메시지 보냄` 뒤에 대상 봇의 현재 `AgentAvatar`와 전송 당시 `targetName` 표시. room 대상이면 기존 그룹 아바타 사용. `ProductionRenderer.tsx`의 현재 roster 아바타 resolver를 `transcript.tsx`를 통해 notice card에 전달. 알 수 없는 event나 이전 transcript의 일반 notice는 저장된 `content` 그대로 표시. 접근성 label에 안내 문구 포함

- [ ] **5단계: 테스트 실행 및 commit**

실행: `npm test -- core/test/roster-service.test.ts core/test/turn-service.test.ts renderer/test/notice-events.test.ts`

예상 결과: 이름 변경·전송 성공·실패 및 안내 표시 테스트 PASS

```bash
git add core/src/model/bot-system-events.ts core/src/model/entries.ts core/src/services/chat-service.ts core/src/services/roster-service.ts core/src/services/turn-service.ts core/src/host.ts renderer/src/production/model.ts renderer/src/production/ProductionRenderer.tsx renderer/src/recovered/features/conversation/workspace/model.ts renderer/src/recovered/features/conversation/workspace/transcript.tsx renderer/src/recovered/features/conversation/cards/notice/view.tsx core/test/roster-service.test.ts core/test/turn-service.test.ts renderer/test/notice-events.test.ts
git commit -m "feat: show bot rename and delivery notices"
```

### Task 10: 대화 구간별 날짜·시간 구분선

**파일:**
- 생성: `renderer/src/production/transcript-time-separators.ts`
- 수정: `renderer/src/production/ProductionRenderer.tsx`
- 수정: `renderer/src/recovered/features/conversation/workspace/transcript.tsx`
- 테스트: `renderer/test/transcript-time-separators.test.ts`

**인터페이스:**
- 제공: `withTranscriptTimeSeparators(entries, nowMs, locale): ConversationTranscriptEntry[]`
- 사용: 기존 `kind: "time-separator"`와 `.sand-transcript-time-separator` 렌더링

- [ ] **1단계: 구분선 규칙 테스트 작성**

첫 번째 표시 항목 앞, 현지 날짜가 바뀐 항목 앞, 직전 표시 항목과 30분 이상 떨어진 항목 앞에 구분선 1개씩 생성 확인. 29분 59초 간격 및 같은 시각의 연속 메시지에는 구분선 미생성 확인. 안내 항목도 표시 항목으로 취급. 한국어 오늘 날짜의 `오늘 오후 1:36`, 어제의 `어제 오후 1:36`, 이전 날짜의 월·일·시각 표기 확인. transcript 페이지 추가 로드 후 구분선 중복 없음 확인

- [ ] **2단계: 순수 projection 구현**

```ts
const TIME_GAP_MS = 30 * 60 * 1000;

export function shouldInsertTimeSeparator(previousMs: number | null, currentMs: number): boolean {
  if (previousMs == null) return true;
  return localDateKey(previousMs) !== localDateKey(currentMs) || currentMs - previousMs >= TIME_GAP_MS;
}
```

`localDateKey`와 label formatter는 앱 실행 환경의 현지 시간대 사용. locale은 기존 renderer 언어 설정 사용. `withTranscriptTimeSeparators`는 표시 가능한 entry의 `timestampMs` 순서로 계산하고 `id: "time:" + entry.id`인 파생 항목 삽입. 저장 파일에는 구분선을 기록하지 않음. 페이지가 추가 로드되거나 메시지가 도착하면 합쳐진 전체 표시 목록에서 다시 계산

- [ ] **3단계: renderer 연결 및 화면 확인**

`ProductionRenderer.tsx`의 transcript projection 결과를 `withTranscriptTimeSeparators`에 통과시킨 뒤 기존 `Transcript`에 전달. 기존 `time-separator` 렌더링과 CSS 사용. 구분선은 메시지별 timestamp 표시를 대신하지 않으며, 일반 bubble마다 새 구분선을 생성하지 않음. 오늘·어제 label은 날짜가 넘어간 뒤 화면 재진입 또는 자정 재계산 시 갱신

- [ ] **4단계: 전체 검사·화면 확인 및 commit**

실행: `npm run check`

예상 결과: 전체 typecheck·test PASS. 화면에서 A 요청→B 답변→A 요약, 이름 변경 안내, 전송 안내의 대상 아바타, 날짜 변경·30분 공백 구분선 확인

```bash
git add renderer/src/production/transcript-time-separators.ts renderer/src/production/ProductionRenderer.tsx renderer/src/recovered/features/conversation/workspace/transcript.tsx renderer/test/transcript-time-separators.test.ts
git commit -m "feat: group transcript time markers"
```
