# 상세 기획 및 구현 계획서 (Plan): Vercel 배포 환경에서 Windows 바탕화면 캐릭터 미표시 근본 원인 해결

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/fix-vercel-desktop-character-display/intent.md)를 바탕으로, Vercel 배포 링크 접속 및 방 입장 시 Windows 바탕화면에 캐릭터가 100% 확실하게 표시되도록 하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 백그라운드 숨김(`SW_HIDE`) 프로세스 제거 및 Electron 창 전면 활성화 (`electron/main.cjs`)
- **비정상 프로세스 정리**:
  - `MainWindowHandle: 0`(숨김 상태)으로 단일 인스턴스 잠금과 `45678` 포트를 점유하고 있는 기존 백그라운드 `electron.exe` 프로세스를 완전히 종료합니다.
- **Windows 포커스 잠금 우회 전면 표시 (`bringMainWindowToFront`)**:
  - Windows OS에서 브라우저(Chrome/Edge)가 활성화된 상태일 때 `mainWindow.show()`만 호출하면 창이 브라우저 뒤에 가려지는 문제를 해결하기 위해, `setAlwaysOnTop(true)` → `show()` → `focus()` → `setAlwaysOnTop(false)` 순서로 컨트롤 창을 확실히 화면 최상단으로 끌어올립니다.
- **`overlayWindow` 투명 창 렌더링 보장**:
  - `createOverlayWindow()`의 `webPreferences`에 `backgroundThrottling: false`를 설정하여 투명 창이 포커스를 가지지 않을 때도 Rive 캔버스가 멈추지 않도록 합니다.
  - `activateDesktopOverlay(roomData)` 호출 시 `overlayWindow.showInactive()` 및 `overlayWindow.show()`, `setAlwaysOnTop(true, 'screen-saver')`, `moveTop()`을 수행하고, `INIT_OVERLAY` 이벤트를 즉시 + `250ms` + `800ms` 다중 전송하여 React 마운트 타이밍 차이에 의한 누락을 원천 차단합니다.
  - 또한 `mainWindow`에도 `SYNC_ROOM_SESSION` IPC 이벤트를 전달하여, 웹에서 방에 입장했을 때 Electron 컨트롤 창도 로그인 화면에 머무르지 않고 즉시 해당 방(`CHAT_ROOM`) 화면으로 자동 진입하도록 동기화합니다.

### 1.2 로컬 브릿지(`127.0.0.1:45678`) `GET /enter-room` 지원 및 `deskmate://enter-room` 자동 폴백 (`electron/main.cjs`, `src/pages/MainWindow.tsx`)
- **CORS 프리플라이트 없는 `GET /enter-room?...` 엔드포인트 추가**:
  - `https://*.vercel.app`에서 `http://127.0.0.1:45678`로 요청할 때 `Content-Type: application/json` 헤더로 인한 Private Network Access(PNA) 프리플라이트 차단을 피할 수 있도록, 쿼리 파라미터 방식의 `GET /enter-room?roomId=...&roomName=...&userId=...&nickname=...&characterType=...&statusBadge=...` 요청도 동일하게 처리합니다.
- **방 입장(`[입장하기]`) 시 바탕화면 캐릭터 자동 실행 보장**:
  - 사용자가 웹 브라우저(`!window.electronAPI`)에서 방에 입장(`connectAndEnterRoom`)할 때:
    1. 먼저 `http://127.0.0.1:45678/enter-room?...` (GET/POST)을 500ms 타임아웃으로 호출합니다.
    2. 만약 로컬 Electron이 실행 중이지 않거나 브라우저 보안 정책으로 로컬 브릿지 요청이 실패(`catch` 또는 비정상 응답)하면, **즉시 자동으로 `window.location.href = 'deskmate://enter-room?roomId=...&userId=...&nickname=...&characterType=...'`를 실행**하여 Electron과 바탕화면 캐릭터 오버레이를 한 번에 띄웁니다.

