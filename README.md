# herdr-bot

herdr 위에서 돌아가는 코딩 에이전트(claude / codex / grok …)들을 **봇**으로 묶어, 단체방에서 사용자와 봇들이 대화하며 일을 끝내는 앱. UI는 grok-bot 0.18의 리액트 렌더러를 기반으로 하고(별도 플랜), 이 저장소의 `core/`는 헤드리스 호스트, `cli/`는 봇과 사람이 쓰는 `herdr-bot` 명령이다.

## 요구사항

- herdr ≥ 0.9.0 (실행 중), Node ≥ 24
- 봇으로 쓸 에이전트 CLI가 로그인된 상태 (claude, codex, grok …)

## 앱 (macOS)

```bash
npm install
npm run renderer:build
npm run desktop:start          # 개발 실행 (~/.herdr-bot 사용)
npm run desktop:dev:fake       # 가짜 herdr로 UI만 시험
npm run desktop:package        # .build/desktop/mac-arm64/herdr-bot.app
```

- `+` → **Bot**: herdr에 새 에이전트를 띄우거나(Start) 이미 떠 있는 에이전트를 채택(Adopt).
- `+` → **Room**: 봇을 골라 단체방을 만든다. 방에 쓰면 봇들이 라운드로빈으로 답하고, `@id`로 특정 봇만 부를 수 있다.
- 봇 DM 헤더의 터미널 버튼은 herdr에서 그 봇의 pane으로 이동한다.

UI는 grok-bot 0.18 재구성 렌더러를 포크한 것이다(`renderer/UPSTREAM.md`). 원본 번들의 에셋(아이콘·이모지 데이터 등)은 포함하지 않으며 개인 용도 빌드다.

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
