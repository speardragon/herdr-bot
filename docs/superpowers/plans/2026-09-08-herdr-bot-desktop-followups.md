# herdr-bot Desktop — 후속 작업 목록

데스크톱 플랜(`2026-09-08-herdr-bot-desktop.md`) 8개 태스크가 모두 리뷰를 통과하고 브랜치 전체 최종 리뷰가 "그대로 머지 가능"으로 끝난 시점의 남은 항목이다. 필수 수정은 없었다. 아래는 최종 리뷰가 "나중에" 또는 "고치지 않음"으로 분류한 것이다.

## 사람이 직접 확인해야 하는 것

- **앱 안 라이브 E2E(플랜 Task 8 Step 3)**는 GUI 클릭이 필요해 자동으로 수행하지 않았다. 체크리스트는 README의 "앱 (macOS)" 절과 플랜 문서 Task 8을 따른다. 전제는 herdr 0.9.0 실행 중, claude 로그인. 패키징된 앱(`.build/desktop/mac-arm64/herdr-bot.app`)은 실제 `~/.herdr-bot`을 홈으로 쓴다. ad-hoc 서명이므로 첫 실행은 우클릭 → 열기.
- **E2E 전 준비 두 가지.** (1) 데스크톱 main은 `~/.herdr-bot/bin/herdr-bot` shim을 설치하지 않는다(코어의 `installShim`은 `cli/src/main.ts`의 `serve`/`install-shim`에서만 불린다). 앱을 켜기 전에 레포 루트에서 `node cli/src/main.ts install-shim`을 한 번 실행한다. 빠뜨리면 체크리스트 4단계에서 claude가 `herdr-bot: command not found`를 낸다. (2) 호스트는 `execFile("herdr")`로 herdr를 찾는데, Finder에서 연 앱의 PATH는 `/usr/bin:/bin:/usr/sbin:/sbin`뿐이라 `/opt/homebrew/bin/herdr`를 못 찾고 1단계 Start bot이 `herdr_spawn_failed`로 실패한다. 터미널에서 `npm run desktop:start`로 실행하거나, `HERDR_BIN_PATH=$(which herdr)`를 준 채 `.build/desktop/mac-arm64/herdr-bot.app/Contents/MacOS/herdr-bot`을 직접 실행한다(`open`이 아니라). 두 문제 모두 가짜 herdr 테스트에서는 드러나지 않는다(가짜 herdr는 `say`를 컨트롤 소켓에 직접 보내고, 바이너리 경로는 `HERDR_BIN_PATH`로 넘긴다).
- 봇은 전용 herdr 세션 `herdr-bot`에 뜬다. 앱만 켜면 봇 pane은 어디에도 보이지 않는다: 터미널에서 `herdr session attach herdr-bot`을 열어 두고 체크리스트 6단계(터미널 버튼 → pane 포커스)를 확인한다. 나중에 "Open in herdr"가 세션에 붙은 클라이언트가 없을 때 Terminal.app으로 `herdr session attach herdr-bot`을 열어 주면 좋다.
- 사이드바·컴포저·리액션·삭제·저자 라벨·"Open in herdr" 버튼 같은 시각 요소는 `npm run desktop:dev:fake`로 가짜 herdr 위에서 눈으로 확인한다.

## 2026-09-09 UI 점검에서 고친 것

실제 Grok Bot 0.18 창과 비교하며 CDP로 렌더러를 검사했다(`renderer/UPSTREAM.md` 마지막 절에 수정 목록). 원인별로:

