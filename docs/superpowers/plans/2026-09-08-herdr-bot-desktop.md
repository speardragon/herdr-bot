# herdr-bot Desktop (grok-bot 렌더러 포크 + Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** grok-bot 0.18 재구성 레포의 리액트 렌더러(`frontend/`)를 그대로 포크해 **grok-bot과 같은 모양의 macOS Electron 앱**을 만들고, 그 뒤를 코어 플랜(`2026-09-08-herdr-bot-core.md`)의 herdr-bot 호스트로 바꾼다. 사이드바에 봇(herdr 에이전트)과 방(단체방)이 보이고, 방에 메시지를 보내면 봇들이 herdr pane에서 일한 뒤 `herdr-bot say`로 답한 것이 채팅으로 흐른다.

**Architecture:** 렌더러는 `window.desktop`(DesktopBridge)과 `window.coordinatorPort`(MessagePort claim) 두 계약만 본다. Electron preload가 이 둘을 제공하고, main 프로세스는 코어 `createHost()`를 in-process로 띄운 뒤 `MessageChannelMain`으로 렌더러 포트를 만들어 코어의 `createRendererPortServer` + `createCoordinatorDispatcher`에 붙인다. 렌더러 수정은 **닫힌 목록** 6개만: 브랜딩, 런타임 에셋 대체, 봇/방 생성 다이얼로그, 단체방 메시지 저자 표시, "Open in herdr" 헤더 액션, `createGroup` 진입점.

**Tech Stack:** React 19.2.1 + Vite 8.2.1 + TypeScript 7.0.2 + @tiptap 3.14.0 (grok-bot과 동일 핀), Electron 42.1.0 (grok-bot 0.18과 동일), electron-builder(패키징). 코어는 Node 24 타입 스트리핑으로 실행되지만 **desktop 패키지는 tsc로 컴파일**한다(Electron이 .ts를 직접 못 읽음).

## Global Constraints

