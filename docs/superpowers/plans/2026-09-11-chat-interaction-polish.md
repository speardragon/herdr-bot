# Chat Interaction Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** herdr-bot-claude의 읽음·활동 상태를 정확하게 표시하고, 헤더 기반 새 채팅 생성과 자동 첫 인사, 멘션 UI, 데스크톱 안정성을 개선한다.

**Architecture:** 메시지와 읽음 상태의 권위는 host에 두고, 렌더러는 확인한 메시지 순번만 ACK한다. herdr 상태 구독은 폴링과 독립된 재시도 수명주기로 관리한다. 새 채팅 UI는 임시 draft, 실제 봇 생성은 host의 재시도 가능한 작업으로 분리한다.

**Tech Stack:** 기존 Node.js >=24.0.0, TypeScript, node:test, React, TipTap, Electron, herdr CLI 및 로컬 Unix socket. 새 런타임 의존성 없음.

## Global Constraints

- 이번 산출물은 설계 및 계획뿐이다. 앱 코드 수정·실행·에이전트 생성은 하지 않는다.
- 작업 루트는 `/Users/goorm/Desktop/ray/workspace/herdr-bot/herdr-bot-claude`이다. 아래 경로는 이 루트 기준이다.
- 기존 변경 사항과 다른 앱은 수정·삭제·일괄 스테이징하지 않는다.
- 한국어 기본, English 지원, 라이트/다크 모드 유지.
- 새 채팅 행: 회색 원 안의 플러스 아이콘 + `새 채팅`.
- 헤더 placeholder: `Bot 검색 또는 생성`.
- 기본 선택지: `새 Bot 만들기`, `그룹 채팅 만들기`.
- 첫 인사: `안녕하세요. 앞으로 같이 일할 준비가 됐어요. 제일 먼저, 저를 어떤 일에 가장 쓰고 싶으세요?`
- working은 아바타 오른쪽 아래 초록색 점, done 전환 후 5,000ms 유지.
- 기본 창 크기: 1040 × 760. 기존 최소 창 크기 512 × 520 유지.
- 로그인, Plugin, 자체 MCP 연결, 외부 서비스 연결은 범위 밖이다.
- 구현 단계에서는 각 Task의 실패 테스트 → 최소 구현 → 회귀 검증 순서를 지킨다. 이번 문서의 체크박스는 아직 실행하지 않은 작업이다.

---

## 1. 확인된 현재 동작과 원인

| 대상 | 코드 근거 | 판단 |
| --- | --- | --- |
| 재방문해도 파란 점 유지 | `renderer/src/production/ProductionRenderer.tsx`의 `openAgent`: `hasLoadedEntries`이면 RPC 전에 return. `core/src/coordinator/dispatcher.ts`의 `openAgentTail`에서만 `markViewed` 호출 | 캐시 재방문은 읽음 처리를 건너뛰는 경로가 확인됨 |
| 같은 시각 메시지 / 읽음 경합 | `core/src/store/view-state-store.ts`, `core/src/model/summaries.ts`: `lastActivityAt > lastViewedAt` | ms 단위 비교 대신 이미 존재하는 transcript `seq`로 확인 범위를 표현해야 함 |
| 잘못된 최신 순서 | `ProductionRenderer.tsx`의 upsert는 `updatedAt` 정렬, `sidebar-model.ts`는 고정 항목 우선 | 이름 변경도 순서에 영향을 주며, 고정/섹션은 전체 최신순 요구와 충돌 |
| 초록 점의 의미 혼합 | `summaries.ts`: `isRunning = working || isTurnActive`; `sidebar-agent-status.ts`는 unread/blocked를 corner의 색 결정에도 사용 | CLI working과 unread를 독립된 신호로 분리해야 함 |
| 5초마다 구독 실패 반복 | `core/src/herdr/status-mirror.ts`: 실패 후 30초 타이머를 잡지만 매 5초 `refreshOnce()` 끝에서 `resubscribe()` 호출 | 폴링이 재시도 대기를 우회함. 이전 타이머/콜백이 새 구독 상태를 건드릴 위험도 있음 |
| `pane w5:p1 not found` | CLI agent list의 pane ID를 socket 구독에 그대로 사용. 로컬 herdr 소스의 `src/api/subscriptions.rs`는 해당 pane을 먼저 조회, `src/api/server.rs`는 한 항목 실패 시 전체 구독을 종료 | 해당 socket에서 pane을 찾지 못했다는 뜻. 세션 불일치·사라진 pane·설치 버전의 ID 계약 중 어느 원인인지는 실행 환경 검증 전 확정하지 않음 |
| 첫 인사 없음 | `roster-service.ts`는 생성 후 identity brief를 기다림. `bots/prompts.ts`의 brief는 터미널에만 ok를 답하고 채팅에는 말하지 않도록 지시 | 기존 create 호출만 바꿔서는 첫 인사가 나오지 않음. 별도 onboarding turn 필요 |
| 전체 멘션 없음 | `ProductionRenderer.tsx`: `projectMentionMembers(members, false)` | backend의 `@everyone` 지원은 재사용 가능. 최종 추천 정렬도 전체 항목을 맨 위에 보장해야 함 |
| 창 크기 | `desktop/src/window-chrome.ts`: 1200 × 800 | 상수와 기존 테스트 기대값 수정 |

이번 조사에서 앱을 실행하거나 로그를 재현하지 않았다. 로컬 herdr checkout의 소스가 설치 바이너리와 동일하다는 보장은 없다.

macOS의 `TSM AdjustCapsLockLED...`, `IMKCFRunLoopWakeUpReliable`은 제공 로그에서 Electron 프로세스가 출력한 별도 진단이다. 앱의 status-mirror 반복과 같은 원인이라고 단정하지 않는다. 한글 조합·Caps Lock·포커스 전환의 실제 장애 동반 여부를 확인한 뒤 분류하며 stderr 전체 차단이나 무조건적인 Electron 업그레이드는 하지 않는다.

## 2. UX 결정안 — 명시되지 않은 부분의 권장 기본값

아래는 사용자 확정 요구와 구별되는 이번 계획의 제안이다. 구현 전 다른 선호가 있으면 이 부분만 조정한다.