### 1.3 `OverlayWindow` 능동 동기화 루프 및 `MainWindow` 세션 동기화 (`src/pages/OverlayWindow.tsx`, `src/pages/MainWindow.tsx`, `electron/preload.cjs`)
- **`OverlayWindow.tsx` 1초 주기 능동 조회 폴백**:
  - `OverlayWindow`에서 `myInfo`가 아직 `null`인 동안 `1000ms` 간격으로 `window.electronAPI.getCurrentRoom()`을 호출하여, 메인 프로세스에 방 정보가 세팅되는 즉시 100% 캐릭터를 바탕화면에 렌더링합니다.
- **`MainWindow.tsx` `onSyncRoomSession` 수신**:
  - `preload.cjs`에 `onSyncRoomSession` 브릿지를 추가하고, `MainWindow.tsx`가 이를 수신하면 해당 유저와 방 정보로 즉시 `connectAndEnterRoom`을 실행해 컨트롤 창과 오버레이 창을 일치시킵니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `electron/preload.cjs` 및 `electron/main.cjs` 오버레이/브릿지/딥링크 강화**
  - [x] `preload.cjs`에 `onSyncRoomSession` IPC 리스너 추가
  - [x] `electron/main.cjs`의 `localBridgeServer`에 `GET /enter-room?...` 및 `GET /leave-room` 쿼리 파싱 지원 추가
  - [x] `activateDesktopOverlay(roomData)`에서 다중 `INIT_OVERLAY` 전송 및 `mainWindow`로 `SYNC_ROOM_SESSION` 전송 구현
  - [x] `createOverlayWindow()`에 `backgroundThrottling: false` 적용 및 `bringMainWindowToFront()` 헬퍼 적용
- [x] **Phase 2: `src/pages/OverlayWindow.tsx` 및 `src/pages/MainWindow.tsx` 자동 연동 구현**
  - [x] `OverlayWindow.tsx`에서 `myInfo` 미수신 시 1초 주기 `getCurrentRoom()` 능동 폴링 추가
  - [x] `MainWindow.tsx`에서 최초 접속 시 즉시 `deskmate://open` 실행 및 방 입장(`connectAndEnterRoom`) 시 로컬 브릿지 실패 시 자동으로 `deskmate://enter-room?...` 실행
  - [x] `MainWindow.tsx`에서 `onSyncRoomSession` 수신 시 컨트롤 창 상태 자동 동기화
- [x] **Phase 3: 백그라운드 숨김(`SW_HIDE`) 프로세스 완전 종료, 프로덕션 빌드(`npm run build`) 및 대화형 실행 검증**
  - [x] 기존 백그라운드 태스크(`task-351`) 및 모든 잔여 `electron.exe` 프로세스 종료
  - [x] `npm run build`로 최신 `dist/` 번들 갱신
  - [x] 대화형 윈도우 모드(`explorer.exe "deskmate://..."`)로 실행하여 실제 `MainWindowHandle` 생성 및 바탕화면 캐릭터 오버레이 표시 확인

---

## 3. 영향 범위 및 고려사항
- **로컬 `dist/` 번들 자동 갱신**: 로컬 PC의 Electron은 `dist/index.html`을 로드하므로 `npm run build`를 통해 로컬 `dist/`가 최신 코드로 유지되어야 하며, Git 커밋/푸시 후 Vercel에서도 동일한 최신 코드가 동작합니다.
- **에이전트 백그라운드 데몬 미사용**: `run_command`의 백그라운드 데몬은 `SW_HIDE` 플래그를 상속하므로, Electron 실행 시에는 반드시 Windows 탐색기 프로토콜(`explorer.exe "deskmate://open"`) 또는 대화형 프로세스로 기동하여 창 핸들이 정상 생성되도록 합니다.

---

## 4. 검증 및 테스트 계획
1. **프로세스 창 핸들 검증**: Electron 기동 후 `Get-Process electron`에서 `MainWindowHandle`이 `0`이 아닌 실제 윈도우 핸들 값으로 생성되는지 확인
2. **바탕화면 캐릭터 오버레이 활성화 검증**: `/enter-room` 및 `deskmate://enter-room` 호출 시 바탕화면 오버레이 창이 즉시 표시되고 캐릭터가 렌더링되는지 확인
3. **프로덕션 빌드 검증**: `npm run build` 시 TypeScript 및 Vite 번들링 에러 0건 확인
