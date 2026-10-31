# 상세 기획 및 구현 계획서 (Plan): Windows 바탕화면 캐릭터 오버레이 표시 및 Vercel-Electron 연동

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/desktop-overlay-character-fix/intent.md)를 바탕으로 방 접속 시 Windows 바탕화면에 캐릭터가 즉시 표시되도록 만드는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 실시간 통신 엔진을 Supabase Realtime으로 완전 일원화 (`src/services/socket.ts`)
- 기존에는 `isLocalEnvironment()`일 때 `http://localhost:4000` (Socket.io) 연결만 시도하여, 로컬 4000번 서버가 없거나 Vercel 웹에서 접속한 유저와는 캐릭터 위치/채팅이 공유되지 않고 `OverlayWindow`에 캐릭터가 생성되지 않는 문제가 있었습니다.
- **개선 방식**:
  - 로컬 Electron 앱(`MainWindow`, `OverlayWindow`)과 Vercel 웹 브라우저 **모두 동일하게 `SupabaseRealtimeSocketAdapter` (Supabase Realtime Presence/Broadcast + 로컬 IPC/BroadcastChannel)를 기본 통신 엔진으로 사용**합니다.
  - 이를 통해 로컬 Node.js 서버(`localhost:4000`)가 켜져 있든 꺼져 있든 상관없이, 그리고 **Vercel 웹에서 접속하든 Electron 앱에서 접속하든 동일한 방(`deskmate_room_{roomId}`)에서 실시간으로 캐릭터가 바탕화면에 나타나고 대화**할 수 있습니다.

### 1.2 `OverlayWindow` 즉시 캐릭터 선(先)렌더링 및 IPC 핸드셰이크 (`src/pages/OverlayWindow.tsx`, `electron/main.cjs`)
- **내 캐릭터 즉시 렌더링 보장**:
  - `OverlayWindow`가 `roomData`(`roomId`, `userId`, `nickname`, `characterType`)를 전달받는 즉시 네트워크 응답을 기다리지 않고 `characters` 상태에 내 캐릭터를 초기 위치(`x: 50%`, `y: 88%`)로 **즉각 등록**합니다.
- **Electron IPC 양방향 확인 (`GET_CURRENT_ROOM`) 및 IPC 브로드캐스트**:
  - `electron/main.cjs`에 `currentRoomData` 변수를 두어 `ENTER_ROOM` 호출 시 저장하고, `OverlayWindow`가 마운트될 때 `window.electronAPI.getCurrentRoom()`(`ipcMain.handle('GET_CURRENT_ROOM')`)을 호출하여 이미 입장된 방 정보가 있으면 100% 누락 없이 가져옵니다.
  - 또한 `MainWindow`와 `OverlayWindow` 간에 Electron IPC(`RELAY_ROOM_EVENT`)도 함께 연결하여, 같은 PC의 메인 창에서 보낸 채팅·이모트·상태 변경이 0.001초의 지연도 없이 바탕화면 오버레이 캐릭터에 즉시 반영되도록 합니다.
- **Windows 투명 오버레이 창 가시성 강화 (`electron/main.cjs`)**:
  - Windows 10/11에서 `showInactive()`만 호출할 경우 백그라운드에 가려지는 현상을 방지하기 위해, `ENTER_ROOM` 시 `overlayWindow.show()`, `overlayWindow.setAlwaysOnTop(true, 'screen-saver')`, `overlayWindow.moveTop()`을 순차 호출한 뒤 `setIgnoreMouseEvents(true, { forward: true })`를 적용하여 **작업표시줄 위 바탕화면에 캐릭터가 무조건 최상단으로 나타나도록** 보장합니다.