- 코어 플랜의 Global Constraints를 모두 상속(Node ≥ 24, `node --test`, 한국어 문서/영어 코드, 커밋 규칙, `HERDR_BOT_HOME` 임시 홈).
- **렌더러 포크는 `renderer/`에 두고 upstream 파일을 가능한 한 그대로 유지한다.** 수정 허용 파일 목록(이 플랜에 명시된 것만): `renderer/index.html`, `renderer/vite.config.ts`, `renderer/package.json`, import 경로 8줄, `production/evidence.ts`(UI_TEXT), `production/runtime-assets.ts`, `cards/transcript-card/emoji-catalog.ts`(fail-soft 1곳), `cards/transcript-card/protocol.ts`(author), `cards/transcript-card/views/send-message-text.tsx`(author 표시), `workspace/chat-header.tsx`(Open in herdr), `production/ProductionRenderer.tsx`(다이얼로그/커맨드 배선), `production/production.css`(추가 CSS), 신규 `production/NewChatDialog.tsx`. 그 외 파일은 건드리지 않는다(diff를 upstream과 비교 가능하게).
- **라이선스/충실도 고지:** grok-bot 레포 `NOTICE.md`는 "No upstream source-code license is asserted or granted"이고 `PROVENANCE.md`는 `frontend/`가 **부분 재구성**임을 밝힌다. 따라서 (1) 이 앱은 개인 용도이며 배포 전 사용자가 독립적으로 권리 검토를 한다, (2) "grok-bot과 완전히 같은 UI"는 **레이아웃·컴포넌트·디자인 토큰·CSS가 같다**는 뜻이고, 원본 번들의 해시 이름 에셋 18개(앱 아이콘, 플러그인 로고, 온보딩 월페이퍼)와 emoji/katex/pdf 청크는 재배포할 수 없어 **대체 또는 스텁**된다(Task 5). 온보딩 시네마틱은 v1에서 건너뛴다(`onboarding.getSeen → true`).
- **의존성 고정 (실행 중 확정):** `renderer/package.json`은 upstream 루트 `package.json`과 같이 `@tiptap/*` 30개 패키지를 모두 `3.14.0`으로 직접 고정한다(8개만 고정하면 `@tiptap/extensions`가 3.31.x로 떠올라 ERESOLVE). 루트 `overrides`는 `@tiptap/extension-bubble-menu`, `@tiptap/extension-floating-menu`, `@tiptap/core` 세 항목(레지스트리 드리프트로 core가 2벌 설치되는 것을 막음).
- `.upstream/`(grok-bot 클론)은 gitignore. 포크는 `git clone --depth 1`한 특정 커밋에서 복사하고 그 커밋 해시를 `renderer/UPSTREAM.md`에 기록한다.
- desktop 패키지 tsconfig는 `erasableSyntaxOnly: false`, `verbatimModuleSyntax: false`(preload를 CJS로 내보내기 위해), `noEmit: false`, `rootDir: ".."`, `outDir: "dist"`. 산출물: `desktop/dist/desktop/src/main.js`(ESM), `desktop/dist/desktop/src/preload.cjs`, `desktop/dist/core/src/**`.
- Electron IPC 채널 이름은 `herdr-bot:` 접두사만 사용: `herdr-bot:bridge`(invoke), `herdr-bot:bridge-sync`(sendSync), `herdr-bot:bridge-event`(main→renderer), `herdr-bot:coordinator-port-request`, `herdr-bot:coordinator-port`.
- 렌더러 dev 서버 포트 `5173`; `HERDR_BOT_RENDERER_URL`이 설정되면 Electron이 그 URL을 로드(HMR), 아니면 `renderer/dist/index.html`(file://).
- 앱 상태(테마 선호, 고정 봇, 사이드바 섹션, client persistence)는 `app.getPath("userData")/herdr-bot-desktop.json` 한 파일.

---

## 배경: 렌더러 ↔ 백엔드 계약 (구현자가 알아야 할 것)

렌더러 진입점 `renderer/src/main.tsx`는 `acquireProductionRendererRuntime(window)`에서 다음을 **요구**한다(없으면 invariant throw):
- `window.desktop`이 `hasDesktopBridge`를 통과: `openExternal`·`getWindowState` 함수, `mcp`·`cursorAccount`·`update` 객체 non-null.
- `window.coordinatorPort.claim(consumer)` 함수. `consumer.onPort(port)`로 전달되는 `port`는 `{ postMessage, close, start, addEventListener("message"|"close", listener) }` 모양의 **일반 객체**(contextBridge가 함수를 프록시하므로 MessagePort 자체가 아니라 래퍼를 넘긴다). `claim()`이 반환하는 `{ request(), release() }`의 `request()`가 호출되면 preload가 main에 포트를 요청한다.

coordinator 프레임(코어 `frames.ts`): 렌더러가 `{kind:"lifecycle", phase:"hello", protocolVersion:1}`을 보내면 서버가 `ready`로 답하고, 이후 `{kind:"request", requestId, method, args}` ↔ `{kind:"reply", requestId, outcome}`, 서버→렌더러 `{kind:"event", family, payload}`.

렌더러가 동기적으로 읽는 값: `bridge.theme.initial`(`{preference, resolved}`), `bridge.getZoomFactor()`, `bridge.platform`, `bridge.isDev`, `bridge.experiments.initialSnapshot`, `bridge.foreverBox.egressTunnel.initial/initialStatus`, `bridge.foreverBox.webauthnProxy.initial`. preload는 이것들을 `ipcRenderer.sendSync` 또는 상수로 채운다.

게이팅 값(이 값이어야 메인 셸이 뜬다): `cursorAccount.getStatus() → {kind:"logged-in", displayName, isAnysphereUser:false}`, `cursorAccount.getSandAccessFresh()/getSandAccess() → {state:"granted", reason:"none"}`, `onboarding.getSeen() → true`, `update.getStatus().state → {type:"disabled", reason:"not-packaged"}`.

트랜스크립트/로스터 모양은 코어 플랜 "프로토콜 스펙" 참조. 렌더러의 `validateReply`가 강제하는 것: `listAgents`는 배열, `openAgentTail`/`getAgentTranscriptTail`은 `{entries, nextBeforeSeq?}`, `getAgentTranscriptWindow`는 `threadCounts` 필수, `getForeverBoxStatus`는 `null` 허용.

## 파일 구조

```
herdr-bot/
├── package.json                    workspaces += "renderer", "desktop"; scripts dev/build/package
├── .upstream/grok-bot/             (gitignored) 클론
├── renderer/                       grok-bot frontend 포크 (Task 1)
│   ├── UPSTREAM.md                 출처 커밋 해시 + 수정 파일 목록
│   ├── index.html, vite.config.ts, tsconfig.json, package.json
│   ├── manifests/                  (복사)
│   ├── public/assets/              대체 런타임 에셋 (Task 5)
│   └── src/
│       ├── main.tsx, production/, recovered/, dev/   (복사)
│       ├── shared/sand-timeline-events.ts, shared/rpc/coordinator.ts, shared/rpc/coordinator-port.ts, shared/tools-pb-types.ts
│       └── production/NewChatDialog.tsx            (Task 6/7)
└── desktop/                        Electron (Task 2~4, 9)
    ├── package.json, tsconfig.json, electron-builder.yml
    └── src/
        ├── main.ts                 BrowserWindow, host 부트, 포트 브로커
        ├── window-chrome.ts        mac hiddenInset 옵션 (순수)
        ├── coordinator-port.ts     MessagePortMain ↔ createRendererPortServer
        ├── bridge-main.ts          ipcMain 핸들러 (DesktopBridge 서버측)
        ├── settings-store.ts       userData JSON 저장소
        ├── attachments.ts          staged 파일, 미디어 data URL, 다운로드
        └── preload.cts             contextBridge: window.desktop / window.coordinatorPort
```

---

### Task 1: 렌더러 포크 (복사 → 공유 파일 재배치 → 빌드 설정 → 타입체크/빌드 통과)

**Files:**
- Create: `renderer/**` (복사본), `renderer/src/shared/*`, `renderer/UPSTREAM.md`, `renderer/package.json`, `renderer/vite.config.ts`(교체)
- Modify: 루트 `package.json`(workspaces, overrides), `.gitignore`
- Modify (import 경로만): `renderer/src/recovered/features/conversation/cards/timeline-event.tsx`, `.../cards/timeline-event-registry.ts`, `.../conversation/tool-results/proto-adapter.ts`, `renderer/src/recovered/runtime/coordinator-source.ts`, `renderer/src/production/coordinator-client.ts`

**Interfaces:**
- Produces: `npm run renderer:typecheck`(= `tsc -p renderer/tsconfig.json`) 과 `npm run renderer:build`(= `vite build --config renderer/vite.config.ts` → `renderer/dist/`) 가 모두 성공. 이후 태스크는 `renderer/dist/index.html`을 Electron이 로드한다.

- [ ] **Step 1: upstream 클론 + 복사**

```bash
cd /Users/goorm/Desktop/ray/workspace/herdr-bot/herdr-bot-claude
mkdir -p .upstream
git clone --depth 1 https://github.com/b-nnett/grok-bot-0.18-reconstructed .upstream/grok-bot
UP=.upstream/grok-bot
UPSTREAM_SHA=$(git -C "$UP" rev-parse HEAD)
rm -rf renderer && mkdir renderer
cp -R "$UP/frontend/index.html" "$UP/frontend/tsconfig.json" "$UP/frontend/manifests" "$UP/frontend/src" renderer/
mkdir -p renderer/src/shared/rpc
cp "$UP/source/shared/sand-timeline-events.ts" renderer/src/shared/sand-timeline-events.ts
cp "$UP/source/shared/rpc/coordinator.ts" renderer/src/shared/rpc/coordinator.ts
cp "$UP/source/shared/rpc/coordinator-port.ts" renderer/src/shared/rpc/coordinator-port.ts
printf '# Upstream\n\nForked from https://github.com/b-nnett/grok-bot-0.18-reconstructed at commit `%s` (`frontend/` + 3 files from `source/shared`).\n\nLocal modifications are listed in docs/superpowers/plans/2026-09-08-herdr-bot-desktop.md (Global Constraints).\n' "$UPSTREAM_SHA" > renderer/UPSTREAM.md
grep -q '^\.upstream/' .gitignore || echo '.upstream/' >> .gitignore
```

- [ ] **Step 2: proto 타입 스텁 작성 (12k줄 proto 트리를 복사하지 않기 위해)**

`renderer/src/shared/tools-pb-types.ts`:
```ts
/**
 * Type-only stand-ins for the handful of generated protobuf types that
 * recovered/features/conversation/tool-results/proto-adapter.ts imports.
 * herdr-bot never produces client-side tool payloads; these keep the adapter
 * compiling without the 12k-line generated proto tree.
 */
export type ClientSideToolV2 = number;

export interface ToolResultError {
  readonly clientVisibleErrorMessage: string;
}

export interface DiffChunks {
  readonly chunks: readonly { readonly diffString: string }[];
}

export interface EditFileParams {
  readonly relativeWorkspacePath: string;
}

export interface EditFileV2Params {
  readonly relativeWorkspacePath: string;
}

export interface RunTerminalCommandV2Params {
  readonly command: string;
  readonly cwd?: string;
  readonly isBackground: boolean;
}

export interface EditFileResult {
  readonly rejected?: boolean;
  readonly applyFailed?: boolean;
  readonly recoverableError?: unknown;
  readonly isApplied: boolean;
  readonly diff?: DiffChunks;
}

export interface EditFileV2Result {
  readonly fileWasCreated: boolean;
  readonly rejected?: boolean;
  readonly diff?: DiffChunks;
}

export interface RunTerminalCommandV2Result {
  readonly outputRaw: string;
  readonly output: string;
  readonly rejected?: boolean;
  readonly poppedOutIntoBackground: boolean;
  readonly isRunningInBackground: boolean;
  readonly endedReason: number;
}

export interface ClientSideToolV2Call {
  readonly toolCallId: string;
  readonly tool: ClientSideToolV2;
  readonly params:
    | { readonly case: "editFileParams"; readonly value: EditFileParams }
    | { readonly case: "editFileV2Params"; readonly value: EditFileV2Params }
    | { readonly case: "runTerminalCommandV2Params"; readonly value: RunTerminalCommandV2Params }
    | { readonly case: undefined; readonly value?: undefined };
}

export interface ClientSideToolV2Result {
  readonly toolCallId: string;
  readonly tool: ClientSideToolV2;
  readonly error?: ToolResultError;
  readonly result:
    | { readonly case: "editFileResult"; readonly value: EditFileResult }
    | { readonly case: "editFileV2Result"; readonly value: EditFileV2Result }
    | { readonly case: "runTerminalCommandV2Result"; readonly value: RunTerminalCommandV2Result }
    | { readonly case: undefined; readonly value?: undefined };
}
```

- [ ] **Step 3: import 경로 8줄 재작성 (sed, 정확한 문자열)**

```bash
cd renderer/src
sed -i '' 's#"\.\./\.\./\.\./\.\./\.\./\.\./source/shared/sand-timeline-events"#"../../../../shared/sand-timeline-events"#g' recovered/features/conversation/cards/timeline-event.tsx recovered/features/conversation/cards/timeline-event-registry.ts
sed -i '' 's#"\.\./\.\./\.\./\.\./\.\./\.\./source/packages/proto/generated/aiserver/v1/tools_pb"#"../../../../shared/tools-pb-types"#' recovered/features/conversation/tool-results/proto-adapter.ts
sed -i '' 's#"\.\./\.\./\.\./\.\./source/shared/rpc/coordinator-port"#"../../shared/rpc/coordinator-port"#; s#"\.\./\.\./\.\./\.\./source/shared/rpc/coordinator"#"../../shared/rpc/coordinator"#' recovered/runtime/coordinator-source.ts
sed -i '' 's#"\.\./\.\./\.\./source/shared/rpc/coordinator"#"../shared/rpc/coordinator"#' production/coordinator-client.ts
grep -rn "source/shared\|source/packages" . && echo "STILL HAS UPSTREAM IMPORTS" || echo "imports rewritten"
cd ../..
```
Expected: 마지막 줄 `imports rewritten`.

- [ ] **Step 4: vite 설정 교체 + 패키지 파일**

`renderer/vite.config.ts` (전체 교체 — upstream 렌더러를 서빙하던 `sirv` 플러그인 제거):
```ts
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // Electron loads index.html from file://, so every emitted asset must be relative.
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
```

`renderer/package.json`:
```json
{
  "name": "@herdr-bot/renderer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --config vite.config.ts",
    "build": "vite build --config vite.config.ts",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@tiptap/core": "3.14.0",
    "@tiptap/extension-link": "3.14.0",
    "@tiptap/extension-mention": "3.14.0",
    "@tiptap/extension-placeholder": "3.14.0",
    "@tiptap/pm": "3.14.0",
    "@tiptap/react": "3.14.0",
    "@tiptap/starter-kit": "3.14.0",
    "@tiptap/suggestion": "3.14.0",
    "react": "19.2.1",
    "react-dom": "19.2.1"
  },
  "devDependencies": {
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.0.5",
    "vite": "8.2.1"
  }
}
```

루트 `package.json`의 `workspaces`를 `["core", "cli", "renderer", "desktop"]`로 바꾸고 다음을 추가한다:
```json
  "overrides": {
    "@tiptap/extension-bubble-menu": "3.14.0",
    "@tiptap/extension-floating-menu": "3.14.0"
  },
```
그리고 scripts에:
```json
    "renderer:typecheck": "tsc -p renderer/tsconfig.json",
    "renderer:build": "npm run build -w @herdr-bot/renderer",
    "renderer:dev": "npm run dev -w @herdr-bot/renderer"
```
(`desktop` 워크스페이스 디렉터리는 Task 2에서 만든다. 그 전까지 `npm install`이 경고하지 않도록 `mkdir -p desktop && echo '{"name":"@herdr-bot/desktop","version":"0.1.0","private":true,"type":"module"}' > desktop/package.json` 로 빈 패키지를 먼저 둔다.)

`renderer/index.html`의 `<title>Grok Bot</title>`을 `<title>herdr-bot</title>`으로 바꾼다.

- [ ] **Step 5: 설치 → 타입체크 → 빌드**

```bash
npm install
npm run renderer:typecheck
npm run renderer:build
ls renderer/dist/index.html renderer/dist/assets | head
```
Expected: 타입체크 종료 0(에러 없음 — proto 스텁이 `proto-adapter.ts`의 사용 형태와 맞음), 빌드 `✓ built`, `renderer/dist/assets/`에 JS/CSS/woff2 파일 생성. `INEFFECTIVE_DYNAMIC_IMPORT` 경고는 upstream에도 있는 정상 경고.

- [ ] **Step 6: 커밋**

```bash
git add -A renderer package.json package-lock.json .gitignore desktop/package.json
git commit -m "feat(renderer): fork the grok-bot 0.18 React renderer as the herdr-bot UI baseline"
```

---

### Task 2: Electron 셸 — main, preload(DesktopBridge + coordinatorPort), 호스트 부트, 첫 픽셀

**Files:**
- Create: `desktop/package.json`(교체), `desktop/tsconfig.json`, `desktop/src/window-chrome.ts`, `desktop/src/settings-store.ts`, `desktop/src/bridge-main.ts`, `desktop/src/coordinator-port.ts`, `desktop/src/main.ts`, `desktop/src/preload.cts`
- Test: `desktop/test/window-chrome.test.ts`, `desktop/test/settings-store.test.ts`, `desktop/test/coordinator-port.test.ts`
- Modify: 루트 `package.json` scripts

**Interfaces:**
- Consumes (코어): `resolveConfig`, `createHost`, `createCoordinatorDispatcher`, `createRendererPortServer`, `HostEvents`
- Produces:
  - `window-chrome.ts`: `windowChromeOptions(platform: NodeJS.Platform): BrowserWindowChrome` — mac `{frame:true, titleBarStyle:"hiddenInset", trafficLightPosition:{x:16,y:15}}`; win `{frame:false, titleBarStyle:"hidden", titleBarOverlay:{height:51,color:"#121411",symbolColor:"#FFFFFF"}}`; linux `{frame:false, titleBarStyle:"default"}`. `MIN_WINDOW_SIZE = {width:512, height:520}`, `DEFAULT_WINDOW_SIZE = {width:1200, height:800}`, `WINDOW_BACKGROUND = "#121411"`.
  - `settings-store.ts`: `class SettingsStore { constructor(path); get<T>(key, fallback: T): T; set(key, value): void; remove(key): void; keys(prefix): string[] }` — JSON 파일 원자 저장.
  - `coordinator-port.ts`: `attachRendererPort(port: MessagePortMainLike, host: Host): { settled: Promise<unknown>; detach(): void }` — `createRendererPortServer` + `createCoordinatorDispatcher(host)` 연결, `host.events`의 `agents`/`agent-upserted`/`transcript`를 `postEvent`로 전달, settle 시 구독 해제.
  - `bridge-main.ts`: `registerBridge(deps: { ipcMain; window: BrowserWindow; settings: SettingsStore; host: Host; app; nativeTheme; shell; dialog }): void` — `herdr-bot:bridge`/`herdr-bot:bridge-sync` 핸들러, 테마·윈도우 상태 이벤트 push.
  - `preload.cts`: `window.desktop`(DesktopBridge 전체 키), `window.coordinatorPort`.
  - `main.ts`: 앱 부트.

- [ ] **Step 1: 실패하는 테스트 (순수 부분)**

`desktop/test/window-chrome.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, WINDOW_BACKGROUND, windowChromeOptions } from "../src/window-chrome.ts";

test("mac uses hidden-inset traffic lights like grok-bot", () => {
  assert.deepEqual(windowChromeOptions("darwin"), { frame: true, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 15 } });
});

test("windows uses a title bar overlay and linux a plain frameless window", () => {
  assert.deepEqual(windowChromeOptions("win32"), { frame: false, titleBarStyle: "hidden", titleBarOverlay: { height: 51, color: "#121411", symbolColor: "#FFFFFF" } });
  assert.deepEqual(windowChromeOptions("linux"), { frame: false, titleBarStyle: "default" });
  assert.deepEqual([MIN_WINDOW_SIZE, DEFAULT_WINDOW_SIZE, WINDOW_BACKGROUND], [{ width: 512, height: 520 }, { width: 1200, height: 800 }, "#121411"]);
});
```

`desktop/test/settings-store.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SettingsStore } from "../src/settings-store.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("settings store persists keys with prefixes and survives reload", () => {
  const temp = makeTempHome();
  try {
    const path = join(temp.home, "desktop.json");
    const store = new SettingsStore(path);
    assert.equal(store.get("theme", "system"), "system");
    store.set("theme", "dark");
    store.set("persist:composer-drafts", "{}");
    store.set("persist:other", "1");
    assert.deepEqual(new SettingsStore(path).get("theme", "system"), "dark");
    assert.deepEqual(store.keys("persist:").sort(), ["persist:composer-drafts", "persist:other"]);
    store.remove("persist:other");
    assert.deepEqual(store.keys("persist:"), ["persist:composer-drafts"]);
  } finally {
    temp.cleanup();
  }
});
```

`desktop/test/coordinator-port.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attachRendererPort, type MessagePortMainLike } from "../src/coordinator-port.ts";
import { createHost } from "../../core/src/host.ts";
import { resolveConfig } from "../../core/src/config.ts";
import { createHerdrCli } from "../../core/src/herdr/cli.ts";
import { installFakeHerdr } from "../../core/test/helpers/fake-herdr-state.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

function fakePort() {
  const posted: unknown[] = [];
  const handlers = new Map<string, ((event: { data: unknown }) => void)[]>();
  const port: MessagePortMainLike = {
    postMessage: (message) => posted.push(message),
    start: () => undefined,
    close: () => undefined,
    on: (event: string, handler: unknown) => { handlers.set(event, [...(handlers.get(event) ?? []), handler as (event: { data: unknown }) => void]); },
  };
  return { port, posted, emit: (data: unknown) => { for (const handler of handlers.get("message") ?? []) handler({ data }); } };
}

test("renderer frames reach the dispatcher and host events are forwarded as coordinator events", async () => {
  const temp = makeTempHome();
  const fake = installFakeHerdr(temp.home);
  const host = createHost(resolveConfig({ HERDR_BOT_HOME: temp.home, HERDR_BIN_PATH: fake.binPath }), { cli: createHerdrCli(fake.binPath, fake.env), socketPath: null });
  await host.start();
  const { port, posted, emit } = fakePort();
  const attached = attachRendererPort(port, host);
  try {
    emit({ kind: "lifecycle", phase: "hello", protocolVersion: 1 });
    emit({ kind: "request", requestId: "r1", method: "listAgents", args: {} });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(posted[0], { kind: "lifecycle", phase: "ready", protocolVersion: 1 });
    assert.deepEqual(posted[1], { kind: "reply", requestId: "r1", outcome: { status: "ok", value: [] } });
    host.chat.emitRoster();
    assert.deepEqual(posted[2], { kind: "event", family: "agents", payload: [] });
    attached.detach();
    host.chat.emitRoster();
    assert.equal(posted.length, 3);
  } finally {
    await host.stop();
    temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test "desktop/test/**/*.test.ts"
```
Expected: FAIL — module not found.

- [ ] **Step 3: 패키지/tsconfig**

`desktop/package.json`:
```json
{
  "name": "@herdr-bot/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/desktop/src/main.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "start": "electron .",
    "test": "node --test \"test/**/*.test.ts\""
  },
  "devDependencies": {
    "electron": "42.1.0",
    "electron-builder": "^26"
  }
}
```

`desktop/tsconfig.json`:
```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "..",
    "outDir": "dist",
    "erasableSyntaxOnly": false,
    "verbatimModuleSyntax": false,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src", "../core/src"],
  "exclude": ["test"]
}
```

루트 `package.json` scripts에 추가:
```json
    "desktop:build": "npm run renderer:build && npm run build -w @herdr-bot/desktop",
    "desktop:start": "npm run build -w @herdr-bot/desktop && npm run start -w @herdr-bot/desktop",
    "desktop:dev": "npm run build -w @herdr-bot/desktop && HERDR_BOT_RENDERER_URL=http://localhost:5173 HERDR_BOT_DEV=1 npm run start -w @herdr-bot/desktop",
    "test": "node --test \"core/test/**/*.test.ts\" \"cli/test/**/*.test.ts\" \"desktop/test/**/*.test.ts\"",
    "typecheck": "tsc -p core/tsconfig.json && tsc -p cli/tsconfig.json && tsc -p desktop/tsconfig.json --noEmit && tsc -p renderer/tsconfig.json"
```
`desktop/test`는 코어처럼 Node가 직접 실행하므로(타입 스트리핑) 테스트 파일은 erasable 문법을 지킨다.

- [ ] **Step 4: 순수 모듈 구현**

`desktop/src/window-chrome.ts`:
```ts
export const MIN_WINDOW_SIZE = { width: 512, height: 520 } as const;
export const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800 } as const;
export const WINDOW_BACKGROUND = "#121411";
export const MAC_TRAFFIC_LIGHT_POSITION = { x: 16, y: 15 } as const;
export const WINDOWS_TITLE_BAR_OVERLAY_HEIGHT_PX = 51;

export type BrowserWindowChrome =
  | { readonly frame: true; readonly titleBarStyle: "hiddenInset"; readonly trafficLightPosition: { readonly x: number; readonly y: number } }
  | { readonly frame: false; readonly titleBarStyle: "hidden"; readonly titleBarOverlay: { readonly height: number; readonly color: string; readonly symbolColor: string } }
  | { readonly frame: false; readonly titleBarStyle: "default" };

export function windowChromeOptions(platform: NodeJS.Platform): BrowserWindowChrome {
  if (platform === "darwin") return { frame: true, titleBarStyle: "hiddenInset", trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION };
  if (platform === "win32") return { frame: false, titleBarStyle: "hidden", titleBarOverlay: { height: WINDOWS_TITLE_BAR_OVERLAY_HEIGHT_PX, color: WINDOW_BACKGROUND, symbolColor: "#FFFFFF" } };
  return { frame: false, titleBarStyle: "default" };
}
```

`desktop/src/settings-store.ts`:
```ts
import { readJsonFile, writeJsonFileAtomic } from "../../core/src/store/json-file.ts";

type SettingsMap = Readonly<Record<string, unknown>>;

function projectMap(value: unknown): SettingsMap | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as SettingsMap) : null;
}

export class SettingsStore {
  readonly path: string;
  #map: SettingsMap | null = null;

  constructor(path: string) {
    this.path = path;
  }

  get<T>(key: string, fallback: T): T {
    const value = this.#load()[key];
    return value === undefined ? fallback : (value as T);
  }

  set(key: string, value: unknown): void {
    this.#save({ ...this.#load(), [key]: value });
  }

  remove(key: string): void {
    const { [key]: _removed, ...rest } = this.#load();
    this.#save(rest);
  }

  keys(prefix: string): string[] {
    return Object.keys(this.#load()).filter((key) => key.startsWith(prefix));
  }

  #load(): SettingsMap {
    if (this.#map == null) this.#map = readJsonFile(this.path, projectMap) ?? {};
    return this.#map;
  }

  #save(map: SettingsMap): void {
    this.#map = map;
    writeJsonFileAtomic(this.path, map);
  }
}
```

`desktop/src/coordinator-port.ts`:
```ts
import type { Host } from "../../core/src/host.ts";
import { createCoordinatorDispatcher } from "../../core/src/coordinator/dispatcher.ts";
import { createRendererPortServer, type RendererPortSettlement } from "../../core/src/coordinator/port-server.ts";
import type { HostEventFamily } from "../../core/src/host-events.ts";

/** The subset of Electron's MessagePortMain this module touches (kept structural so tests can fake it). */
export interface MessagePortMainLike {
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
  on(event: "message", handler: (event: { data: unknown }) => void): unknown;
  on(event: "close", handler: () => void): unknown;
}

const FAMILIES: readonly HostEventFamily[] = ["agents", "agent-upserted", "transcript"];

export function attachRendererPort(port: MessagePortMainLike, host: Host): { settled: Promise<RendererPortSettlement>; detach(): void } {
  const dispatch = createCoordinatorDispatcher(host);
  const server = createRendererPortServer(
    { post: (frame) => port.postMessage(frame), close: () => port.close() },
    { dispatchRequest: (method, args) => dispatch(method, args) },
  );
  const unsubscribes = FAMILIES.map((family) => host.events.on(family, (payload) => server.postEvent(family, payload)));
  const detach = (): void => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
  port.on("message", (event) => server.handleMessage(event.data));
  port.on("close", () => server.handlePortClosed());
  port.start();
  void server.settled.then(detach);
  return { settled: server.settled, detach };
}
```

- [ ] **Step 5: 순수 테스트 통과 확인**

```bash
node --test "desktop/test/**/*.test.ts"
```
Expected: `# pass 4`.

- [ ] **Step 6: bridge-main 구현 (DesktopBridge 서버측)**

`desktop/src/bridge-main.ts`:
```ts
import type { BrowserWindow, Dialog, IpcMain, NativeTheme, Shell } from "electron";
import type { Host } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import type { SettingsStore } from "./settings-store.ts";
import { createAttachmentService, type AttachmentService } from "./attachments.ts";

export interface BridgeDeps {
  readonly ipcMain: IpcMain;
  readonly window: BrowserWindow;
  readonly settings: SettingsStore;
  readonly host: Host;
  readonly nativeTheme: NativeTheme;
  readonly shell: Shell;
  readonly dialog: Dialog;
  readonly appVersion: string;
  readonly userDataDir: string;
  readonly userName: string;
}

type ThemePreference = "system" | "light" | "dark";
type Handler = (args: Record<string, unknown>) => Promise<unknown> | unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function themeState(settings: SettingsStore, nativeTheme: NativeTheme): { preference: ThemePreference; resolved: "light" | "dark" } {
  const preference = settings.get<ThemePreference>("theme.preference", "system");
  const resolved = preference === "system" ? (nativeTheme.shouldUseDarkColors ? "dark" : "light") : preference;
  return { preference, resolved };
}

function updateStatus(appVersion: string): unknown {
  return {
    state: { type: "disabled", reason: "not-packaged" },
    currentVersion: appVersion, currentTrack: "stable", trackOverride: null, buildDefaultTrack: "stable", availableTracks: ["stable"],
    isTrackManagedByPolicy: false, isBelowMinimumVersion: false, autoUpdateWhenIdleOptIn: false, autoUpdateWhenIdleGateEnabled: false,
  };
}

export function createBridgeHandlers(deps: BridgeDeps, attachments: AttachmentService): Record<string, Handler> {
  const { settings, window, nativeTheme, shell } = deps;
  const push = (event: string, payload: unknown): void => {
    if (!window.isDestroyed()) window.webContents.send("herdr-bot:bridge-event", { event, payload });
  };
  const windowState = () => ({ isFullscreen: window.isFullScreen(), isMaximized: window.isMaximized() });
  const account = { kind: "logged-in", displayName: deps.userName, email: undefined, isAnysphereUser: false };
  const granted = { state: "granted", reason: "none" };

  return {
    // shell / window
    openExternal: async ({ url }) => { if (typeof url === "string" && /^https?:\/\//.test(url)) await shell.openExternal(url); },
    getWindowState: () => windowState(),
    minimizeWindow: () => { window.minimize(); },
    toggleMaximizeWindow: () => { if (window.isMaximized()) window.unmaximize(); else window.maximize(); },
    closeWindow: () => { window.close(); },
    setTitleBarOverlayTone: () => undefined,
    resizeWindowWidth: ({ deltaWidth }) => { const [w, h] = window.getSize(); const next = Math.max(512, w + (typeof deltaWidth === "number" ? deltaWidth : 0)); window.setSize(next, h); return next; },
    getZoomFactor: () => window.webContents.getZoomFactor(),
    // theme
    getThemeState: () => themeState(settings, nativeTheme),
    setThemePreference: ({ preference }) => {
      if (preference === "system" || preference === "light" || preference === "dark") { settings.set("theme.preference", preference); nativeTheme.themeSource = preference; }
      const state = themeState(settings, nativeTheme); push("theme-changed", state); return state;
    },
    // account & access gates
    getCursorAuthStatus: () => account,
    getSandAccess: () => granted,
    getSandAccessFresh: () => granted,
    getCursorUsageSummary: () => null,
    getCursorAvatar: () => null,
    getCursorWeeklyUsage: () => null,
    getCursorPrReviewPreferences: () => null,
    getCursorPrivacyModeEnabled: () => false,
    // updates / onboarding / misc state
    getUpdateStatus: () => updateStatus(deps.appVersion),
    checkForUpdates: () => updateStatus(deps.appVersion),
    getOnboardingSeen: () => settings.get("onboarding.seen", true),
    setOnboardingSeen: ({ seen }) => { settings.set("onboarding.seen", seen === true); },
    getBoxMigrationStatus: () => null,
    markDeepLinksReady: () => undefined,
    getTimeZone: () => ({ detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, overrideTimeZone: settings.get<string | null>("timezone.override", null) }),
    setTimeZoneOverride: ({ timeZone }) => { settings.set("timezone.override", typeof timeZone === "string" ? timeZone : null); return { detectedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, overrideTimeZone: settings.get<string | null>("timezone.override", null) }; },
    getAutoReviewInstructions: () => settings.get("autoReview", { isEnabled: false, allowInstructions: [], blockInstructions: [] }),
    setAutoReviewInstructions: (args) => { settings.set("autoReview", args); return args; },
    getLocalToolPermission: () => "ask",
    getLocalToolPermissionCeiling: () => "always",
    setLocalToolPermission: ({ permission }) => permission,
    recordLocalToolApproval: () => undefined,
    clearLocalToolApprovals: () => undefined,
    getSidebarCollapsed: () => settings.get("sidebar.collapsed", false),
    setSidebarCollapsed: ({ collapsed }) => { settings.set("sidebar.collapsed", collapsed === true); },
    getHostPinnedAgents: () => settings.get<string[] | null>("pinnedAgents", null),
    setHostPinnedAgents: ({ pinnedAgentIds }) => { const ids = Array.isArray(pinnedAgentIds) ? pinnedAgentIds.filter((id): id is string => typeof id === "string") : []; settings.set("pinnedAgents", ids); return ids; },
    getHostSidebarSections: () => settings.get<unknown[] | null>("sidebarSections", null),
    setHostSidebarSections: ({ sections }) => { settings.set("sidebarSections", Array.isArray(sections) ? sections : []); return Array.isArray(sections) ? sections : []; },
    getAgentDefaultModel: () => null,
    setAgentDefaultModel: ({ model }) => model ?? null,
    getComputerUseModel: () => null,
    setComputerUseModel: () => null,
    getAvailableModels: () => ({ models: [] }),
    // client persistence (renderer-owned slices such as composer drafts)
    persistenceRead: ({ key }) => settings.get<string | null>(`persist:${String(key)}`, null),
    persistenceWrite: ({ key, value }) => { settings.set(`persist:${String(key)}`, String(value)); },
    persistenceRemove: ({ key }) => { settings.remove(`persist:${String(key)}`); },
    persistenceListKeys: ({ prefix }) => settings.keys(`persist:${String(prefix ?? "")}`).map((key) => key.slice("persist:".length)),
    persistenceMigrate: ({ entries }) => { if (Array.isArray(entries)) for (const entry of entries) if (isRecord(entry) && typeof entry.key === "string") settings.set(`persist:${entry.key}`, String(entry.value)); return true; },
    // attachments (Task 3 fills these in)
    ...attachments.handlers,
    // things herdr-bot does not have
    getExperimentsSnapshot: () => ({}),
    applyFeatureFlagOverride: () => undefined,
    refreshFeatureFlags: () => undefined,
    startRpcTraceWindow: () => false,
    getEgressTunnelEnabled: () => false,
    setEgressTunnelEnabled: () => false,
    getEgressTunnelStatus: () => null,
    getWebauthnProxyEnabled: () => false,
    setWebauthnProxyEnabled: () => false,
    forceRecreateComputer: () => null,
    updateComputer: () => null,
    forceReconnectGateway: () => undefined,
    listSecrets: () => ({ keys: [], isPersistent: false }),
    revealSecret: () => null,
    upsertSecrets: () => ({ synced: false }),
    removeSecrets: () => ({ synced: false }),
    mcpList: () => ({ servers: [] }),
    mcpEffectivePlugins: () => [],
    mcpCatalog: () => [],
    mcpTeamPopularity: () => ({}),
    mcpPluginLogo: () => null,
    getLinkMetadata: () => null,
    submitFeedback: () => { throw new Error("Feedback is not available in herdr-bot."); },
    transcribeAudio: () => { throw new Error("Voice transcription is not available in herdr-bot."); },
    generateAgentAvatarImage: () => { throw new Error("Avatar generation is not available in herdr-bot."); },
    pickAvatarSource: () => null,
    openCloudAgent: () => undefined,
    loginCursor: () => account,
    cancelCursorLogin: () => account,
    logoutCursor: () => account,
    updateCursorAccountName: () => account,
    invokeCursorDashboardAction: () => null,
    cancelCursorSandTrial: () => null,
    // window/theme pushes are wired in registerBridge
    _pushWindowState: () => { push("window-state", windowState()); },
    _pushZoom: () => { push("zoom-factor-changed", window.webContents.getZoomFactor()); },
    _pushTheme: () => { push("theme-changed", themeState(settings, nativeTheme)); },
  };
}

export function registerBridge(deps: BridgeDeps): void {
  const attachments = createAttachmentService({ dialog: deps.dialog, window: deps.window, userDataDir: deps.userDataDir });
  const handlers = createBridgeHandlers(deps, attachments);
  deps.ipcMain.handle("herdr-bot:bridge", async (_event, request: unknown) => {
    const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
    const args = isRecord(request) && isRecord(request.args) ? request.args : {};
    const handler = handlers[method];
    if (handler == null) throw new Error(`unknown bridge method "${method}"`);
    try {
      return await handler(args);
    } catch (error) {
      log("bridge", `${method} failed`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  });
  deps.ipcMain.on("herdr-bot:bridge-sync", (event, request: unknown) => {
    const method = isRecord(request) && typeof request.method === "string" ? request.method : "";
    event.returnValue = method === "getThemeState" ? themeState(deps.settings, deps.nativeTheme) : null;
  });
  deps.nativeTheme.themeSource = deps.settings.get<ThemePreference>("theme.preference", "system");
  // OS theme flips only re-broadcast the resolved state; themeSource is assigned solely from the renderer's setThemePreference.
  deps.nativeTheme.on("updated", () => handlers._pushTheme!({}));
  for (const event of ["enter-full-screen", "leave-full-screen", "maximize", "unmaximize"] as const) deps.window.on(event, () => handlers._pushWindowState!({}));
  deps.window.webContents.on("zoom-changed", () => handlers._pushZoom!({}));
}
```

`desktop/src/attachments.ts` (Task 3에서 완성; 이 태스크에서는 컴파일되는 최소 골격):
```ts
import type { BrowserWindow, Dialog } from "electron";

export interface AttachmentService {
  readonly handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>;
}

export interface AttachmentServiceDeps {
  readonly dialog: Dialog;
  readonly window: BrowserWindow;
  readonly userDataDir: string;
}

export function createAttachmentService(_deps: AttachmentServiceDeps): AttachmentService {
  return {
    handlers: {
      resolveAttachmentMedia: () => null,
      readAttachmentText: () => null,
      readAttachmentBytes: () => null,
      downloadAttachment: () => false,
      stageAttachmentBytes: () => ({ ok: false, reason: "failed" }),
      commitStagedAttachments: () => null,
      discardStagedAttachment: () => undefined,
      pickAvatarFile: () => null,
    },
  };
}
```

- [ ] **Step 7: preload 구현**

`desktop/src/preload.cts`:
```ts
import { contextBridge, ipcRenderer, webFrame } from "electron";

type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
ipcRenderer.on("herdr-bot:bridge-event", (_event, message: { event: string; payload: unknown }) => {
  for (const listener of [...(listeners.get(message.event) ?? [])]) listener(message.payload);
});

function on(event: string): (listener: Listener) => () => void {
  return (listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return () => { set.delete(listener); };
  };
}

function invoke(method: string, args: unknown = {}): Promise<unknown> {
  return ipcRenderer.invoke("herdr-bot:bridge", { method, args });
}

function sync(method: string): unknown {
  return ipcRenderer.sendSync("herdr-bot:bridge-sync", { method });
}

const noop = (): undefined => undefined;
const never = (name: string) => (): Promise<never> => Promise.reject(new Error(`${name} is not available in herdr-bot`));
const nothing = (): (() => void) => () => undefined;

const themeInitial = sync("getThemeState") as { preference: string; resolved: string };

const desktop = {
  resolveAttachmentMedia: (url: string) => invoke("resolveAttachmentMedia", { source: url }),
  readAttachmentText: (path: string) => invoke("readAttachmentText", { path }),
  readAttachmentBytes: (path: string, maxBytes: number) => invoke("readAttachmentBytes", { path, maxBytes }),
  downloadAttachment: (path: string, suggestedName?: string) => invoke("downloadAttachment", { path, suggestedName }),
  getLinkMetadata: (url: string) => invoke("getLinkMetadata", { url }),
  openExternal: (url: string) => invoke("openExternal", { url }),
  openCloudAgent: (bcId: string) => invoke("openCloudAgent", { bcId }),
  stageAttachmentBytes: (filename: string, bytes: Uint8Array) => invoke("stageAttachmentBytes", { filename, bytes }),
  commitStagedAttachments: (paths: readonly string[], filenames: readonly string[]) => invoke("commitStagedAttachments", { paths: [...paths], filenames: [...filenames] }),
  discardStagedAttachment: (path: string) => invoke("discardStagedAttachment", { path }),
  mcp: {
    list: () => invoke("mcpList"),
    effectivePlugins: () => invoke("mcpEffectivePlugins"),
    catalog: () => invoke("mcpCatalog"),
    teamPopularity: () => invoke("mcpTeamPopularity"),
    pluginLogo: (url: string) => invoke("mcpPluginLogo", { url }),
    install: never("mcp.install"), updatePluginInstall: never("mcp.updatePluginInstall"), remove: never("mcp.remove"), uninstallPlugin: never("mcp.uninstallPlugin"),
    authenticate: never("mcp.authenticate"), renameAccount: never("mcp.renameAccount"), removeAccount: never("mcp.removeAccount"), setCustomInstructions: never("mcp.setCustomInstructions"),
    listServerTools: async () => [], toggleToolDisabled: async () => [], onAuthCompleted: nothing(),
  },
  forceGatewayReconnect: () => invoke("forceReconnectGateway"),
  pickAvatarSource: () => invoke("pickAvatarSource"),
  pickAvatarFile: () => invoke("pickAvatarFile"),
  generateAgentAvatarImage: (description: string) => invoke("generateAgentAvatarImage", { description }),
  onFocusAgent: on("focus-agent"),
  onDeepLink: on("deep-link"),
  deepLinksReady: () => invoke("markDeepLinksReady"),
  getBoxMigrationStatus: () => invoke("getBoxMigrationStatus"),
  onBoxMigration: nothing(),
  onDevBoxRebuild: nothing(),
  onOpenFeedback: on("open-feedback"),
  onOpenAbout: on("open-about"),
  submitFeedback: (payload: unknown) => invoke("submitFeedback", { payload }),
  onWidgetGallery: nothing(),
  onForceOnboarding: on("force-onboarding"),
  transcribeAudio: never("transcribeAudio"),
  cursorAccount: {
    getStatus: () => invoke("getCursorAuthStatus"),
    login: () => invoke("loginCursor"), cancelLogin: () => invoke("cancelCursorLogin"), logout: () => invoke("logoutCursor"),
    updateName: (name: string) => invoke("updateCursorAccountName", { name }),
    getAvatar: () => invoke("getCursorAvatar"), getWeeklyUsage: () => invoke("getCursorWeeklyUsage"), getUsageSummary: () => invoke("getCursorUsageSummary"),
    getPrReviewPreferences: () => invoke("getCursorPrReviewPreferences"), getPrivacyModeEnabled: () => invoke("getCursorPrivacyModeEnabled"),
    getSandAccess: () => invoke("getSandAccess"), getSandAccessFresh: () => invoke("getSandAccessFresh"),
    invokeDashboardAction: (request: unknown) => invoke("invokeCursorDashboardAction", { request }), cancelTrial: () => invoke("cancelCursorSandTrial"),
    onStatusChanged: on("cursor-auth-changed"),
  },
  experiments: { initialSnapshot: {}, getSnapshot: () => invoke("getExperimentsSnapshot"), applyFeatureFlagOverride: () => invoke("applyFeatureFlagOverride"), refresh: () => invoke("refreshFeatureFlags"), startRpcTraceWindow: () => invoke("startRpcTraceWindow"), onChanged: nothing() },
  platform: process.platform,
  isDev: process.env.HERDR_BOT_DEV === "1",
  getWindowState: () => invoke("getWindowState"),
  onWindowStateEvent: on("window-state"),
  getZoomFactor: () => webFrame.getZoomFactor(),
  onZoomFactorEvent: on("zoom-factor-changed"),
  windowControls: {
    minimize: () => invoke("minimizeWindow"), toggleMaximize: () => invoke("toggleMaximizeWindow"), close: () => invoke("closeWindow"),
    setTitleBarOverlayTone: (isOverlayTone: boolean) => invoke("setTitleBarOverlayTone", { isOverlayTone }),
    resizeWidth: (deltaWidth: number) => invoke("resizeWindowWidth", { deltaWidth }),
  },
  foreverBox: {
    forceRecreate: () => invoke("forceRecreateComputer"), update: (id: string, force = false) => invoke("updateComputer", { id, force }),
    onVncUserPresence: nothing(), onDevBoxPullProgress: nothing(),
    egressTunnel: { initial: false, initialStatus: null, get: () => invoke("getEgressTunnelEnabled"), set: (enabled: boolean) => invoke("setEgressTunnelEnabled", { enabled }), onChanged: nothing(), getStatus: () => invoke("getEgressTunnelStatus"), onStatusChanged: nothing() },
    webauthnProxy: { initial: false, get: () => invoke("getWebauthnProxyEnabled"), set: (enabled: boolean) => invoke("setWebauthnProxyEnabled", { enabled }), onChanged: nothing() },
  },
  onboarding: { getSeen: () => invoke("getOnboardingSeen"), setSeen: (seen: boolean) => invoke("setOnboardingSeen", { seen }), onSkip: on("skip-onboarding") },
  telemetry: Object.fromEntries(["reportAgentLoad", "reportBoxVisibility", "reportSendLatency", "reportHeapMetrics", "reportSendAck", "reportReactionAck", "reportRenderTtfr", "reportRenderStream", "reportAgentsUnreachable", "reportAccessBlocked", "reportRecoveryAction", "reportRebuildLifecycle", "reportReconciliation", "reportVncSession", "reportVncLiveness", "reportOpenComputer", "reportUpdatePrompt", "reportSigninGate", "reportOnboardingStep", "reportClientFailure", "noteSentryConversation"].map((name) => [name, noop])),
  timeZone: { get: () => invoke("getTimeZone"), setOverride: (timeZone: string | null) => invoke("setTimeZoneOverride", { timeZone }) },
  autoReviewInstructions: { get: () => invoke("getAutoReviewInstructions"), set: (instructions: unknown) => invoke("setAutoReviewInstructions", instructions) },
  localToolPermission: {
    get: () => invoke("getLocalToolPermission"), set: (permission: unknown) => invoke("setLocalToolPermission", { permission }), ceiling: () => invoke("getLocalToolPermissionCeiling"),
    recordApproval: (approvalId: string, action: unknown, target: unknown) => invoke("recordLocalToolApproval", { approvalId, action, target }), clearApprovals: () => invoke("clearLocalToolApprovals"),
  },
  theme: { initial: themeInitial, get: () => invoke("getThemeState"), set: (preference: string) => invoke("setThemePreference", { preference }), onChanged: on("theme-changed") },
  secrets: { list: () => invoke("listSecrets"), reveal: (key: string) => invoke("revealSecret", { key }), upsert: (entries: unknown) => invoke("upsertSecrets", { entries }), remove: (keys: readonly string[]) => invoke("removeSecrets", { keys: [...keys] }) },
  agent: {
    getPinnedAgents: () => invoke("getHostPinnedAgents"), setPinnedAgents: (pinnedAgentIds: readonly string[]) => invoke("setHostPinnedAgents", { pinnedAgentIds: [...pinnedAgentIds] }),
    getSidebarSections: () => invoke("getHostSidebarSections"), setSidebarSections: (sections: readonly unknown[]) => invoke("setHostSidebarSections", { sections: [...sections] }),
    getDefaultModel: () => invoke("getAgentDefaultModel"), setDefaultModel: (model: unknown) => invoke("setAgentDefaultModel", { model }),
    getComputerUseModel: () => invoke("getComputerUseModel"), setComputerUseModel: (model: unknown) => invoke("setComputerUseModel", { model }),
    getAvailableModels: () => invoke("getAvailableModels"),
    clientPersistence: {
      read: (key: string) => invoke("persistenceRead", { key }), write: (key: string, value: string) => invoke("persistenceWrite", { key, value }),
      remove: (key: string) => invoke("persistenceRemove", { key }), listKeys: (prefix: string) => invoke("persistenceListKeys", { prefix }),
      migrateFromLocalStorage: (entries: readonly unknown[]) => invoke("persistenceMigrate", { entries: [...entries] }),
    },
  },
  update: { getStatus: () => invoke("getUpdateStatus"), check: () => invoke("checkForUpdates"), setTrack: () => invoke("getUpdateStatus"), quitAndInstall: async () => undefined, setAutoUpdateWhenIdleOptIn: () => invoke("getUpdateStatus"), onStatusEvent: on("update-status") },
  attachProdBox: { getStatus: async () => null, setEnabled: async () => null },
};

let portOwner: { onPort(port: unknown): void } | null = null;
ipcRenderer.on("herdr-bot:coordinator-port", (event) => {
  const port = event.ports[0];
  if (port == null || portOwner == null) return;
  const wrapped = {
    postMessage: (message: unknown) => port.postMessage(message),
    close: () => port.close(),
    start: () => port.start(),
    addEventListener: (type: "message" | "close", listener: (event: { data?: unknown }) => void) => {
      if (type === "message") port.addEventListener("message", (message) => listener({ data: message.data }));
      else port.addEventListener("close", () => listener({}));
    },
  };
  portOwner.onPort(wrapped);
});

const coordinatorPort = {
  claim(consumer: { onPort(port: unknown): void }) {
    if (portOwner != null) return null;
    portOwner = consumer;
    return {
      request: () => { if (portOwner === consumer) ipcRenderer.send("herdr-bot:coordinator-port-request"); },
      release: () => { if (portOwner === consumer) portOwner = null; },
    };
  },
};

contextBridge.exposeInMainWorld("desktop", desktop);
contextBridge.exposeInMainWorld("coordinatorPort", coordinatorPort);
```

- [ ] **Step 8: main 구현**

`desktop/src/main.ts`:
```ts
import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, nativeTheme, shell } from "electron";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "../../core/src/config.ts";
import { createHost, type Host } from "../../core/src/host.ts";
import { log } from "../../core/src/log.ts";
import { registerBridge } from "./bridge-main.ts";
import { attachRendererPort } from "./coordinator-port.ts";
import { SettingsStore } from "./settings-store.ts";
import { DEFAULT_WINDOW_SIZE, MIN_WINDOW_SIZE, WINDOW_BACKGROUND, windowChromeOptions } from "./window-chrome.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rendererIndex = join(here, "..", "..", "..", "..", "renderer", "dist", "index.html");
const preloadPath = join(here, "preload.cjs");

async function bootHost(): Promise<Host> {
  const config = resolveConfig(process.env);
  const host = createHost(config);
  await host.start();
  return host;
}

function createWindow(host: Host): BrowserWindow {
  const settings = new SettingsStore(join(app.getPath("userData"), "herdr-bot-desktop.json"));
  const window = new BrowserWindow({
    ...DEFAULT_WINDOW_SIZE,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    backgroundColor: WINDOW_BACKGROUND,
    show: false,
    ...windowChromeOptions(process.platform),
    webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  registerBridge({ ipcMain, window, settings, host, nativeTheme, shell, dialog, appVersion: app.getVersion(), userDataDir: app.getPath("userData"), userName: host.config.userName || userInfo().username });
  ipcMain.on("herdr-bot:coordinator-port-request", (event) => {
    if (event.sender !== window.webContents) return;
    const { port1, port2 } = new MessageChannelMain();
    attachRendererPort(port1, host);
    event.sender.postMessage("herdr-bot:coordinator-port", null, [port2]);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.once("ready-to-show", () => window.show());
  return window;
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const devUrl = process.env.HERDR_BOT_RENDERER_URL;
  if (devUrl != null && devUrl.length > 0) {
    await window.loadURL(devUrl);
    return;
  }
  if (!existsSync(rendererIndex)) throw new Error(`renderer build missing at ${rendererIndex}; run \`npm run renderer:build\``);
  await window.loadFile(rendererIndex);
}