1. **읽음:** 선택된 채팅의 최신 transcript가 로드되고 창이 보이며 포커스가 있을 때 읽음 처리한다. 채팅 진입은 해당 최신 페이지까지 읽은 것으로 간주한다. 다른 창 작업 중 수신한 메시지는 자동 읽음 처리하지 않는다. 열려 있고 포커스된 채팅의 실시간 메시지는 반영 후 읽음 처리한다.
2. **최신순:** Bot과 그룹을 하나의 최근 대화 목록으로 표시한다. 생성 draft만 항상 그 위에 위치한다. 송신/수신 메시지는 최신 활동으로 반영하되 이름·페르소나 수정, 읽음 ACK, 상태 변경, 내부 notice는 순서를 바꾸지 않는다. 기존 고정/섹션 데이터는 삭제하지 않지만 이 화면에서는 정렬 우선권을 적용하지 않고 관련 편집 메뉴를 감춘다.
3. **그룹 확정:** 멤버 2~6명을 고른 후 헤더의 `채팅 시작`으로 생성. 기존 최대 6명 제한을 유지한다. 기본 이름은 선택 순서의 봇 이름을 연결하고 40자 뒤 말줄임한다. 생성 후 기존 이름 수정 가능. 그룹은 사용자의 첫 메시지부터 기존 턴 대화를 시작한다.
4. **새 Bot의 기본값:** host의 `defaultKind`, `defaultCwd`, 기존 기본 승인 정책 `ask`를 사용한다. 기본 이름은 `새 Bot <ID 끝 6자리>`로 즉시 부여한다. 준비 화면에 실제 AI 도구와 폴더를 보여준다. 생성 전 이름/페르소나/도구 선택 폼은 띄우지 않는다. 도구가 없으면 다른 도구를 몰래 선택하지 않고 원인과 재시도를 제공한다.
5. **페르소나:** 첫 답변부터 실제 대화 맥락으로 역할을 발전시킨다. 이번 범위에 모델의 자동 프로필 영구 수정 권한은 추가하지 않는다. 기존 이름/페르소나 편집은 유지한다.
6. **첫 인사:** 실제 에이전트에 내부 onboarding prompt를 전달하고 기존 `say` 경로로 인사를 받는다. 내부 prompt를 사용자가 보낸 말풍선으로 만들지 않는다. 준비 중 입력 초안 작성은 가능하되 전송은 준비 완료까지 비활성화한다.
7. **English:** UI는 `New chat`, `Search or create a Bot`, `Create a new Bot`, `Create a group chat`, `Start chat`, `Everyone`. 새 봇 생성 시 locale을 고정 저장하며 영어 인사는 `Hello. I’m ready to work with you. First, what would you most like to use me for?`를 사용한다. 기존 transcript는 언어 변경으로 번역하지 않는다.
8. **활동 점:** 개별 봇만 표시한다. 그룹 전체에 새 활동 의미를 만들지는 않는다. `working → done`만 5초 잔상을 주며 최초 연결 시 이미 done인 봇에는 잔상을 새로 만들지 않는다. blocked/offline/unknown/idle 전환은 즉시 해제한다.

### 새 채팅 상태 흐름

```text
기존 채팅 ── + ──> 임시 '새 채팅' 행 + 헤더 combobox
                     ├─ 기존 Bot 검색 결과 선택 → 기존 DM 열기, 임시 행 제거
                     ├─ 새 Bot 만들기 → 실제 Bot 행(준비 중) → 첫 인사 → 일반 DM
                     │                                  └─ 실패 → 같은 Bot에서 재시도
                     └─ 그룹 채팅 만들기 → 멤버 chip 선택 → 채팅 시작 → 일반 그룹
```

- `+` 연타로 임시 행을 여러 개 만들지 않는다. 현재 draft에 포커스한다.
- `<input>` 내부에 요소를 넣을 수 없으므로 테두리 있는 flex wrapper 안에 chip들과 실제 input을 둔다.
- 그룹 모드에서 선택된 봇은 후보에서 제외한다. x 클릭은 chip만 제거하고 포커스를 input으로 돌린다.
- Escape는 먼저 dropdown을 닫는다. dropdown이 닫힌 상태에서 취소하거나 기존 채팅을 선택하면 저장 전 draft를 버린다. 실제 생성이 접수된 Bot은 화면 이동으로 삭제하지 않는다.
- ArrowUp/Down 이동, Enter 선택, Tab 이동, IME 조합 중 Enter 무시. 클릭 시 blur가 선택을 취소하지 않게 pointer 이벤트 순서를 처리한다.
- 빈 검색은 두 생성 액션, 검색어가 있으면 기존 Bot 결과와 두 액션을 함께 표시한다. 그룹은 멤버 검색만 한다.

## 3. 파일 경계 및 실행 순서

기존 거대 `ProductionRenderer.tsx`에는 연결만 추가하고, 상태 모델/헤더/표시 타이머는 작은 파일로 분리한다. 독립 검증 가능한 하위 작업으로 나누되 공유 상태 계약 때문에 계획은 한 문서에서 관리한다.

| Task | 수정/추가 범위 | 산출물 |
| --- | --- | --- |
| 1 | core herdr socket/mirror/cli | 구독 재시도 안정화 |
| 2 | core view/summary/chat/coordinator + renderer 읽음 controller | 순번 기반 읽음 ACK |
| 3 | renderer sidebar model/status + core 활동 timestamp | 최신순 및 독립 초록 점 |
| 4 | core onboarding/roster/turn/profile/host/coordinator | 즉시 생성·자동 첫 인사 |
| 5 | renderer 새 채팅 모델/헤더/sidebar/root | modal 없는 생성 UX |
| 6 | renderer editor suggestion/avatar/CSS | 아바타·전체 멘션 |
| 7 | desktop window/package scripts | 크기 및 실제 최신 빌드 실행 |
| 8 | 교차 시나리오 및 로그 기록 | 통합 회귀 검증 |

권장 실행 순서: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Task 6/7은 다른 기능 변경과 독립적으로 검증 가능하다.

## Task 1: 구독 실패 격리와 재시도 수명주기

**Files:**

- Create: `core/src/herdr/subscription-retry.ts`
- Modify: `core/src/herdr/status-mirror.ts`, `core/src/herdr/socket.ts`, `core/src/herdr/cli.ts`
- Test: `core/test/subscription-retry.test.ts`, `core/test/status-mirror.test.ts`, `core/test/herdr-socket.test.ts`, `core/test/herdr-cli.test.ts`
- Modify test helper: `core/test/helpers/fake-herdr-socket.ts`

**Interfaces:**

- `SubscriptionRetry.canAttempt(now: number): boolean`, `.fail(now: number): void`, `.ready(): void`.
- Socket close error의 `code`, `message`를 보존한다. `pane_not_found`와 transport 오류를 구분한다.
- StatusMirror의 public `refresh(): Promise<void>`와 `get(botId)` 계약은 유지한다. 수동 refresh는 start 전에도 테스트/서비스에서 사용할 수 있어야 한다.

