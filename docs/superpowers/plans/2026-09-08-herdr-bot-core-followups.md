# herdr-bot Core — 후속 작업 목록

코어 플랜(`2026-09-08-herdr-bot-core.md`) 실행이 `main`에 머지된 시점(커밋 `7abf152`, 테스트 101개 통과)에서, 태스크별 리뷰와 브랜치 전체 최종 리뷰가 "나중에 고쳐도 되는 것"으로 분류한 항목이다. 최종 리뷰가 머지 전 필수로 본 6건(캐시 미제거, 에러 코드 매핑, 이벤트 리스너 가드, 50줄 초과 함수 2개, `agent start` 재시도)은 이미 반영됐다.

## 나중에 고칠 것 (fix later)

- `core/src/herdr/cli.ts`: `execFile`에 Node 쪽 타임아웃이 없다. herdr 자식 프로세스가 `--timeout`을 무시하고 멈추면 프라미스가 영원히 대기한다. `host.stop()`이 `mirror.refresh()`를 기다리는 것과 겹치면 종료가 멈출 수 있다.
- `core/src/services/run-queue.ts`: `isRunning`은 자기 테스트 외에는 호출처가 없다. 제거하거나 `status()`에 연결한다.
- `core/src/host.ts`: `HostOverrides`에 `sleep` 오버라이드가 없어 호스트 레벨 `herdr_error` 테스트가 실제 백오프(~1.3초)를 기다린다. `RosterService`가 이미 `sleep` 의존성을 받으므로 한 줄 배선이면 된다.
- `cli/src/main.ts` `printTranscript`: 시간이 UTC(`toISOString`)로 찍힌다. 로컬 시간으로 바꾼다.
- `core/test/turn-service.test.ts`: `[herdr-bot:turn]` stderr 로그 두 줄이 새어 나온다. `setLogSink`로 막고 `finally`에서 복구한다. `roster-service.test.ts`의 한 줄도 같다.
- `core/src/store/json-file.ts` / `transcript-store.ts`: 임시 파일 후 rename 패턴이 세 번 반복된다. `writeAtomic` 헬퍼로 뽑는다. `TranscriptStore.path`/`nextSeq`는 브리프 인터페이스 밖의 공개 표면이다.
- `core/src/store/profile-store.ts` / `room-store.ts`: `isRecord`, `listDirectories`가 중복이다.
- `core/src/group/group-chat.ts:78`: `@everyone`/`@all`의 앞 경계 정규식이 `isWordChar`(`_`, `-` 포함)와 다르다. 경계 정의를 하나로 합친다.
- `core/src/control/server.ts`: `close()`가 소켓을 동기적으로 파괴해 전송 중인 응답이 잘릴 수 있다. `end()` 유예 단계나 요청 드레인을 넣는다. 잘못된 줄에 대한 오류 응답 id가 `"?"`라 클라이언트 대기자와 매칭되지 않는다.
- `core/src/model/summaries.ts`: `paneId`의 `runtime ?? profile` 폴백이 테스트되지 않았다.
- `core/src/services/turn-service.ts`: `finally` 블록의 `emitUpsert`가 예외 경로에서 호출되는지 테스트가 없다. `handlePass`가 인박스에 아무 효과가 없는 이유(pass = 그 턴에 `say`를 하지 않음)를 코드 주석으로 남긴다.
- `cli/src/main.ts`: 진입점 수준 테스트가 없다(`printTranscript` 포맷, `ControlError` → stderr 매핑).
- `cli/src/shim.ts`: 홈 경로를 큰따옴표 안에 그대로 넣는다. `$`, 백틱, `"`가 든 경로는 `sh`에서 확장된다.
- `core/test/helpers/fake-herdr.mjs`: `positionals()`가 `--`로 시작하는 프롬프트 본문을 플래그로 취급한다. 에러 코드 8개 중 4개만 테스트가 실행한다.

- 세션은 호스트 전체에 하나(`HERDR_BOT_SESSION`, 기본 `herdr-bot`)다. 그래서 채택(Adopt) 목록도 그 세션의 에이전트만 보인다. 메인 세션의 에이전트를 방에 넣고 싶다는 요구가 생기면 봇 프로필에 `herdr.session`을 두고 `HerdrCli`가 호출마다 세션을 받도록 바꾼다(StatusMirror는 세션별 소켓을 하나씩 구독). 지금은 `HERDR_BOT_SESSION=default`가 우회로다.
- `ensureHerdrSession`은 `herdr --session <name> server`를 detached로 띄운다. 세션 서버는 앱이 꺼져도 남는다(herdr의 의도된 모델). 정리하려면 `herdr session stop herdr-bot`.

## 고치지 않기로 한 것 (won't fix), 이유

- 프로젝션 함수(`projectBotProfile`, `projectRoomConfig`)가 id 형식을 검증하지 않음. 생성 시 `RosterService`가 검증하고, 저장된 파일에 대한 관용은 의도한 것이다.
- `HerdrError.detail` 필드. 플랜 코드에 포함된 설계다.
- 오케스트레이터의 `deps`/`maxRounds`/`maxMemberTurns`가 public readonly. 테스트에 유용하고 해가 없다.
- `SayInbox` 키가 `${chatId} ${botId}`. 봇 id와 방 id 정규식이 공백을 허용하지 않는다.
- `RosterError`의 `unknown_room` 코드가 선언만 되고 던져지지 않음. 방 조회 실패는 `null` 반환으로 처리한다.
- `read` 출력이 `[HH:MM] author: text`(브리프 산문은 괄호 없음). 코드가 실행 가능한 스펙이다.
- `installShim`이 원자적으로 쓰지 않음. 호스트 시작 시 1회 쓰는 파일이다.
- herdr가 방금 idle이 된 봇을 약 25초 동안 `done`으로 보고함. herdr 쪽 표시 문제이고 `isRunning`은 `done`을 여유 상태로 본다.
- status-mirror 테스트 2가 실제 시계(300ms)에 의존함. 20ms 디바운스에 대해 15배 여유다.
- 컨트롤 소켓이 로컬 클라이언트를 인증하지 않음. v1에서는 단일 사용자 유닉스 소켓이고 `say`/`whoami`는 `HERDR_PANE_ID`로 pane 범위가 잡히므로 허용한다.

## 데스크톱 플랜이 알아야 할 것

- 호스트는 `HostEvents`를 렌더러 포트로 자동 전달하지 않는다. 데스크톱 main이 `host.events.on(...)`을 `createRendererPortServer(...).postEvent`에 연결해야 한다. `HostEvents.emit`은 이제 리스너 예외를 잡는다.
- `setGroupMembers`는 `memberAgentIds`를 읽고, 컨트롤 소켓의 `room.set-members`는 `memberIds`를 읽는다. 호출자가 다르다.
- `duplicateAgent`는 실패 코드 `unsupported`를 돌려준다.
- 디스패처는 포트 서버가 넘기는 `AbortSignal`을 무시한다. cancel 프레임은 추적만 끊고 진행 중인 herdr 호출은 취소하지 않는다.
- `AgentSummary.herdrBot.status`는 herdr 원시 상태(`done`, `offline` 포함)다. 렌더러는 `isRunning`을 기준으로 바쁨을 판단해야 한다. 방은 `herdrBot: null`, `isGroup: true`, `title`은 항상 빈 문자열이다.