app.whenReady().then(async () => {
  const host = await bootHost();
  const window = createWindow(host);
  await loadRenderer(window);
  if (process.env.HERDR_BOT_SMOKE === "1") {
    const mounted = await window.webContents.executeJavaScript("document.getElementById('root')?.childElementCount > 0");
    process.stdout.write(`smoke: ${mounted === true ? "ok" : "empty-root"}\n`);
    await host.stop();
    app.quit();
    return;
  }
  app.on("before-quit", () => { void host.stop(); });
}).catch((error: unknown) => {
  log("desktop", "startup failed", error instanceof Error ? error.stack ?? error.message : String(error));
  dialog.showErrorBox("herdr-bot could not start", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 9: 빌드 + 첫 실행 (빈 로스터로 "No chats yet")**

```bash
npm install
npm run typecheck
npm run desktop:build
ls desktop/dist/desktop/src/main.js desktop/dist/desktop/src/preload.cjs
HERDR_BOT_HOME=/tmp/hb-desk HERDR_BOT_SMOKE=1 npm run start -w @herdr-bot/desktop
```
Expected: 마지막 명령 stdout에 `smoke: ok`. (herdr가 실행 중이 아니어도 호스트는 뜬다 — `agent list` 실패는 로그로만 남는다.) 그 다음 스모크 없이 실행:
```bash
HERDR_BOT_HOME=/tmp/hb-desk npm run start -w @herdr-bot/desktop
```
Expected: grok-bot 모양의 창(다크, 왼쪽 사이드바 + 검색 + `New` 버튼, 가운데 "No chats yet" 빈 상태, 하단 계정 행에 OS 사용자명). 콘솔(`Cmd+Alt+I`)에 invariant 에러가 없어야 한다. 에러가 있으면 preload에서 빠진 키를 `DESKTOP_BRIDGE_TOP_LEVEL_KEYS`(renderer/src/recovered/contracts/desktop-bridge.ts)와 대조해 추가한다.

- [ ] **Step 10: 커밋**

```bash
git add desktop package.json package-lock.json
git commit -m "feat(desktop): boot the forked renderer in Electron over the herdr-bot host"
```

---

### Task 3: 첨부파일/다운로드/아바타 파일 브리지

**Files:**
- Modify: `desktop/src/attachments.ts` (Task 2 골격 교체)
- Test: `desktop/test/attachments.test.ts`

**Interfaces:**
- Produces `createAttachmentService(deps)`의 handlers:
  - `stageAttachmentBytes({filename, bytes})` → `{ok:true, path}` (`<userData>/staged/<uuid>-<safe filename>`), 빈/25MB 초과 → `{ok:false, reason:"empty"|"too-large"}`
  - `commitStagedAttachments({paths})` → `paths` 그대로(호스트는 경로를 프롬프트에 넘김) / `discardStagedAttachment({path})` → staged 디렉터리 안 파일만 삭제
  - `resolveAttachmentMedia({source})` → 이미지 확장자면 `{kind:"image", dataUrl, width:null, height:null}`, 비디오/오디오면 `{kind:"video"|"audio", src: file URL}`, 그 외 `null`
  - `readAttachmentText({path})` → `{kind:"text", text, truncated, bytes}` (1MB 초과 시 잘림) 또는 바이너리 판정 시 `{kind:"binary", bytes}`
  - `readAttachmentBytes({path, maxBytes})` → `{kind:"bytes", bytes}` | `{kind:"too-large", size}`
  - `downloadAttachment({path, suggestedName})` → 저장 다이얼로그 후 복사, 취소 시 `false`
  - `pickAvatarFile()` → 이미지 파일 선택 → `{dataUrl, fileName}` | `null`
- 순수 부분(`safeFilename`, `mediaKindFor(path)`, `looksBinary(buffer)`)을 export해서 테스트한다.

- [ ] **Step 1: 실패하는 테스트**

`desktop/test/attachments.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createAttachmentService, looksBinary, mediaKindFor, safeFilename } from "../src/attachments.ts";
import { makeTempHome } from "../../core/test/helpers/temp-home.ts";

test("pure helpers", () => {
  assert.equal(safeFilename("../evil name?.png"), "evil-name-.png");
  assert.equal(mediaKindFor("/x/a.PNG"), "image");
  assert.equal(mediaKindFor("/x/a.mov"), "video");
  assert.equal(mediaKindFor("/x/a.mp3"), "audio");
  assert.equal(mediaKindFor("/x/a.pdf"), null);
  assert.equal(looksBinary(Buffer.from("hello\nworld")), false);
  assert.equal(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])), true);
});

test("stage → read → discard round-trip without Electron", async () => {
  const temp = makeTempHome();
  try {
    const service = createAttachmentService({ dialog: null, window: null, userDataDir: temp.home });
    const staged = (await service.handlers.stageAttachmentBytes!({ filename: "notes.txt", bytes: new Uint8Array(Buffer.from("hi there")) })) as { ok: boolean; path: string };
    assert.equal(staged.ok, true);
    assert.ok(staged.path.startsWith(join(temp.home, "staged")));
    assert.deepEqual(await service.handlers.readAttachmentText!({ path: staged.path }), { kind: "text", text: "hi there", truncated: false, bytes: 8 });
    const bytes = (await service.handlers.readAttachmentBytes!({ path: staged.path, maxBytes: 4 })) as { kind: string; size?: number };
    assert.deepEqual(bytes, { kind: "too-large", size: 8 });
    assert.deepEqual(await service.handlers.commitStagedAttachments!({ paths: [staged.path], filenames: ["notes.txt"] }), [staged.path]);
    await service.handlers.discardStagedAttachment!({ path: staged.path });
    assert.equal(await service.handlers.readAttachmentText!({ path: staged.path }), null);
    const empty = await service.handlers.stageAttachmentBytes!({ filename: "e", bytes: new Uint8Array() });
    assert.deepEqual(empty, { ok: false, reason: "empty" });
    const png = join(temp.home, "p.png");
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const media = (await service.handlers.resolveAttachmentMedia!({ source: png })) as { kind: string; dataUrl: string };
    assert.equal(media.kind, "image");
    assert.ok(media.dataUrl.startsWith("data:image/png;base64,"));
  } finally {
    temp.cleanup();
  }
});
```

- [ ] **Step 2: 실패 확인**

```bash
node --test desktop/test/attachments.test.ts
```
Expected: FAIL — `safeFilename` export 없음.

- [ ] **Step 3: 구현**

`desktop/src/attachments.ts`:
```ts
import type { BrowserWindow, Dialog } from "electron";
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface AttachmentService {
  readonly handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>;
}

export interface AttachmentServiceDeps {
  readonly dialog: Dialog | null;
  readonly window: BrowserWindow | null;
  readonly userDataDir: string;
}

export const MAX_STAGED_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".svg", ".ico"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".ogv"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".oga", ".opus", ".weba"]);
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp", ".avif": "image/avif", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

export function safeFilename(name: string): string {
  const base = basename(name).replace(/[^A-Za-z0-9._-]+/g, "-");
  return base.length > 0 ? base : "attachment";
}

export function mediaKindFor(path: string): "image" | "video" | "audio" | null {
  const extension = extname(path).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  return null;
}

export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  for (const byte of sample) if (byte === 0) return true;
  return false;
}

function str(args: Record<string, unknown>, key: string): string | null {
  return typeof args[key] === "string" && (args[key] as string).length > 0 ? (args[key] as string) : null;
}

export function createAttachmentService(deps: AttachmentServiceDeps): AttachmentService {
  const stagedDir = join(deps.userDataDir, "staged");
  const isStaged = (path: string): boolean => resolve(path).startsWith(resolve(stagedDir) + "/");

  return {
    handlers: {
      stageAttachmentBytes: ({ filename, bytes }) => {
        const buffer = bytes instanceof Uint8Array ? Buffer.from(bytes) : null;
        if (buffer == null || buffer.length === 0) return { ok: false, reason: "empty" };
        if (buffer.length > MAX_STAGED_BYTES) return { ok: false, reason: "too-large" };
        mkdirSync(stagedDir, { recursive: true });
        const path = join(stagedDir, `${randomUUID()}-${safeFilename(String(filename ?? "attachment"))}`);
        try {
          writeFileSync(path, buffer);
        } catch {
          return { ok: false, reason: "failed" };
        }
        return { ok: true, path };
      },
      commitStagedAttachments: ({ paths }) => (Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : null),
      discardStagedAttachment: ({ path }) => {
        const target = typeof path === "string" ? path : "";
        if (isStaged(target)) { try { unlinkSync(target); } catch { /* already gone */ } }
      },
      resolveAttachmentMedia: (args) => {
        const source = str(args, "source");
        if (source == null) return null;
        const path = source.startsWith("file://") ? decodeURIComponent(new URL(source).pathname) : source;
        const kind = mediaKindFor(path);
        if (kind == null) return null;
        if (kind === "image") {
          try {
            const mime = MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? "application/octet-stream";
            return { kind, dataUrl: `data:${mime};base64,${readFileSync(path).toString("base64")}`, width: null, height: null };
          } catch {
            return null;
          }
        }
        return kind === "video" ? { kind, src: pathToFileURL(path).href, width: null, height: null } : { kind, src: pathToFileURL(path).href };
      },
      readAttachmentText: (args) => {
        const path = str(args, "path");
        if (path == null) return null;
        let buffer: Buffer;
        try { buffer = readFileSync(path); } catch { return null; }
        if (looksBinary(buffer)) return { kind: "binary", bytes: buffer.length };
        const truncated = buffer.length > MAX_TEXT_BYTES;
        return { kind: "text", text: buffer.subarray(0, MAX_TEXT_BYTES).toString("utf8"), truncated, bytes: buffer.length };
      },
      readAttachmentBytes: (args) => {
        const path = str(args, "path");
        const maxBytes = typeof args.maxBytes === "number" ? args.maxBytes : MAX_STAGED_BYTES;
        if (path == null) return null;
        let size: number;
        try { size = statSync(path).size; } catch { return null; }
        if (size > maxBytes) return { kind: "too-large", size };
        return { kind: "bytes", bytes: new Uint8Array(readFileSync(path)) };
      },
      downloadAttachment: async (args) => {
        const path = str(args, "path");
        if (path == null || deps.dialog == null || deps.window == null) return false;
        const result = await deps.dialog.showSaveDialog(deps.window, { defaultPath: str(args, "suggestedName") ?? basename(path) });
        if (result.canceled || result.filePath == null) return false;
        copyFileSync(path, result.filePath);
        return true;
      },
      pickAvatarFile: async () => {
        if (deps.dialog == null || deps.window == null) return null;
        const result = await deps.dialog.showOpenDialog(deps.window, { properties: ["openFile"], filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
        const file = result.filePaths[0];
        if (result.canceled || file == null) return null;
        const mime = MIME_BY_EXTENSION[extname(file).toLowerCase()] ?? "image/png";
        return { dataUrl: `data:${mime};base64,${readFileSync(file).toString("base64")}`, fileName: basename(file) };
      },
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

```bash
node --test desktop/test/attachments.test.ts && npm run typecheck
```
Expected: `# pass 2`.

- [ ] **Step 5: 커밋**

```bash
git add desktop/src/attachments.ts desktop/test/attachments.test.ts
git commit -m "feat(desktop): stage, read, preview, and download attachments through the bridge"
```

---

### Task 4: 개발 워크플로 + 가짜 herdr로 로스터/트랜스크립트 왕복 확인

**Files:**
- Create: `scripts/dev-fake-herdr.mjs` (가짜 herdr 상태를 시드하고 Electron을 가짜 바이너리로 띄우는 스크립트)
- Modify: 루트 `package.json` scripts (`desktop:dev:fake`)

**Interfaces:**
- Produces: `npm run desktop:dev:fake` — 실제 herdr 없이 앱을 띄워 UI ↔ 호스트 왕복을 눈으로 확인. 가짜 봇 `reviewer`/`writer`는 프롬프트를 받으면 `say`로 답한다.

- [ ] **Step 1: 스크립트 작성**

`scripts/dev-fake-herdr.mjs`:
```js
#!/usr/bin/env node
// Launches the desktop app against the test fake herdr so the UI can be exercised without a real herdr session.
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const home = process.env.HERDR_BOT_HOME ?? "/tmp/hb-dev-fake";
mkdirSync(home, { recursive: true });
const fakeBin = join(root, "core", "test", "helpers", "fake-herdr.mjs");
chmodSync(fakeBin, 0o755);
const statePath = join(home, "fake-herdr-state.json");
writeFileSync(statePath, JSON.stringify({
  agents: [],
  workspaces: [],
  onPrompt: {
    reviewer: { say: ["Reviewed. Two nits: naming in auth.ts and a missing test."], finalStatus: "idle" },
    writer: { say: ["Draft ready in docs/auth.md — want a shorter version?"], finalStatus: "idle" },
  },
}, null, 2));

const env = {
  ...process.env,
  HERDR_BOT_HOME: home,
  HERDR_BIN_PATH: fakeBin,
  HERDR_SOCKET_PATH: join(home, "no-herdr.sock"),
  FAKE_HERDR_STATE: statePath,
  FAKE_HERDR_LOG: join(home, "fake-herdr-log.jsonl"),
  HERDR_BOT_USER_NAME: process.env.HERDR_BOT_USER_NAME ?? "ray",
  HERDR_BOT_DEV: "1",
};
const child = spawn("npm", ["run", "start", "-w", "@herdr-bot/desktop"], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
```

루트 `package.json` scripts:
```json
    "desktop:dev:fake": "npm run build -w @herdr-bot/desktop && node scripts/dev-fake-herdr.mjs"
```

- [ ] **Step 2: 실행하고 UI에서 왕복 확인**

```bash
npm run renderer:build
npm run desktop:dev:fake
```
앱이 뜨면 (아직 새 봇 다이얼로그가 없으므로) 별도 터미널에서 CLI로 데이터를 넣는다:
```bash
export HERDR_BOT_HOME=/tmp/hb-dev-fake
node cli/src/main.ts bot create reviewer --name Reviewer --kind claude --cwd /tmp
node cli/src/main.ts bot create writer --name Writer --kind claude --cwd /tmp
node cli/src/main.ts room create "Auth refactor" --members reviewer,writer
```
Expected:
- 사이드바에 `Reviewer`, `Writer`, `Auth refactor`(그룹 아바타)가 **CLI 실행 직후** 나타난다(`agents` 이벤트 → 포트 → 렌더러).
- `Auth refactor`를 클릭 → 빈 트랜스크립트. 컴포저에 "리뷰 부탁"을 입력해 Enter → 내 메시지가 즉시 뜨고(펜딩→sent, `clientNonce` 매칭), 1~2초 내 Reviewer/Writer의 답이 이어서 뜬다. 방 행에 Working 표시가 잠깐 켜진다.
- `Reviewer`(DM)를 클릭해 메시지를 보내면 한 번의 답이 온다.
- 메시지에 마우스를 올려 리액션 👍를 누르면 표시된다(`reactToMessage` → `updated` 이벤트).
- 봇 행 우클릭 → Delete → 사이드바에서 사라진다.

문제가 나면 `Cmd+Alt+I` 콘솔과 호스트 로그(stderr, `[herdr-bot:...]`)를 함께 본다. 현재 단계에서 그룹 메시지는 저자 이름 없이 방 이름으로 표시되는 것이 정상이다(Task 7에서 고침).

- [ ] **Step 3: 커밋**

```bash
git add scripts/dev-fake-herdr.mjs package.json
git commit -m "chore(desktop): add a fake-herdr development launcher"
```

---

### Task 5: 브랜딩, 런타임 에셋 대체, 이모지 카탈로그 fail-soft

**Files:**
- Modify: `renderer/src/production/evidence.ts`(UI_TEXT 3키), `renderer/index.html`(이미 title 변경), `renderer/src/production/runtime-assets.ts`, `renderer/src/recovered/features/conversation/cards/transcript-card/emoji-catalog.ts`
- Create: `renderer/public/assets/*` (18개 대체 파일), `scripts/make-placeholder-assets.mjs`

**Interfaces:**
- Produces: 앱 이름 `herdr-bot`, 저작권 줄, 피드백 문구; 이미지 404 없음; 이모지 피커는 카탈로그 로드 실패 시 빈 카탈로그로 조용히 동작.

- [ ] **Step 1: 대체 에셋 생성 스크립트**

`scripts/make-placeholder-assets.mjs`:
```js
#!/usr/bin/env node
// Writes stand-in files for the hashed runtime assets the upstream renderer expects next to its bundle.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(new URL("../renderer/public/assets", import.meta.url).pathname);
mkdirSync(out, { recursive: true });
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const SVG_EMPTY = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const names = [
  "app-icon-C7NKj2u7.png", "apollo-B0sEgAUH.png", "ashby-BidvOSTU.png", "box-DrJB_xON.png", "calendly-DYRMkyLM.svg", "canva-djBDOrSx.svg",
  "clay-CXmF7QZG.png", "databricks-NEF0SRYx.png", "demo-computer-wallpaper-BO7Ye4dV.jpg", "mailchimp-AFHOmIeb.svg", "nooks-Da6AC940.png",
  "quickbooks-N88wePET.png", "rippling-cz7o1jpc.png", "salesforce-DuGcPENR.svg", "snowflake-B53K53W6.png", "tableau-DMgl1MR0.png",
  "workday-DI2a8j1o.svg", "zoominfo-kXQt8h27.png",
];
for (const name of names) {
  writeFileSync(join(out, name), name.endsWith(".svg") ? SVG_EMPTY : PNG_1X1);
}
process.stdout.write(`wrote ${names.length} placeholder assets to ${out}\n`);
```
실행: `node scripts/make-placeholder-assets.mjs`. (앱 아이콘은 나중에 진짜 PNG로 덮어쓸 수 있다 — 파일 이름만 유지.)

- [ ] **Step 2: 브랜딩 텍스트**

`renderer/src/production/evidence.ts`의 `UI_TEXT`에서 세 값만 바꾼다:
```ts
  copyright: "Copyright © 2026 herdr-bot",
  feedbackIntroduction: "herdr-bot is a personal build. Describe what happened and file it in the project repository.",
  title: "herdr-bot"
```
(`signOutDescription` 등 Cursor 계정 문구는 UI에 노출되지 않으므로 그대로 둔다.)

- [ ] **Step 3: 런타임 에셋 URL — dev에서도 public/assets를 보게**

`renderer/src/production/runtime-assets.ts` 전체:
```ts
// herdr-bot serves stand-in copies of the upstream hashed assets from renderer/public/assets,
// which Vite exposes at ./assets/<file> in both dev and production builds.
export function rendererRuntimeAssetUrl(file: string): string {
  const base = import.meta.env?.DEV === true
    ? new URL("/assets/", window.location.href)
    : new URL("./", import.meta.url);
  return new URL(file, base).href;
}
```

- [ ] **Step 4: 이모지 카탈로그 fail-soft**

`renderer/src/recovered/features/conversation/cards/transcript-card/emoji-catalog.ts`의 `loadShippedEmojiCatalog`를 다음으로 교체:
```ts
export const EMPTY_EMOJI_CATALOG: EmojiCatalog = { categories: [], skinTones: [], subgroups: [] };

export function loadShippedEmojiCatalog(): Promise<EmojiCatalog> {
  if (shippedCatalog != null) return Promise.resolve(shippedCatalog);
  if (shippedLoad == null) {
    const pending = loadShippedEmojiChunks()
      .then(buildEmojiCatalog)
      // herdr-bot cannot ship the upstream emoji data chunks; degrade to an empty picker instead of an error state.
      .catch(() => EMPTY_EMOJI_CATALOG)
      .then((catalog) => {
        shippedCatalog = catalog;
        return catalog;
      });
    shippedLoad = pending;
  }
  return shippedLoad;
}
```

- [ ] **Step 5: 빌드/실행 확인**

```bash
npm run renderer:typecheck && npm run renderer:build && ls renderer/dist/assets | grep -c "app-icon"
npm run desktop:dev:fake
```
Expected: `grep -c` = 1. 앱 창 제목/About 다이얼로그가 `herdr-bot`. 콘솔에 404(`Failed to load resource`) 없음. 메시지 리액션 피커를 열어도 에러 없이(빈 목록) 뜬다. `renderer/UPSTREAM.md`의 수정 목록에 이 태스크에서 바꾼 4개 파일을 적는다.

- [ ] **Step 6: 커밋**

```bash
git add renderer scripts/make-placeholder-assets.mjs
git commit -m "feat(renderer): rebrand to herdr-bot and replace unshippable runtime assets"
```

---

### Task 6: New 다이얼로그 — 봇(스폰/채택) 탭과 방(멤버 선택) 탭

**Files:**
- Create: `renderer/src/production/NewChatDialog.tsx`
- Modify: `renderer/src/production/ProductionRenderer.tsx`(배선 4곳), `renderer/src/production/production.css`(스타일 추가)

**Interfaces:**
- Consumes (coordinator): `createAgent {name, description, herdrBot:{id, kind, cwd, permissionMode, adoptPaneId?}}`, `createGroup {name, description, memberIds}`, `herdrBot.listAdoptable`
- Produces: `NewChatDialog` 컴포넌트 `{ open: boolean; agents: readonly RendererAgent[]; defaultCwd: string; onClose(); onCreateBot(args: CreateBotRequest): Promise<void>; onCreateRoom(args: CreateRoomRequest): Promise<void>; listAdoptable(): Promise<AdoptableAgent[]> }`
  - `interface CreateBotRequest { id: string; name: string; description: string; kind: string; cwd: string; permissionMode: "ask"|"auto"; adoptPaneId?: string }`
  - `interface CreateRoomRequest { name: string; description: string; memberIds: string[] }`
  - `interface AdoptableAgent { pane_id: string; agent: string|null; cwd: string|null; name: string|null }`
- 사이드바 `New` 버튼과 커맨드 팔레트 `New chat` 항목이 이 다이얼로그를 연다. 기존 `createAgent()`(즉시 "New chat" 생성)는 더 이상 호출되지 않는다.

- [ ] **Step 1: 컴포넌트 작성**

`renderer/src/production/NewChatDialog.tsx`:
```tsx
import { useEffect, useMemo, useState } from "react";
import type { RendererAgent } from "./model";
import { OverlayDialog } from "../recovered/ui/overlay-primitives";
import { SandButton } from "../recovered/ui/sand-kit-primitives";
import { SandCheckbox, SandTabs, SandTextField, SandTextarea } from "../recovered/ui/sand-form-primitives";
import { SandSelect } from "../recovered/ui/sand-floating-primitives";

export interface CreateBotRequest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly cwd: string;
  readonly permissionMode: "ask" | "auto";
  readonly adoptPaneId?: string;
}

export interface CreateRoomRequest {
  readonly name: string;
  readonly description: string;
  readonly memberIds: string[];
}

export interface AdoptableAgent {
  readonly pane_id: string;
  readonly agent: string | null;
  readonly cwd: string | null;
  readonly name: string | null;
}

export interface NewChatDialogProps {
  readonly open: boolean;
  readonly agents: readonly RendererAgent[];
  readonly defaultCwd: string;
  onClose(): void;
  onCreateBot(request: CreateBotRequest): Promise<void>;
  onCreateRoom(request: CreateRoomRequest): Promise<void>;
  listAdoptable(): Promise<AdoptableAgent[]>;
}

const KIND_OPTIONS = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "grok", label: "Grok CLI" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "opencode", label: "OpenCode" },
] as const;

const TABS = [{ id: "bot", label: "Bot" }, { id: "room", label: "Room" }] as const;
const SPAWN = "__spawn__";

export function suggestBotId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
  if (slug.length === 0) return "bot";
  return /^[a-z]/.test(slug) ? slug : `bot-${slug}`.slice(0, 32);
}

export function isValidBotId(id: string): boolean {
  return /^[a-z][a-z0-9_-]{0,31}$/.test(id) && !id.startsWith("room-");
}

export function NewChatDialog({ open, agents, defaultCwd, onClose, onCreateBot, onCreateRoom, listAdoptable }: NewChatDialogProps) {
  const [tab, setTab] = useState<"bot" | "room">("bot");
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>("claude");
  const [cwd, setCwd] = useState(defaultCwd);
  const [permissionMode, setPermissionMode] = useState<"ask" | "auto">("ask");
  const [source, setSource] = useState<string>(SPAWN);
  const [adoptable, setAdoptable] = useState<AdoptableAgent[]>([]);
  const [roomName, setRoomName] = useState("");
  const [roomGoal, setRoomGoal] = useState("");
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("bot"); setName(""); setId(""); setIdTouched(false); setDescription(""); setKind("claude"); setCwd(defaultCwd);
    setPermissionMode("ask"); setSource(SPAWN); setRoomName(""); setRoomGoal(""); setMembers(new Set()); setError(null); setPending(false);
    listAdoptable().then(setAdoptable, () => setAdoptable([]));
  }, [open, defaultCwd, listAdoptable]);

  const effectiveId = idTouched ? id : suggestBotId(name);
  const bots = useMemo(() => agents.filter((agent) => !agent.isGroup), [agents]);
  const sourceOptions = useMemo(() => [
    { value: SPAWN, label: "Start a new agent in herdr" },
    ...adoptable.map((agent) => ({ value: agent.pane_id, label: `Adopt ${agent.agent ?? "agent"} at ${agent.pane_id}${agent.cwd ? ` (${agent.cwd})` : ""}` })),
  ], [adoptable]);
  const canCreateBot = name.trim().length > 0 && isValidBotId(effectiveId) && !pending;
  const canCreateRoom = roomName.trim().length > 0 && members.size > 0 && members.size <= 6 && !pending;

  const submit = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (tab === "bot") {
        await onCreateBot({ id: effectiveId, name: name.trim(), description, kind, cwd: cwd.trim() || defaultCwd, permissionMode, ...(source === SPAWN ? {} : { adoptPaneId: source }) });
      } else {
        await onCreateRoom({ name: roomName.trim(), description: roomGoal, memberIds: [...members] });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };

  return <OverlayDialog className="sand-new-chat-dialog" label="New" onClose={onClose} open={open} panelStyle={{ width: "min(520px, calc(100% - 32px))", padding: 20 }}>
    <h2 className="sand-new-chat-dialog__title">New</h2>
    <SandTabs ariaLabel="What to create" items={TABS.map((item) => ({ id: item.id, label: item.label }))} onValueChange={(value) => setTab(value === "room" ? "room" : "bot")} value={tab} />
    {tab === "bot" ? <div className="sand-new-chat-dialog__form">
      <SandTextField autoFocus label="Name" onChange={(event) => setName(event.currentTarget.value)} placeholder="Code Reviewer" value={name} />
      <SandTextField description="herdr agent name: lowercase letters, digits, - and _" error={effectiveId.length > 0 && !isValidBotId(effectiveId) ? "Invalid id" : undefined} label="Id" onChange={(event) => { setIdTouched(true); setId(event.currentTarget.value); }} value={effectiveId} />
      <SandTextarea label="Persona (optional)" minRows={2} onChange={(event) => setDescription(event.currentTarget.value)} placeholder="Reviews diffs for correctness and style." value={description} />
      <label className="sand-new-chat-dialog__row"><span>Source</span><SandSelect ariaLabel="Source" className="ui-select-trigger" matchAnchorWidth onValueChange={setSource} options={sourceOptions} value={source} /></label>
      {source === SPAWN ? <>
        <label className="sand-new-chat-dialog__row"><span>Agent</span><SandSelect ariaLabel="Agent kind" className="ui-select-trigger" onValueChange={setKind} options={KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} value={kind} /></label>
        <SandTextField label="Working directory" mono onChange={(event) => setCwd(event.currentTarget.value)} value={cwd} />
        <label className="sand-new-chat-dialog__row"><span>Permissions</span><SandSelect ariaLabel="Permissions" className="ui-select-trigger" onValueChange={setPermissionMode} options={[{ value: "ask" as const, label: "Ask before edits and commands" }, { value: "auto" as const, label: "Auto (bypass permissions)" }]} value={permissionMode} /></label>
      </> : null}
    </div> : <div className="sand-new-chat-dialog__form">
      <SandTextField autoFocus label="Room name" onChange={(event) => setRoomName(event.currentTarget.value)} placeholder="Auth refactor" value={roomName} />
      <SandTextarea label="Goal (optional)" minRows={2} onChange={(event) => setRoomGoal(event.currentTarget.value)} placeholder="Ship the login fix with tests and a changelog entry." value={roomGoal} />
      <fieldset className="sand-new-chat-dialog__members">
        <legend>Members ({members.size}/6)</legend>
        {bots.length === 0 ? <p>Create a bot first.</p> : bots.map((bot) => <SandCheckbox checked={members.has(bot.id)} key={bot.id} label={`${bot.name} (@${bot.id})`} onCheckedChange={(checked) => setMembers((current) => { const next = new Set(current); if (checked) next.add(bot.id); else next.delete(bot.id); return next; })} />)}
      </fieldset>
    </div>}
    {error == null ? null : <p className="sand-new-chat-dialog__error" role="alert">{error}</p>}
    <footer className="sand-new-chat-dialog__footer">
      <SandButton disabled={pending} onClick={onClose} size="sm" variant="secondary">Cancel</SandButton>
      <SandButton disabled={tab === "bot" ? !canCreateBot : !canCreateRoom} onClick={() => void submit()} size="sm">{pending ? "Creating…" : tab === "bot" ? (source === SPAWN ? "Start bot" : "Adopt bot") : "Create room"}</SandButton>
    </footer>
  </OverlayDialog>;
}
```
`SandCheckbox`의 `onCheckedChange(checked: boolean)` 시그니처, `SandTabs`의 `items/value/onValueChange`, `SandSelect`의 `options/value/onValueChange` 는 각 프리미티브 파일(`sand-form-primitives.tsx`, `sand-floating-primitives.tsx`)의 export 시그니처를 따른다. 타입체크가 실패하면 그 파일의 props 정의에 맞춰 호출부만 고친다(프리미티브는 수정 금지).

- [ ] **Step 2: CSS 추가**

`renderer/src/production/production.css` 끝에:
```css
/* herdr-bot: New (bot / room) dialog */
.sand-new-chat-dialog__title { margin: 0 0 12px; font-size: var(--cursor-font-size-lg); font-weight: 600; }
.sand-new-chat-dialog__form { display: grid; gap: 12px; margin-top: 14px; }
.sand-new-chat-dialog__row { display: grid; gap: 6px; font-size: var(--cursor-font-size-sm); color: var(--cursor-text-secondary); }
.sand-new-chat-dialog__members { display: grid; gap: 8px; margin: 0; padding: 10px 12px; border: 1px solid var(--cursor-border-secondary); border-radius: var(--cursor-radius-lg); }
.sand-new-chat-dialog__members legend { padding: 0 4px; color: var(--cursor-text-secondary); font-size: var(--cursor-font-size-xs); }
.sand-new-chat-dialog__error { margin: 12px 0 0; color: var(--cursor-danger); font-size: var(--cursor-font-size-sm); }
.sand-new-chat-dialog__footer { display: flex; justify-content: flex-end; gap: 8px; margin: 18px -20px -20px; padding: 12px 16px; border-top: 1px solid var(--cursor-border-secondary); }
```

- [ ] **Step 3: ProductionRenderer 배선 (4곳)**

(a) import 추가(파일 상단 import 블록 끝):
```ts
import { NewChatDialog, type AdoptableAgent, type CreateBotRequest, type CreateRoomRequest } from "./NewChatDialog";
```

(b) 상태 + 핸들러 — 기존 `const createAgent = async () => { ... };` 정의(`createAgentRef.current = createAgent;` 바로 위) 를 아래로 **교체**:
```ts
  const [newChatOpen, setNewChatOpen] = useState(false);
  const openNewChat = () => setNewChatOpen(true);
  const createAgent = async () => { openNewChat(); };
  const createBotFromDialog = async (request: CreateBotRequest): Promise<void> => {
    if (client == null) throw new Error("coordinator is unavailable");
    const result = await client.call("createAgent", {
      name: request.name, description: request.description, origin: "user", isKickstartRequested: false, clientNonce: makeClientNonce(),
      herdrBot: { id: request.id, kind: request.kind, cwd: request.cwd, permissionMode: request.permissionMode, ...(request.adoptPaneId == null ? {} : { adoptPaneId: request.adoptPaneId }) },
    });
    const created = result && typeof result === "object" && "agent" in result ? (result as { agent: unknown }).agent : result;
    const projected = projectRendererAgent(created);
    await refreshRoster();
    if (projected != null) await openAgent(projected.id);
  };
  const createRoomFromDialog = async (request: CreateRoomRequest): Promise<void> => {
    if (client == null) throw new Error("coordinator is unavailable");
    const result = await client.call("createGroup", { name: request.name, description: request.description, memberIds: request.memberIds });
    const created = result && typeof result === "object" && "agent" in result ? (result as { agent: unknown }).agent : result;
    const projected = projectRendererAgent(created);
    await refreshRoster();
    if (projected != null) await openAgent(projected.id);
  };
  const listAdoptable = useCallback(async (): Promise<AdoptableAgent[]> => {
    if (client == null) return [];
    const value = await client.call("herdrBot.listAdoptable");
    return Array.isArray(value) ? (value as AdoptableAgent[]) : [];
  }, [client]);
```

(c) 렌더 트리 — `<AgentDeleteConfirmation ... />` 바로 아래에:
```tsx
      <NewChatDialog agents={agents} defaultCwd="" listAdoptable={listAdoptable} onClose={() => setNewChatOpen(false)} onCreateBot={createBotFromDialog} onCreateRoom={createRoomFromDialog} open={newChatOpen} />
```
(`defaultCwd`는 빈 문자열 → 호스트가 `HERDR_BOT_DEFAULT_CWD`로 채운다. 다이얼로그의 빈 cwd는 `cwd.trim() || defaultCwd` 로직 때문에 빈 문자열이 넘어가며, 호스트 디스패처의 `optStr`이 빈 문자열을 무시해 기본값을 쓴다.)

(d) 커맨드 팔레트 — `paletteCommands` useMemo 안, `if (hiddenAgents.length > 0) commands.push({...})` 앞에:
```ts
    commands.push({ id: "new:chat", label: "New bot or room", icon: "plus", keywords: ["new", "bot", "room", "group", "create", "spawn", "adopt"], detail: "Sidebar", run: openNewChat });
```
사이드바의 `onNewChat={() => void createAgent()}`는 그대로 두면 다이얼로그가 열린다(위에서 `createAgent`를 교체했기 때문).

- [ ] **Step 4: 확인**

```bash
npm run renderer:typecheck && npm run renderer:build && npm run desktop:dev:fake
```
Expected: 사이드바 `+`(New) → 다이얼로그. Bot 탭에서 이름 `Code Reviewer` 입력 → id가 `code-reviewer`로 자동 제안 → Start bot → 사이드바에 `Code Reviewer` 추가, 그 채팅이 열림. Source 셀렉트에 가짜 herdr의 채택 가능 에이전트가 없으면 "Start a new agent in herdr"만 보인다(가짜 상태에 `agents: [{name:null,...}]`를 넣으면 채택 항목이 보인다). Room 탭: 이름 + 멤버 체크 → Create room → 그룹 아바타 방이 생기고 열림. `Cmd+K` 팔레트에 `New bot or room`. `renderer/UPSTREAM.md` 수정 목록 갱신.

- [ ] **Step 5: 커밋**

```bash
git add renderer/src/production/NewChatDialog.tsx renderer/src/production/ProductionRenderer.tsx renderer/src/production/production.css renderer/UPSTREAM.md
git commit -m "feat(renderer): add the New dialog for spawning or adopting bots and creating rooms"
```

---

### Task 7: 단체방 메시지 저자 표시 + "Open in herdr" 헤더 액션

**Files:**
- Modify: `renderer/src/recovered/features/conversation/cards/transcript-card/protocol.ts`, `renderer/src/recovered/features/conversation/cards/transcript-card/views/send-message-text.tsx`, `renderer/src/recovered/features/conversation/workspace/chat-header.tsx`, `renderer/src/production/ProductionRenderer.tsx`, `renderer/src/production/production.css`

**Interfaces:**
- Consumes: 호스트 봇 메시지 엔트리의 `author: {id, name}`; coordinator `herdrBot.focus {id}`
- Produces: 그룹 방에서 각 봇 메시지 위에 저자 이름 라벨; 봇 DM 헤더의 컴퓨터 아이콘 자리에 `Open in herdr`(터미널 아이콘) 버튼.

- [ ] **Step 1: 카드 프로토콜이 author를 실어 나르게**

`protocol.ts`의 `TranscriptCardEntryBase`에 필드 추가(`permissionScopeRevision?: number;` 뒤):
```ts
  /** herdr-bot: the room member who said this (absent on 1:1 chats). */
  author?: { readonly id: string; readonly name: string };
```
`projectTranscriptCardEntry` 반환 객체에 한 줄 추가(`...(value.permissionScopeRevision === undefined ? {} : ...)` 뒤):
```ts
    ...(isRecord(value.author) && typeof value.author.id === "string" && typeof value.author.name === "string" ? { author: { id: value.author.id, name: value.author.name } } : {}),
```
(`isRecord`는 이 파일에 이미 정의되어 있다.)

- [ ] **Step 2: 텍스트 카드에서 저자 라벨 표시 (방에서만)**

`views/send-message-text.tsx`의 최종 `return`을 아래로 교체:
```tsx
  const author = entry.author;
  const showAuthor = author != null && providers?.scope.agentId != null && author.id !== providers.scope.agentId;
  return <div aria-label="Agent message" className="sand-message" data-group-start={props.adjacency?.isGroupStart || undefined} data-role="assistant" role="group">
    {showAuthor ? <span className="sand-message__author" data-author-id={author.id}>{author.name}</span> : null}
    <AssistantMessageContent
      channel={message.channel}
      images={message.images}
      isSourceTrusted={true}
      isStreaming={streaming}
      text={message.content}
    />
  </div>;
```
(DM에서는 `scope.agentId === author.id`이므로 라벨이 숨겨진다 — grok-bot 1:1 모양 유지.)

`production.css` 끝에:
```css
/* herdr-bot: room member attribution on bot messages */
.sand-message__author { display: block; margin: 0 0 2px; color: var(--cursor-text-secondary); font-size: var(--cursor-font-size-xs); font-weight: 600; letter-spacing: 0.01em; }
```

- [ ] **Step 3: 헤더의 컴퓨터 컨트롤을 "Open in herdr"로**

`chat-header.tsx`: props에 `onOpenInHerdr?(): void;` 추가하고, 컨트롤 영역의
```tsx
      {agent.isGroup ? null : <ComputerHeaderControl active={isComputerActive} isInfoOpen={isInfoOpen} onToggle={onToggleInfo} />}
```
를
```tsx
      {agent.isGroup || onOpenInHerdr == null ? null : <SandIconButton aria-label="Open in herdr" icon="terminal" label="Open in herdr" onClick={onOpenInHerdr} size="sm" title="Focus this bot's pane in herdr" />}
```
로 바꾸고, import에 `SandIconButton`을 추가(`import { SandIconButton } from "../../../ui/sand-kit-primitives";`), `ComputerHeaderControl` import와 `isComputerActive`/`isInfoOpen`/`onToggleInfo` props는 다른 호출부가 넘기므로 타입에는 남겨 두되 사용하지 않는다(미사용 경고는 `_` 접두어 대신 그대로 두어 upstream diff를 최소화).

`ProductionRenderer.tsx`에서 `<ConversationAgentHeader` 호출부에 prop 추가:
```tsx
            onOpenInHerdr={activeAgent != null && !activeAgent.isGroup && client != null ? () => { void client.call("herdrBot.focus", { id: activeAgent.id }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error))); } : undefined}
```

- [ ] **Step 4: 확인**

```bash
npm run renderer:typecheck && npm run renderer:build && npm run desktop:dev:fake
```
Expected: 방(`Auth refactor`)에서 봇 답장 위에 `Reviewer`, `Writer` 라벨이 보이고, DM에서는 라벨이 없다. 봇 DM 헤더 우측에 터미널 아이콘 버튼 → 클릭 시 가짜 herdr 로그(`/tmp/hb-dev-fake/fake-herdr-log.jsonl`)에 `agent focus <pane>` 줄이 추가된다(실제 herdr에서는 그 pane으로 포커스 이동). `renderer/UPSTREAM.md` 갱신.

- [ ] **Step 5: 커밋**

```bash
git add renderer
git commit -m "feat(renderer): show room member authors and add an Open-in-herdr header action"
```

---

### Task 8: 패키징 + 실제 herdr 라이브 E2E

**Files:**
- Create: `desktop/electron-builder.yml`
- Modify: 루트 `package.json`(`desktop:package`), `README.md`(앱 섹션)

- [ ] **Step 1: electron-builder 설정**

`desktop/electron-builder.yml`:
```yaml
appId: dev.herdr.bot
productName: herdr-bot
directories:
  output: ../.build/desktop
asar: false
files:
  - dist/**
  - package.json
  - from: ../renderer/dist
    to: renderer/dist
mac:
  category: public.app-category.developer-tools
  identity: null
  target:
    - target: dir
      arch: [arm64]
npmRebuild: false
```
루트 scripts:
```json
    "desktop:package": "npm run desktop:build && npx electron-builder --config desktop/electron-builder.yml --dir --project desktop"
```
`main.ts`의 `rendererIndex` 경로는 패키지 안에서 `<app>/Contents/Resources/app/renderer/dist/index.html`이 되므로, `rendererIndex` 계산을 다음으로 바꾼다:
```ts
const rendererIndex = app.isPackaged
  ? join(process.resourcesPath, "app", "renderer", "dist", "index.html")
  : join(here, "..", "..", "..", "..", "renderer", "dist", "index.html");
```

- [ ] **Step 2: 패키징 실행**

```bash
npm run desktop:package
ls .build/desktop/mac-arm64/herdr-bot.app/Contents/Resources/app/renderer/dist/index.html
open .build/desktop/mac-arm64/herdr-bot.app
```
Expected: 앱이 실행되고(ad-hoc 서명, Gatekeeper 경고 시 우클릭→열기) 실제 `~/.herdr-bot`을 홈으로 쓴다. 아직 herdr에 봇이 없으면 "No chats yet".

- [ ] **Step 3: 실제 herdr 라이브 E2E (앱 안에서)**

전제: herdr 0.9.0 실행 중, claude 로그인됨. 앱을 **herdr pane 안이 아닌** Finder에서 열어도 호스트는 `~/.config/herdr/herdr.sock`으로 herdr 서버에 접근한다.
1. `+` → Bot 탭 → Name `Reviewer`, Agent `Claude Code`, Working directory `~/Desktop/ray/workspace/herdr-bot`, Permissions `Ask` → Start bot.
   - Expected: herdr 사이드바에 `herdr-bot: herdr-bot` 워크스페이스가 생기고 claude가 뜬다. 앱 사이드바에 `Reviewer`(idle). claude 화면에 identity brief와 "ok".
2. `+` → Bot 탭 → `Writer` 같은 설정 → Start bot. Expected: 같은 워크스페이스에 두 번째 탭.
3. `+` → Room 탭 → `자기소개`, 멤버 두 명 체크 → Create room.
4. 방 컴포저에 `둘 다 한 줄로 자기소개 해줘. @writer 는 이모지 하나 붙여줘.` → Enter.
   - Expected: 내 메시지 즉시 표시. 방 행에 Working. 30~90초 내 `Reviewer` 라벨 메시지, 이어서 `Writer` 라벨 메시지(이모지 포함). herdr 쪽 claude pane에서 `Bash(~/.herdr-bot/bin/herdr-bot say …)` 실행이 보인다.
5. `@reviewer 만 답해: 이 레포 package.json의 workspaces 개수는?` → Reviewer만 답한다(`4`).
6. Reviewer DM에서 헤더의 터미널 버튼 → herdr 창의 포커스가 reviewer pane으로 이동.
7. herdr에서 reviewer pane에 직접 긴 작업을 시켜 `working` 상태로 만든 뒤 방에 메시지 → 방 트랜스크립트에 `Reviewer is busy with other work in herdr …` notice.
8. `+` → Bot → Source에서 이미 떠 있는 다른 에이전트(예: grok) 선택 → Adopt bot → 해당 pane의 herdr 이름이 봇 id로 바뀜. 방 정보(Members)에서 추가 → 멘션으로 질문 → 답변.
9. 봇 우클릭 → Delete: 스폰 봇은 pane이 닫히고, 채택 봇은 이름만 해제된다.
10. 앱 종료 → 재실행: 사이드바/트랜스크립트 유지(파일 저장), 봇 상태는 `herdr agent list`로 재동기화(pane이 살아 있으면 idle, 닫혔으면 offline 배지).

각 단계에서 어긋난 것은 재현 로그(`~/.herdr-bot` 아래 트랜스크립트, 앱 stderr)와 함께 기록하고 `fix:` 커밋으로 처리한다.

- [ ] **Step 4: README에 앱 섹션 추가**

`README.md`에 아래 섹션을 "빠른 시작 (헤드리스)" 앞에 넣는다:
```markdown
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
```

- [ ] **Step 5: 커밋**

```bash
git add desktop/electron-builder.yml desktop/src/main.ts package.json README.md
git commit -m "feat(desktop): package herdr-bot.app and document the desktop workflow"
```

---

## 자체 점검 결과 (Self-Review)

- **스펙 커버리지:** "grok-bot과 같은 UI" → Task 1(포크)·5(브랜딩/에셋); 봇을 UI에서 보고 만들기(스폰+채택, claude/codex/grok) → Task 2(로스터 이벤트)·6(New 다이얼로그); 단체방 대화 UI → Task 4(왕복)·7(저자 표시); 백그라운드 에이전트 ↔ 채팅 연결은 코어 플랜이 담당하고 Task 2의 포트 연결로 이어짐; 패키징/라이브 검증 → Task 8.
- **닫힌 수정 목록 준수:** Task 5/6/7이 건드리는 upstream 파일은 Global Constraints 목록 안에 있다. `chat-header.tsx`에서 `ComputerHeaderControl` import가 미사용이 되면 typecheck 경고가 아니라 에러(`noUnusedLocals`)가 아닌지 확인 — upstream tsconfig에는 `noUnusedLocals`가 없다.
- **알려진 갭(의도적):** 온보딩 시네마틱 생략, 이모지 피커 빈 카탈로그, 앱 아이콘 1×1 자리표시자(진짜 PNG로 교체 권장), 첨부파일은 경로 텍스트로 봇에 전달(갤러리 미표시), 봇 아바타는 shape/color 페르소나 마크만.
- **타입 일관성:** coordinator 메서드 이름·인자(`herdrBot`, `herdrBot.listAdoptable`, `herdrBot.focus`, `createGroup {name, description, memberIds}`)가 코어 플랜 Task 15 표와 일치한다.
