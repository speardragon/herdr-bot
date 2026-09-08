# herdr-bot Desktop — 후속 작업 목록

데스크톱 플랜(`2026-09-08-herdr-bot-desktop.md`) 8개 태스크가 모두 리뷰를 통과하고 브랜치 전체 최종 리뷰가 "그대로 머지 가능"으로 끝난 시점의 남은 항목이다. 필수 수정은 없었다. 아래는 최종 리뷰가 "나중에" 또는 "고치지 않음"으로 분류한 것이다.

## 사람이 직접 확인해야 하는 것

- **앱 안 라이브 E2E(플랜 Task 8 Step 3)**는 GUI 클릭이 필요해 자동으로 수행하지 않았다. 체크리스트는 README의 "앱 (macOS)" 절과 플랜 문서 Task 8을 따른다. 전제는 herdr 0.9.0 실행 중, claude 로그인. 패키징된 앱(`.build/desktop/mac-arm64/herdr-bot.app`)은 실제 `~/.herdr-bot`을 홈으로 쓴다. ad-hoc 서명이므로 첫 실행은 우클릭 → 열기.
- 사이드바·컴포저·리액션·삭제·저자 라벨·"Open in herdr" 버튼 같은 시각 요소는 `npm run desktop:dev:fake`로 가짜 herdr 위에서 눈으로 확인한다.

## 나중에 고칠 것 (fix later)

- `desktop/src/main.ts`: macOS `activate` 핸들러가 없다. 빨간 버튼으로 창을 닫으면 앱은 살아 있는데 창을 다시 열 방법이 없다(Cmd+Q 후 재실행). 한 줄 추가.
- `desktop/src/main.ts`: `before-quit`에서 `void host.stop()`을 기다리지 않고, 호스트 시작 후 부팅이 실패한 경로에서도 `host.stop()`을 호출하지 않는다. 다음 실행 때 컨트롤 서버가 죽은 소켓 파일을 정리하므로 복구는 되지만, 종료 시 정리를 기다리도록 바꾼다. `dialog.showErrorBox`는 블로킹이라 헤드리스 환경에서 `app.exit(1)`이 지연된다.
- `desktop/tsconfig.json`: `test`를 include하지 않아 데스크톱 테스트 파일은 타입체크되지 않는다(런타임 타입 스트리핑만).
- `desktop/src/bridge-main.ts`: 테마 변경이 두 번 브로드캐스트된다(`setThemePreference` 직접 push + `nativeTheme "updated"` 리스너). 멱등이라 무해하지만 하나로 줄인다.
- `desktop/package.json`: `description`/`author`가 없어 electron-builder가 경고한다. 앱 아이콘은 기본 Electron 아이콘이다(1×1 자리표시자 대체 없음). 배포용이라면 진짜 PNG/ICNS를 넣는다.
- `renderer/.../emoji-catalog.ts`: fail-soft가 모든 실패를 조용히 빈 카탈로그로 바꾼다. 로그 한 줄을 남긴다.
- `README.md` 앱 절: `desktop:package` 스크립트가 플랜 초안과 다른 이유(`--project`가 `--config` 경로를 재기준화함)를 한 줄 적어 두면 좋다.

## 고치지 않기로 한 것 (won't fix), 이유

- `@tiptap/core@3.14.0`의 npm audit moderate 21건과 1.5MB 메인 청크 경고. 버전을 올리면 `@tiptap/core`가 두 벌 설치되는 문제가 되살아난다. upstream 고정 버전을 따르는 개인용 빌드다.
- `createAttachmentService`가 약 77줄, `isStaged`가 `realpath` 대신 `resolve` 사용, `str("")`을 부재로 처리. 삭제는 여전히 staged 디렉터리 안에서만 일어나고 동작은 맞다.
- 가짜 herdr 개발 런처의 시드에 `sayOnce`가 없어 봇들이 상한(3라운드)까지 서로 답한다. 개발용으로는 한 번만 답하고 침묵하는 것보다 라운드로빈이 흐르는 모습을 보는 쪽이 유용하다(플랜 Task 4 Expected 문구도 그렇게 고쳤다).
- `NewChatDialog`의 select 제네릭이 `string`으로 넓어짐. 타입체크는 통과한다.
- `chat-header.tsx`에 남은 미사용 `ComputerHeaderControl` import와 props. upstream 대비 diff를 최소화하려는 의도된 선택이다.
- `scripts/dev-fake-herdr.mjs`가 추적 중인 가짜 herdr 파일에 `chmodSync`를 호출함. 이미 100755라 실질 변화가 없다.

## 계약 메모 (코어 ↔ 데스크톱)

- 호스트는 이벤트를 스스로 포트에 보내지 않는다. `desktop/src/coordinator-port.ts`가 `host.events.on(...)`을 `postEvent`로 연결하고 detach/settle 때 해제한다.
- 렌더러의 그룹 멤버 UI는 `setGroupMembers { memberAgentIds }`를 보낸다(컨트롤 소켓의 `room.set-members`는 `memberIds`).
- `AgentSummary.herdrBot.status`는 herdr 원시 상태(`done`, `offline` 포함)이며 `isRunning`은 `working`만 바쁨으로 본다.