### 1.3 Vercel 웹 브라우저 ↔ 로컬 Windows 바탕화면 오버레이 브릿지 (`electron/main.cjs`, `src/pages/MainWindow.tsx`)
- **문제 상황**: 사용자가 Chrome/Edge 브라우저에서 Vercel 배포 주소(`https://*.vercel.app`)로 접속해 방에 입장했을 때, 웹 브라우저는 Windows 바탕화면에 투명 창을 띄울 수 없습니다.
- **해결책 1 (`deskmate://` Windows 커스텀 프로토콜 딥링크 + 로컬 브릿지 서버)**:
  - Electron 앱(`electron/main.cjs`)이 실행 중일 때 로컬 루프백 브릿지(`http://127.0.0.1:45678/enter-room` 및 `deskmate://enter-room?...` 커스텀 프로토콜)를 열어 둡니다.
  - 사용자가 **Vercel 웹 브라우저**에서 캐릭터를 생성하고 방에 입장하면, 프론트엔드가 자동으로 로컬 Electron 브릿지(`http://127.0.0.1:45678/enter-room`)에 방/캐릭터 정보를 전달하여 **즉시 Windows 바탕화면 위에 투명 오버레이 캐릭터를 띄웁니다!**
- **해결책 2 (Electron 앱 자체에서도 Vercel URL 또는 로컬 빌드 즉시 실행)**:
  - 로컬에서 `npm run start:electron` 또는 `npm run dev`만 실행해도 무거운 4000번 서버 없이 곧바로 Supabase DB와 연동된 바탕화면 오버레이가 작동합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: 실시간 소켓 엔진을 Supabase Realtime + Electron IPC 브릿지로 일원화 (`src/services/socket.ts`)**
  - [x] 모든 환경(Electron 및 Vercel 웹)에서 `SupabaseRealtimeSocketAdapter`가 즉시 동작하도록 통합하여 `localhost:4000` 미실행으로 인한 캐릭터 미표시 문제 해결
- [x] **Phase 2: Electron 오버레이 창 최상단 표시 및 Vercel 웹 브릿지 구현 (`electron/main.cjs`, `electron/preload.cjs`)**
  - [x] `GET_CURRENT_ROOM` IPC 핸들러 및 `overlayWindow.show()` + `moveTop()` 가시성 보장 로직 추가
  - [x] Vercel 웹 브라우저에서 방 입장 시 로컬 Electron 오버레이를 즉시 깨워 바탕화면에 캐릭터를 띄우는 로컬 HTTP 브릿지(`127.0.0.1:45678`) 및 `deskmate://` 프로토콜 등록
- [x] **Phase 3: `OverlayWindow.tsx` & `MainWindow.tsx` 즉시 캐릭터 렌더링 및 브릿지 연동**
  - [x] `OverlayWindow.tsx`에서 방 진입 시 내 캐릭터를 즉시 `characters` 상태에 추가하고 `getCurrentRoom()`으로 초기화 누락 방지
  - [x] `MainWindow.tsx`에서 방 입장 시 Electron IPC뿐만 아니라 로컬 데스크톱 브릿지(`http://127.0.0.1:45678/enter-room`)도 함께 호출하여, Vercel 웹사이트에서 방에 들어가도 Windows 바탕화면에 캐릭터가 뜨도록 연동
- [x] **Phase 4: 빌드 및 바탕화면 오버레이 동작 검증**
  - [x] `npm run build` (`tsc -b && vite build`) 에러 0건 확인
  - [x] Electron 오버레이 프로세스 기동 및 로컬 브릿지 호출 테스트

---

## 3. 영향 범위 및 고려사항
- **CORS 및 로컬 네트워크 허용**: Electron 메인 프로세스의 로컬 브릿지(`127.0.0.1:45678`)에 `Access-Control-Allow-Origin: *` 및 Private Network Access 헤더(`Access-Control-Allow-Private-Network: true`)를 설정하여 `https://*.vercel.app` 브라우저에서 호출할 때 차단되지 않도록 처리합니다.

---

## 4. 검증 및 테스트 계획
1. **프로덕션 빌드 검증**: `npm run build` 실행 시 에러 0건 확인
2. **바탕화면 오버레이 활성화 검증**: 방 입장 시 `OverlayWindow`에 내 캐릭터(`cat`, `dog`, `panda`, `tiger`, `pig`)가 즉시 생성되어 Windows 바탕화면 하단(`y: 88%`)에 렌더링되는지 확인