- [ ] **Step 1: 재시도 게이트 실패 테스트 추가.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SubscriptionRetry } from "../src/herdr/subscription-retry.ts";
test("polls cannot bypass reconnect delay", () => {
  const retry = new SubscriptionRetry();
  retry.fail(0);
  for (const now of [5_000, 10_000, 29_999]) assert.equal(retry.canAttempt(now), false);
  assert.equal(retry.canAttempt(30_000), true);
  retry.fail(30_000);
  assert.equal(retry.canAttempt(89_999), false);
  retry.ready();
  assert.equal(retry.canAttempt(30_001), true);
});
```

- [ ] **Step 2: `node --test core/test/subscription-retry.test.ts` 실행.** 신규 모듈 부재로 FAIL 확인.
- [ ] **Step 3: 재시도 모델 작성.**

```ts
export class SubscriptionRetry {
  #failures = 0;
  #nextAt = 0;
  canAttempt(now: number): boolean { return now >= this.#nextAt; }
  fail(now: number): void {
    this.#nextAt = now + Math.min(120_000, 30_000 * 2 ** Math.min(this.#failures++, 2));
  }
  ready(): void { this.#failures = 0; this.#nextAt = 0; }
}
```

- [ ] **Step 4: mirror/socket 연결 수명주기를 수정.** 아래 연결 계약을 `resubscribe`에 적용한다.

```ts
// resubscribe의 시작 guard. retry는 위 SubscriptionRetry 인스턴스다.
if (this.#stopped || this.#deps.socketPath == null || !this.#retry.canAttempt(Date.now())) return;
const generation = ++this.#subscriptionGeneration;
// onReady/onClose/onEvent 각각에서 오래된 연결 콜백을 무시한다.
const current = () => !this.#stopped && generation === this.#subscriptionGeneration;
```

`onClose`에서 current 확인 → 현재 연결 해제 → 재시도 게이트 fail → 기존 retry timer 취소 → 하나의 timer 예약. `onReady`에서 ready와 timer 취소. start 중복 호출은 no-op. stop은 generation 증가 후 모든 timer/socket 정리. 진행 중 refresh에는 lifecycle generation을 캡처하여 stop 뒤 결과 반영을 막되, start 전 수동 refresh 기능은 유지한다.

`pane_not_found`이면 다음 시도는 global lifecycle 항목만 구독하여 정상 pane 이벤트까지 모두 잃지 않게 한다. 최신 목록에 기반한 개별 pane 구독 복원은 별도 30/60/120초 probe 게이트로 제한한다. global 구독 성공이 개별 pane 실패 backoff를 초기화해서는 안 된다. pane 목록은 Set으로 중복 제거. 복구 성공 시 한 번 info, 동일 오류는 상태 전환 시 한 번 warn, 반복 횟수는 debug/복구 요약에만 기록한다.

Socket은 5초 handshake timeout을 두고 onReady/close/stop에서 타이머를 정리한다. close callback은 정확히 한 번만 호출한다. CLI `agent list` 조회에는 10초 프로세스 timeout을 지정하되, `agent prompt --wait`의 기존 긴 timeout에 이 제한을 일괄 적용하지 않는다.

- [ ] **Step 5: fake socket에 거부/무응답/지연 close 제어를 추가하고 회귀 테스트.** 거부 응답은 아래와 동일해야 한다.

```ts
socket.write(JSON.stringify({ id: request.id, error: {
  code: "pane_not_found", message: "pane w5:p1 not found"
}}) + "\n");
```

검증: 5초 refresh마다 재접속하지 않음, global fallback 이벤트로 refresh 가능, 30초 내 probe 중복 없음, 이전 close가 새 연결을 null로 만들지 않음, stop 뒤 콜백 없음, 응답 없는 list/handshake에서 영구 정지하지 않음. fake timer 또는 주입된 clock을 사용하고 테스트를 실제 30초 기다리게 만들지 않는다.

- [ ] **Step 6: `node --test core/test/subscription-retry.test.ts core/test/status-mirror.test.ts core/test/herdr-socket.test.ts core/test/herdr-cli.test.ts` → PASS.**
- [ ] **Step 7: 변경 diff를 검토하고 이 Task 파일의 변경 hunk만 커밋.** 제안 메시지: `fix: isolate herdr subscription retries from polling`. 기존 사용자 변경은 포함하지 않는다.

실제 pane 거부의 원인 확인은 Task 8에서 설치 버전/동일 세션/socket을 비교한다. `w5:`를 임의로 잘라내거나 사용자 pane/profile을 삭제하는 해결책은 사용하지 않는다.

## Task 2: 읽음 ACK를 transcript 로딩과 분리

**Files:**

- Create: `core/src/model/read-state.ts`, `renderer/src/production/read-receipt-controller.ts`
- Modify: `core/src/store/view-state-store.ts`, `core/src/services/chat-service.ts`, `core/src/model/summaries.ts`, `core/src/coordinator/dispatcher.ts`
- Modify: `renderer/src/production/ProductionRenderer.tsx`, `renderer/src/production/model.ts`, `renderer/src/shared/rpc/coordinator.ts`
- Test: `core/test/read-state.test.ts`, `core/test/view-state-store.test.ts`, `core/test/chat-service.test.ts`, `core/test/coordinator-dispatcher.test.ts`, `renderer/test/read-receipt-controller.test.ts`

**Interfaces:**

- 저장/summary 추가 필드: `lastReadSeq: number`, `lastIncomingSeq: number`, `lastMessageAt: number`.
- RPC `herdrBot.markChatRead({ id: string, throughSeq: number }): { lastReadSeq: number }`.
- Renderer controller `acknowledge(id: string, throughSeq: number): Promise<void>`는 채팅별 최고 성공 순번/진행 중 요청을 추적한다. 실패한 순번은 성공 캐시에 넣지 않는다.
- `openAgentTail`은 조회만 담당한다. 과거 페이지 조회/검색 결과 프리로드로 읽음이 바뀌지 않는다.

- [ ] **Step 1: 순번 경합 실패 테스트 추가.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRead, hasUnread } from "../src/model/read-state.ts";
test("old acknowledgement cannot consume newer messages", () => {
  const state = { lastReadSeq: 3, lastIncomingSeq: 5, isManuallyUnread: true };
  const read = applyRead(state, 4, 5);
  assert.equal(read.lastReadSeq, 4);
  assert.equal(hasUnread(read), true);
  assert.equal(hasUnread(applyRead(read, 5, 5)), false);
  assert.equal(applyRead(read, 2, 5).lastReadSeq, 4);
});
```

- [ ] **Step 2: `node --test core/test/read-state.test.ts` → 신규 모듈 부재 FAIL.**
- [ ] **Step 3: 읽음 모델 구현.**

```ts
export interface ReadState {
  lastReadSeq: number;
  lastIncomingSeq: number;
  isManuallyUnread: boolean;
}
export function applyRead<T extends ReadState>(state: T, throughSeq: number, latestSeq: number): T {
  if (!Number.isSafeInteger(throughSeq) || throughSeq < 0) throw new Error("invalid read sequence");
  return { ...state, lastReadSeq: Math.max(state.lastReadSeq, Math.min(throughSeq, latestSeq)), isManuallyUnread: false };
}
export function hasUnread(state: ReadState): boolean {
  return state.isManuallyUnread || state.lastIncomingSeq > state.lastReadSeq;
}
```

- [ ] **Step 4: 저장·RPC·renderer 통합.** 수신 봇 메시지(`send-message`)만 `lastIncomingSeq`를 올린다. 송신으로 최신 수신 전체를 자동 읽음 처리하던 `appendUser` 부수효과는 제거한다. `setAgentUnread(false)`는 현재 마지막 seq까지 ACK하는 명시적 읽음 동작으로 연결한다.

기존 저장 파일은 seq 필드 유무로 마이그레이션: transcript 중 `timestampMs <= lastViewedAt`인 최대 seq를 lastReadSeq로, 마지막 send-message seq를 lastIncomingSeq로 계산한다. 마지막 message/send-message의 timestamp를 lastMessageAt으로 복원하고 수동 unread는 보존한다. transcript가 비었으면 모두 0. 기존 timestamp 필드는 호환성을 위해 유지한다.

Renderer는 raw entry의 숫자 seq를 보존한다. 최초 로드 완료, 캐시 재방문, 활성 채팅 append 반영, window focus/visibility 복귀에서 아래 gate를 사용한다. 캐시 재방문은 최신 tail과 이벤트 스트림을 재동기화하고 transcript를 id/seq로 merge한다. 오래된 응답이 더 최신 append를 덮어쓰지 않게 한다.

```ts
const canAcknowledge = (selected: boolean, loaded: boolean, visible: boolean, focused: boolean) =>
  selected && loaded && visible && focused;
```

서버 요청 시각이나 summary의 최신 seq가 아니라 **실제로 로드해 반영한 페이지의 최대 seq**를 보낸다. 진행 중 새 seq가 생기면 완료 후 더 높은 ACK 한 번을 보낸다. 실패하면 unread 유지, 연결 복구/다음 진입 때 재시도한다. 채팅 선택 generation이 바뀐 늦은 로드 응답은 읽음 처리하지 않는다.

- [ ] **Step 5: controller 테스트에 캐시 재방문, 비활성 수신, 백그라운드 창, A→B 빠른 전환, ACK 실패/재연결, 같은 ms 수신을 추가.** 각 경우 예상 watermark를 명시하여 검증한다: loaded=4/newIncoming=5이면 ACK 4와 unread true; focus 복귀 후 loaded=5이면 ACK 5와 false.
- [ ] **Step 6: `node --test core/test/read-state.test.ts core/test/view-state-store.test.ts core/test/chat-service.test.ts core/test/coordinator-dispatcher.test.ts renderer/test/read-receipt-controller.test.ts` → PASS.**
- [ ] **Step 7: hunk 단위 검토·커밋.** `fix: acknowledge viewed chats independently of transcript cache`.

## Task 3: 최신 메시지순과 초록 활동 점

**Files:**

- Create: `renderer/src/production/bot-activity.ts`
- Modify: `core/src/services/chat-service.ts`, `renderer/src/production/model.ts`, `renderer/src/production/sidebar-model.ts`, `renderer/src/production/ProductionRenderer.tsx`, `renderer/src/production/AgentRowActions.tsx`
- Modify: `renderer/src/recovered/features/conversation/workspace/sidebar.tsx`, `renderer/src/recovered/features/conversation/workspace/sidebar-agent-status.ts`, `renderer/src/production/minimal.css`
- Test: `renderer/test/bot-activity.test.ts`, `renderer/test/sidebar-model.test.ts`, `core/test/chat-service.test.ts`

**Interfaces:**

- `ActivityState = { status: string; visibleUntil: number }`.
- `updateActivity(previous, status, now)`와 `activityVisible(state, now)`는 순수 함수.
- `sortRecentChats<T extends { id: string; lastMessageAt: number; createdAt: number }>(agents: readonly T[]): T[]`.
- RendererAgent에 검증된 `runtimeStatus: string`, `lastMessageAt: number`를 추가. `runtimeStatus`는 raw `herdrBot.status`에서만 투영한다.

- [ ] **Step 1: done 잔상 경계 테스트.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { updateActivity, activityVisible } from "../src/production/bot-activity.ts";
test("done fades five seconds after working, without restarting on repeats", () => {
  const working = updateActivity(undefined, "working", 0);
  const done = updateActivity(working, "done", 100);
  assert.equal(activityVisible(done, 5_099), true);
  assert.equal(activityVisible(done, 5_100), false);
  assert.deepEqual(updateActivity(done, "done", 2_000), done);
  assert.equal(activityVisible(updateActivity(undefined, "done", 0), 0), false);
  assert.equal(activityVisible(updateActivity(done, "blocked", 200), 200), false);
});
```

- [ ] **Step 2: `node --test renderer/test/bot-activity.test.ts` → FAIL.**
- [ ] **Step 3: 활동 모델 및 최신순 비교 함수 구현.**

```ts
export interface ActivityState { status: string; visibleUntil: number }
export function updateActivity(previous: ActivityState | undefined, status: string, now: number): ActivityState {
  if (previous?.status === status) return previous;
  return { status, visibleUntil: status === "done" && previous?.status === "working" ? now + 5_000 : 0 };
}
export function activityVisible(state: ActivityState, now: number): boolean {
  return state.status === "working" || (state.status === "done" && now < state.visibleUntil);
}
```

```ts
export function sortRecentChats<T extends { id: string; lastMessageAt: number; createdAt: number }>(agents: readonly T[]): T[] {
  return [...agents].sort((a, b) =>
    (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)
    || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: 모든 목록 snapshot/추가 이벤트에 동일 정렬 함수를 연결.** host의 새 메시지 활동 시각은 전체 채팅의 현재 lastMessageAt 최대값보다 최소 1 크게 부여하여 동일 ms 수신 순서를 보장한다. notice/update/ACK에는 부여하지 않는다. 초기 목록과 재연결 목록에도 동일 정렬을 적용한다.

활동 map은 sidebar 행이 아닌 root 수명주기에 둔다. 가장 빠른 visibleUntil에 timer 하나를 예약해 재렌더하고 재작업/삭제/unmount 시 정리한다. 반복 done upsert로 timer를 연장하지 않는다. 연결을 잃으면 점을 숨기고 stale 상태를 표시한다. 복귀 후 이미 done인 snapshot에는 새 잔상을 부여하지 않는다.

초록 점과 파란 점 DOM을 분리한다. 초록은 avatar wrapper 우하단, 파랑은 행 trailing 위치. blocked 표시가 green을 blue로 바꾸지 않는다. collapsed에서도 두 점이 겹치지 않도록 파랑은 별도 오른쪽 위 위치로 둔다.

```css
.herdr-avatar-wrap { position: relative; flex: 0 0 auto; }
.herdr-working-dot {
  position: absolute; right: 0; bottom: 0;
  width: 8px; height: 8px; border-radius: 50%;
  background: #22c55e; box-shadow: 0 0 0 2px var(--herdr-surface);
}
```

`--herdr-surface`는 minimal.css의 실제 light/dark 행 배경색에 각각 연결한다. `aria-label`은 locale별 `작업 중`/`Working`, done 잔상은 `작업 완료`/`Done`로 구분한다.

- [ ] **Step 5: 정렬 회귀 테스트.** Bot A(messageAt=10), 그룹 B(20), Bot C(15)는 B/C/A. A 이름 변경·읽음·working 변화 후에도 B/C/A. A의 새 수신 후 A/B/C. 임시 행은 목록 외부에서 위에 유지. unread=true와 working=true 동시 표시를 DOM에서 확인한다.
- [ ] **Step 6: `node --test renderer/test/bot-activity.test.ts renderer/test/sidebar-model.test.ts core/test/chat-service.test.ts` → PASS.**
- [ ] **Step 7: hunk 단위 검토·커밋.** `feat: show recent chats and independent bot activity indicators`.

## Task 4: 빠른 생성과 실제 에이전트의 첫 인사

**Files:**

- Create: `core/src/bots/onboarding.ts`, `core/src/services/bot-onboarding-service.ts`
- Modify: `core/src/store/profile-store.ts`, `core/src/services/roster-service.ts`, `core/src/services/turn-service.ts`, `core/src/bots/prompts.ts`, `core/src/services/chat-service.ts`, `core/src/model/summaries.ts`, `core/src/host.ts`, `core/src/coordinator/dispatcher.ts`, `renderer/src/production/model.ts`
- Test: `core/test/onboarding.test.ts`, `core/test/bot-onboarding-service.test.ts`, `core/test/profile-store.test.ts`, `core/test/roster-service.test.ts`, `core/test/coordinator-dispatcher.test.ts`

**Interfaces:**

```ts
export type OnboardingStage = "provisioning" | "briefing" | "greeting" | "ready" | "failed";
export interface BotOnboarding {
  requestId: string;
  locale: "ko" | "en";
  stage: OnboardingStage;
  error: string | null;
}
// Profile에 선택적 onboarding 필드 추가. 기존 봇에는 초기화를 강제하지 않는다.
export interface QuickCreateRequest { requestId: string; locale: "ko" | "en" }
```

- RPC `herdrBot.quickCreateBot(QuickCreateRequest)` → `{ agent: AgentSummary }`. 예약 profile 저장 후 응답하며 spawn/brief 완료를 기다리지 않는다.
- RPC `herdrBot.retryBotSetup({ id: string })` → `{ agent: AgentSummary }`. 새 profile을 만들지 않는다.
- `BotOnboardingService.create(request): BotProfile`, `.retry(id): BotProfile`, `.stop(): void`.
- profile의 onboarding 정보는 summary.herdrBot와 renderer까지 선택적 필드로 전달한다.

- [ ] **Step 1: 인사 prompt 실패 테스트 작성.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingText, buildGreetingPrompt } from "../src/bots/onboarding.ts";
test("onboarding starts without inventing a user message", () => {
  const prompt = buildGreetingPrompt("bot-abc", "ko");
  assert.ok(prompt.includes(greetingText("ko")));
  assert.ok(prompt.includes("bot-abc"));
  assert.ok(prompt.includes("not a user message"));
});
```

- [ ] **Step 2: `node --test core/test/onboarding.test.ts` → FAIL.**
- [ ] **Step 3: 인사 prompt 구현.** 실제 실행 경로는 기존 runBotTurn의 turnInstructions 및 cliPath를 사용한다. 아래 함수는 추가 지시문만 만든다.

```ts
export function greetingText(locale: "ko" | "en"): string {
  return locale === "ko"
    ? "안녕하세요. 앞으로 같이 일할 준비가 됐어요. 제일 먼저, 저를 어떤 일에 가장 쓰고 싶으세요?"
    : "Hello. I’m ready to work with you. First, what would you most like to use me for?";
}
export function buildGreetingPrompt(chatId: string, locale: "ko" | "en"): string {
  return [
    "[herdr-bot onboarding] This is an internal setup instruction, not a user message.",
    `Send exactly one message to your own DM ${JSON.stringify(chatId)} using the instructed say command.`,
    `The exact message is: ${JSON.stringify(greetingText(locale))}`,
    "Do not edit files, invoke external services, or perform a task yet. Wait for the user's answer.",
    "After their answer, develop your role conversationally. Do not claim a profile change was saved unless it was.",
  ].join("\n");
}
```

- [ ] **Step 4: 즉시 예약과 비동기 provision 분리.** `requestId`는 renderer에서 만든 UUID이며 host가 형식 검증한다. `id = bot-<requestId>`로 결정하고 동일 id가 이미 있으면 같은 profile을 반환한다. UUID는 생성 버튼 연타/timeout retry 동안 재사용한다. 기존 일반 createBot API는 유지하고 공통 spawn/brief 로직을 재사용한다.

예약 profile은 herdr 참조 null, description 빈 문자열, permissionMode ask, stage provisioning으로 먼저 저장한다. 기존 createBot의 duplicate 검사에 예약 profile을 다시 통과시키지 않도록 별도 `provisionReservedBot(id)` 경로를 둔다. pane 생성 직후 ID를 저장하고 다음 단계로 넘어간다. spawn 응답 유실 시 같은 세션에서 bot ID의 named agent를 조회한 후 재사용한다. host 재시작 때 중간 단계는 failed/retry 상태로 복원하여 자동 중복 시작을 피한다.

- [ ] **Step 5: brief → greeting을 순차 실행.** 기존 brief 실패는 로그만 남기므로 quick-create 경로에서는 성공/실패를 받도록 반환형을 분리한다. 실패 시 greeting을 시작하지 않는다. 성공 후 같은 bot 실행 잠금 아래 `runBotTurn`에 DM prompt + buildGreetingPrompt를 전달한다. 일반 DM send와 그룹 turn도 같은 bot 실행 잠금을 확인하여 준비 중 prompt가 겹치지 않게 한다. 그룹 초대는 ready 봇만 허용한다.

greeting 상태의 `handleSay`는 실제 pane 소유자와 자신의 DM인지 기존 검증을 거친다. 정확한 greetingText를 첫 메시지로 저장하고 `origin: "onboarding"`, `onboardingKey: requestId`를 같은 transcript entry에 기록한다. 해당 key의 entry가 있으면 재추가하지 않고 기존 entryId를 반환한다. expected text가 아닌 응답은 setup 오류로 보여주고 재시도를 제공한다. 일반 대화 say의 내용은 수정하지 않는다.

인사 entry 저장 뒤 profile stage를 ready로 바꾼다. 그 사이 crash가 나도 재시작/재시도에서 transcript key를 먼저 확인하여 ready로 복원한다. 인사 전에 실패하면 failed. 인사가 이미 저장된 후 CLI wait 오류는 setup 실패로 되돌리지 않는다. 로그인/승인 대기가 필요한 경우 원인과 기존 herdr pane 열기 동작을 제공한다. stop/delete 후 비동기 결과는 profile을 되살리지 않는다.

- [ ] **Step 6: 서비스 회귀 테스트 작성.** deferred fake agentStart로 RPC 응답이 spawn보다 먼저 옴을 검증. 동일 UUID 동시 호출은 profile 1개/spawn 1회. brief 실패 시 say 0회. 성공 시 user entry 0개/greeting entry 1개. 중복 say/재시작 시 greeting 1개. 다른 Bot/그룹으로 onboarding say를 보내면 거부. 준비 중 삭제 후 roster 재등장 0회.
- [ ] **Step 7: `node --test core/test/onboarding.test.ts core/test/bot-onboarding-service.test.ts core/test/profile-store.test.ts core/test/roster-service.test.ts core/test/coordinator-dispatcher.test.ts` → PASS.**
- [ ] **Step 8: hunk 단위 검토·커밋.** `feat: provision bots asynchronously with an onboarding greeting`.

## Task 5: 헤더 기반 새 채팅 UI

**Files:**

- Create: `renderer/src/production/new-chat-model.ts`, `renderer/src/production/NewChatHeader.tsx`
- Modify: `renderer/src/production/ProductionRenderer.tsx`, `renderer/src/recovered/features/conversation/workspace/sidebar.tsx`, `renderer/src/recovered/features/conversation/workspace/chat-header.tsx`, `renderer/src/production/locale.ts`, `renderer/src/production/minimal.css`
- Modify: `core/src/coordinator/dispatcher.ts`, `core/src/services/roster-service.ts`, `core/src/store/room-store.ts` — 그룹 생성 requestId 중복 방지 및 멤버 재검증.
- Disconnect: `renderer/src/production/NewChatDialog.tsx`의 UI 진입점. 재사용 타입을 먼저 분리하고 이번 Task에서 무관한 API/파일을 일괄 삭제하지 않는다.
- Test: `renderer/test/new-chat-model.test.ts`, `renderer/test/new-chat-header.test.ts`, `core/test/coordinator-dispatcher.test.ts`, `core/test/room-store.test.ts`

**Interfaces:**

```ts
export interface NewChatDraft {
  requestId: string;
  mode: "choose" | "group";
  query: string;
  memberIds: readonly string[];
}
export function addDraftMember(draft: NewChatDraft, id: string): NewChatDraft {
  if (draft.memberIds.includes(id) || draft.memberIds.length >= 6) return draft;
  return { ...draft, memberIds: [...draft.memberIds, id], query: "" };
}
export function removeDraftMember(draft: NewChatDraft, id: string): NewChatDraft {
  return { ...draft, memberIds: draft.memberIds.filter(memberId => memberId !== id) };
}
export function canCreateGroup(draft: NewChatDraft): boolean {
  return draft.mode === "group" && draft.memberIds.length >= 2 && draft.memberIds.length <= 6;
}
```

`NewChatHeader`는 draft, 기존 봇 후보, pending/error, onChange/onCreateBot/onCreateGroup/onOpenBot/onCancel callbacks를 받는다. 부수효과와 RPC는 root에서 처리한다. 아바타는 기존 `AgentAvatar`를 이용한다.

- [ ] **Step 1: chip 중복·삭제 테스트 작성.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDraftMember, removeDraftMember, canCreateGroup } from "../src/production/new-chat-model.ts";
test("group chips toggle membership without duplicates", () => {
  const draft = { requestId: "request-1", mode: "group" as const, query: "", memberIds: [] };
  const one = addDraftMember(draft, "a");
  assert.deepEqual(addDraftMember(one, "a").memberIds, ["a"]);
  const two = addDraftMember(one, "b");
  assert.equal(canCreateGroup(two), true);
  assert.equal(canCreateGroup(removeDraftMember(two, "a")), false);
});
```

- [ ] **Step 2: `node --test renderer/test/new-chat-model.test.ts` → FAIL.**
- [ ] **Step 3: 위 순수 모델 작성, dropdown/chip component 구현.** wrapper는 아래 구조를 사용한다.

```tsx
<div className="herdr-new-chat-combobox">
  {selectedBots.map(bot => <span className="herdr-member-chip" key={bot.id}>
    <AgentAvatar agentId={bot.id} name={bot.name} size="sm" isStatic />
    <span>{bot.name}</span>
    <button type="button" aria-label={`${bot.name} ${t("Remove")}`}
      onClick={() => onRemove(bot.id)}>×</button>
  </span>)}
  <input ref={inputRef} role="combobox" aria-label={t("Search or create a Bot")}
    aria-expanded={isOpen} aria-controls="new-chat-options" aria-autocomplete="list"
    aria-activedescendant={activeOptionId}
    placeholder={t("Search or create a Bot")} value={draft.query}
    onFocus={() => setIsOpen(true)} onChange={event => onQuery(event.target.value)} />
</div>
```

`selectedBots`는 draft.memberIds 순서로 후보에서 조회한 목록, `onRemove`는 removeDraftMember 후 input focus, `onQuery`는 query 업데이트다. 아바타 dataUrl/shape/color도 기존 sidebar와 같은 props로 전달한다. dropdown은 아래 absolute 위치, 화면 경계 안 max-height 및 overflow-y:auto. header의 Electron drag 영역에서 input/chip/dropdown/button은 `-webkit-app-region: no-drag`.

- [ ] **Step 4: +/키보드 shortcut/command 진입점을 draft 생성 하나로 통합.** draft는 별도 state로 두고 fake agent를 실제 roster 배열에 넣지 않는다. sidebar 최상단 임시 행에 `aria-current`를 표시한다. 일반 header/transcript 대신 NewChatHeader와 안내를 렌더한다. 선택/생성 완료는 기존 openAgent 흐름에 연결한다.

새 Bot 클릭은 pending 동안 재호출을 막고 Task 4 UUID RPC를 호출한다. 응답 후 실제 Bot을 선택하되 사용자가 이미 다른 화면으로 이동했으면 선택을 강제로 되돌리지 않는다. 실패 시 draft/UUID를 유지한다. 그룹 submit은 `createGroup`에 이름과 검증된 memberIds, 선택적 requestId를 보낸다. room의 선택적 creationRequestId에 이를 저장하고 coordinator는 동일 요청의 기존 room을 먼저 조회하여 반환한다. timeout 재시도는 같은 요청으로 처리하며 기존 requestId 없는 호출은 호환성을 유지한다. 삭제되거나 준비 중인 멤버는 submit 직전 host에서 거부하고 UI에서 제거 안내한다.

- [ ] **Step 5: UI 회귀 검증.** + 3회에 draft 1개, 검색에서 기존 DM 열기 시 생성 0회, x 제거 후 focus 복귀, 멤버 0/1명 생성 불가, 6명 초과 불가, IME Enter로 생성 안 됨, RPC 실패 후 chip 유지, Bot 생성 중 이동해도 뒤늦은 화면 강탈 없음.
- [ ] **Step 6: `node --test renderer/test/new-chat-model.test.ts renderer/test/new-chat-header.test.ts core/test/coordinator-dispatcher.test.ts core/test/room-store.test.ts` 및 `npm run renderer:typecheck` → PASS.** 실제 focus/클릭 검증은 Task 8에서 수행한다.
- [ ] **Step 7: hunk 단위 검토·커밋.** `feat: create chats from an inline header picker`.

## Task 6: 아바타와 전체 멘션

**Files:**

- Modify: `renderer/src/production/ProductionRenderer.tsx`, `renderer/src/recovered/features/conversation/workspace/editor-suggestion-provider.ts`, `renderer/src/recovered/features/conversation/workspace/rich-text-editor.tsx`, `renderer/src/production/minimal.css`, `renderer/src/production/locale.ts`
- Test: `renderer/test/mention-polish.test.ts`, `core/test/group-chat.test.ts`

**Interfaces:**

- suggestion icon에 `agentId`, `name`, `dataUrl`, `shape`, `color`의 선택적 avatar 정보 추가.
- `__everyone__`의 표시 label은 `전체`/`Everyone`, 삽입 label은 항상 `everyone`. backend가 받는 plain text는 `@everyone` 유지.
- `prioritizeEveryone<T extends { id: string }>(entries: readonly T[]): T[]`는 필터·최근 사용 점수 계산 뒤 적용한다.

- [ ] **Step 1: 전체 항목이 최종 정렬에서도 선두인지 테스트.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { prioritizeEveryone } from "../src/recovered/features/conversation/workspace/editor-suggestion-provider.ts";
test("everyone stays first after recency ranking", () => {
  assert.deepEqual(prioritizeEveryone([{ id: "a" }, { id: "__everyone__" }, { id: "b" }])
    .map(item => item.id), ["__everyone__", "a", "b"]);
});
```

- [ ] **Step 2: `node --test renderer/test/mention-polish.test.ts` → FAIL.**
- [ ] **Step 3: 최종 정렬 및 avatar 전달 구현.**

```ts
export function prioritizeEveryone<T extends { id: string }>(entries: readonly T[]): T[] {
  return [...entries.filter(entry => entry.id === "__everyone__"),
    ...entries.filter(entry => entry.id !== "__everyone__")];
}
```

그룹에서는 현재 멤버만 후보로 사용하고 전체 항목을 추가한다. DM에서는 상대 봇과 전체(실제 수신 범위는 그 DM의 봇 한 명)로 제한한다. `전체`, `everyone`, `all` 검색어를 모두 등록한다. 비어 있지 않은 검색에서는 일치 항목만 보여주되 전체가 일치하면 최상단에 둔다.

수동 DOM suggestion renderer의 row에 avatar 컨테이너를 추가하고 기존 React `AgentAvatar`를 `react-dom/client` root로 렌더한다. row 갱신/닫기/destroy에서 root를 반드시 unmount한 뒤 DOM을 제거한다. 다른 workflow/emoji dropdown은 변경하지 않는다. 전체 항목은 기존 group avatar를 이용한다. 아바타는 정적 `size="sm"`, 장식용으로 aria-hidden 처리한다.

```css
.sand-mention-option-button {
  display: flex; align-items: center; gap: 8px;
  min-height: 32px; padding: 4px 10px;
}
.herdr-mention-avatar { width: 22px; height: 22px; flex: 0 0 22px; }
```

- [ ] **Step 4: 이름 외 avatar data도 projection 테스트, 전체 선택 시 insert.label="everyone" 검증.** 그룹 외 봇 제외, 중복 이름 ID 구분, 0명 상태 안내, 위/아래 방향키·Enter·Escape 기존 동작 유지. 실제 목록 높이/아바타 위치는 Task 8에서 확인한다.
- [ ] **Step 5: `node --test renderer/test/mention-polish.test.ts core/test/group-chat.test.ts` 및 `npm run renderer:typecheck` → PASS.**
- [ ] **Step 6: hunk 단위 검토·커밋.** `feat: add avatars and prioritize everyone in mentions`.

## Task 7: 창 크기 및 실행 경로

**Files:**

- Modify: `desktop/src/window-chrome.ts`, `desktop/test/window-chrome.test.ts`, `package.json`
- Test: `desktop/test/start-script.test.ts` (새 파일)

**Interfaces:** `DEFAULT_WINDOW_SIZE` 이름과 소비하는 BrowserWindow 경로는 유지한다.

- [ ] **Step 1: 기존 window 테스트의 기대값을 1040/760으로 수정.**

```ts
assert.deepEqual(DEFAULT_WINDOW_SIZE, { width: 1040, height: 760 });
```

- [ ] **Step 2: `node --test desktop/test/window-chrome.test.ts` → 크기 비교 FAIL.**
- [ ] **Step 3: 상수와 실행 script 수정.**

```ts
export const DEFAULT_WINDOW_SIZE = { width: 1040, height: 760 };
```

```json
"desktop:start": "npm run desktop:build && npm run start -w @herdr-bot/desktop"
```

현재 desktop:start는 desktop만 빌드하므로 renderer 수정 후 오래된 화면을 실행할 수 있다. 기존 desktop:build가 renderer와 desktop을 모두 빌드하므로 재사용한다. 사용자 로그의 실제 명령은 `npm run desktop:start`; `start:desktop` alias는 필요하지 않다. `desktop:dev`의 Vite 개발 경로는 유지한다.

- [ ] **Step 4: script 회귀 테스트 추가.**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("desktop start builds both bundles", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["desktop:start"], "npm run desktop:build && npm run start -w @herdr-bot/desktop");
});
```

- [ ] **Step 5: `node --test desktop/test/window-chrome.test.ts desktop/test/start-script.test.ts` → PASS.**
- [ ] **Step 6: hunk 단위 검토·커밋.** `fix: start desktop with fresh assets at the intended window size`.

## Task 8: 통합 검증과 로그 원인 확정

**Files:**

- Create: `docs/superpowers/verification/2026-09-11-chat-interaction-polish.md` — 구현 시 실제 실행 결과/버전/재현 여부 기록.
- 필요 시 앞 Task 테스트에 실패 재현 케이스를 추가하고 해당 구현을 보완한다. 이번 계획 작성 단계에서는 검증 결과를 미리 성공으로 기록하지 않는다.

- [ ] **Step 1: 정적/자동 검증.**

```bash
npm run check
npm run desktop:build
```

예상: typecheck와 전체 node:test PASS, renderer/desktop build 성공. 기존 bundler warning과 신규 회귀는 구분해서 기록한다.

- [ ] **Step 2: 가짜 herdr UI 실행 검증.**

```bash
npm run desktop:dev:fake
```

이 script의 기존 서버 연결 지시를 따른다. 실제 agent 없이도 A/B Bot과 그룹 메시지 이벤트, working/done, 실패/재연결을 주입하여 아래 시나리오를 확인한다. 필요한 fake 기능은 `scripts/dev-fake-herdr.mjs`에 해당 시나리오만 추가한다.

| 시나리오 | 통과 조건 |
| --- | --- |
| B에서 수신 후 캐시된 B 재방문 | B 최상단, 진입 후 파란 점 제거, 재실행 후도 읽음 유지 |
| 창 비활성 중 현재 채팅 수신 | 파란 점 유지, 포커스 복귀+로드 후 제거 |
| A 열기 요청 중 B 선택 | 늦은 A 응답으로 B 화면/읽음 상태 변경 없음 |
| working+unread 동시 | 우하단 초록/행 오른쪽 파랑 동시 표시 |
| working→done | 4,999ms까지 초록, 5,000ms에 제거 |
| done 잔상 중 working 재진입 | 이전 timer가 새 working 점을 지우지 않음 |
| + 및 header 선택 | 모달 없음, 임시 행 1개, input focus, 두 생성 액션 |
| 그룹 6개 chip | 줄바꿈/삭제/키보드 동작, dropdown 화면 밖 잘림 없음 |
| 새 Bot 초기 생성 | profile 즉시 표시, 준비 상태 명확, 첫 인사 한 번, 사용자 말풍선 없음 |
| setup 실패/재시도 | 같은 Bot ID 유지, 중복 pane/인사 없음 |
| @ 목록 | 전체 선두, avatar+이름 정렬, 32px 행, Enter 선택 후 메시지 오발송 없음 |
| ko/en × light/dark × 1040×760 | input·chip·아이콘 정렬, 대비, dropdown 위치 정상 |
| 512×520 최소 크기 | 헤더/입력창 겹침 없음, 멤버 목록 스크롤 가능 |

- [ ] **Step 3: 설치된 herdr의 읽기 전용 사실 확인.**

```bash
herdr --version
herdr --session herdr-bot agent list
herdr --session herdr-bot agent get w5:p1
```

agent list에 해당 pane이 없는 경우 stale target임을 기록한다. CLI에서는 조회되는데 socket에서는 거부되면 host가 resolve한 session/socket과 CLI runner의 session 및 `HERDR_SOCKET_PATH` override를 비교한다. socket의 `pane.get` read 요청도 같은 pane ID로 보내 API 응답 code를 기록한다. 이 검증을 위해 에이전트/pane 삭제나 사용자 session 재생성은 하지 않는다. 설정 값 기록은 session/socket/ID에 한정하며 환경 전체나 토큰을 덤프하지 않는다.

- [ ] **Step 4: 실제 앱을 실행하고 최소 2분 로그 관찰.**

```bash
npm run desktop:start
```

예상: 정상 상태에 반복 warn 없음. pane 부재 재현 시 warn 1회와 폴링 복구, 30/60/120초 제한 재시도. 앱 종료 후 host의 앱 소유 timer/socket 해제. 공유 herdr 세션이나 다른 에이전트는 종료하지 않는다. 실제 새 Bot 생성/모델 호출 검증은 구현 실행에 대한 사용자 허용 범위에서 테스트용 Bot 하나로 수행하고 생성 대상/비용 가능성을 먼저 알린다.

- [ ] **Step 5: macOS 입력기 로그 분리 검증.** OS/Electron 버전을 기록하고 한국어 조합, 영문↔한글 전환, Caps Lock, 창 blur/focus, 멘션 Enter를 각각 실행한다. 입력 유실·멈춤·크래시 동반 여부와 해당 로그 시각을 매칭한다. 실제 장애가 없으면 관찰된 비치명 진단으로 기록하고 숨기지 않는다. 장애가 있으면 최소 재현과 관련 Electron 수정 근거를 확인한 후 별도 버전 변경안을 제시한다.
- [ ] **Step 6: 문서에 실제 결과와 남은 제한을 기록하고 최종 diff를 검토.** 모든 요구 행에 PASS/FAIL과 증거를 남긴다. 실패 항목이 있으면 완료로 보고하지 않는다.

## 계획 자체 검토

- 요구사항 7개 모두 Task 및 통합 검증 시나리오에 매핑했다.
- unread와 working 표시의 데이터 의미/위치를 분리했다.
- modal 제거만으로 해결되지 않는 기본값·그룹 확정·자동 인사 실행 경로를 정했다.
- 로그에서 확인된 재시도 결함과 아직 미확정인 pane 거부의 원인을 구별했다.
- 외부 도구 연결과 자동 프로필 변경 권한은 추가하지 않는다.
- 구현 전 조정 가능한 핵심 제안: 단일 최신순 목록(기존 pin/section 우선권 없음), 그룹 2~6명+`채팅 시작`, 기존 기본 AI 도구 사용.

## 인계

이번에는 계획만 저장한다. 구현 승인을 받으면 Task 1부터 순서대로 진행한다. 별도 에이전트 위임은 사용자가 선택한 경우에만 수행한다. 현재 설치된 스킬 이름이 헤더의 superpowers 이름과 다르면 동등한 설치 스킬의 가용성을 확인하고, 없으면 이를 알린 뒤 인라인 실행한다.