- 상단 52px의 드래그 커버(`.sand-cover-drag`, fixed, z-index 4999)가 사이드바 헤더와 채팅 헤더의 모든 클릭을 먹었다. `+`(새 채팅), "Open in herdr", Channels, 헤더 identity 버튼이 실제 클릭으로는 눌리지 않았다. `pointer-events: none` + 컨트롤에 `app-region: no-drag`.
- 사용자 말풍선이 한 글자씩 세로로 떨어졌다. `.sand-message`의 `max-width: min(88%, 640px, calc(100% - 82px))`가 `width: fit-content`인 anchor를 기준으로 풀려 순환 참조가 됐다(anchor 폭 120px → 버블 38px). 제한을 anchor로 옮겼다.
- 채팅을 바꾸면 대화 내역이 비고 로딩 표시도 없었다. `openAgent`가 진입 즉시 요청 세대 번호를 올리는데, 자동 열기 effect가 fetch 도중 재진입해 즉시 반환하면서 세대를 또 올려 첫 응답이 stale로 버려졌다. 세대 증가를 fetch 직전으로 옮겼다. 이전 세션에서 안 보였던 이유: 봇 답장이 실시간 이벤트로 쌓여 fetch가 필요 없었다.
- 컴포저 placeholder가 첫 채팅 이름에 고정됐다(tiptap `useEditor`가 첫 extension 세트를 유지). placeholder를 ref로 읽고 변경 시 빈 트랜잭션으로 다시 그린다. placeholder 규칙 자체도 없어서 그동안 보이지 않았다.
- 사이드바 aside가 `auto` 행에 놓여 내용 높이(288px)에서 끊기고 아래는 흰색이었다. 열 전체에 chrome 배경을 주고 aside를 1fr 행에 고정했다.
- 그 외: 타이틀바에 중복 표시되던 채팅 제목과 "Connected" 점 숨김, 컴포저를 한 줄 pill로, 아바타 기본 모양 cloud, 다크 리터럴 색 토큰화, 첫 프레임 창 배경색을 테마에 맞춤(`windowBackground`).
- 라이브 E2E에서 확인할 것: `.sand-message`의 `max-width`를 anchor로 옮겼으므로, anchor 없이 렌더되는 `.sand-message`(예: "busy in herdr" notice)가 있으면 행 전체 폭으로 퍼진다. 그런 항목이 보이면 `.sand-message-action-anchor`로 감싸거나 해당 클래스에 max-width를 준다.

## 나중에 고칠 것 (fix later)

- `desktop/src/main.ts`: 호스트 시작 시 shim을 설치·검증하지 않는다. 패키징된 앱은 CLI도 node도 싣지 않으므로, shim이 exec할 node 경로와 진입점을 앱이 정해야 한다(예: `process.execPath` + `ELECTRON_RUN_AS_NODE=1`로 Electron 내장 node를 쓰거나, 설정에서 node 경로를 받는다). shim 형식(`exec "<node>" "<main>" "$@"`)이 환경변수를 못 실어서 형식 변경도 함께 필요하다.
- `desktop/src/main.ts` / `core/src/herdr/cli.ts`: GUI 실행 시 PATH 보정이 없다. 로그인 셸(`$SHELL -lc 'echo $PATH'`)에서 PATH를 읽어 오거나, `/opt/homebrew/bin`·`~/.local/bin`을 탐색하거나, 설정 UI에서 herdr 경로를 받아 `HERDR_BIN_PATH`로 넘긴다.
- `desktop/src/main.ts`: macOS `activate` 핸들러가 없다. 빨간 버튼으로 창을 닫으면 앱은 살아 있는데 창을 다시 열 방법이 없다(Cmd+Q 후 재실행). 한 줄 추가.
- `desktop/src/main.ts`: `before-quit`에서 `void host.stop()`을 기다리지 않고, 호스트 시작 후 부팅이 실패한 경로에서도 `host.stop()`을 호출하지 않는다. 다음 실행 때 컨트롤 서버가 죽은 소켓 파일을 정리하므로 복구는 되지만, 종료 시 정리를 기다리도록 바꾼다. `dialog.showErrorBox`는 블로킹이라 헤드리스 환경에서 `app.exit(1)`이 지연된다.
- `desktop/tsconfig.json`: `test`를 include하지 않아 데스크톱 테스트 파일은 타입체크되지 않는다(런타임 타입 스트리핑만).
- `desktop/src/bridge-main.ts`: 테마 변경이 두 번 브로드캐스트된다(`setThemePreference` 직접 push + `nativeTheme "updated"` 리스너). 멱등이라 무해하지만 하나로 줄인다.
- `desktop/package.json`: `description`/`author`가 없어 electron-builder가 경고한다. 앱 아이콘은 기본 Electron 아이콘이다(1×1 자리표시자 대체 없음). 배포용이라면 진짜 PNG/ICNS를 넣는다.
- `renderer/.../emoji-catalog.ts`: fail-soft가 모든 실패를 조용히 빈 카탈로그로 바꾼다. 로그 한 줄을 남긴다.
- `renderer/src/production/ProductionRenderer.tsx` teach-recording: 시작 직후 `getTeachRecordingStatus` 응답이 상태 형태가 아니어서 `requireTeachRecordingStatus`가 `TypeError`를 던지고 `heal()`이 이를 잡지 않는다(콘솔에 Uncaught (in promise) 2회). herdr-bot에는 없는 기능이므로 코디네이터가 `unsupported` 실패를 돌려주는지 확인하고, 렌더러 쪽 heal에 catch를 두거나 기능 게이트를 끈다.
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
