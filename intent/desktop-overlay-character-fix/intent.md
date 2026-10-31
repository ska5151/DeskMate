# 작업 의도 정의서 (Intent): 방 접속 시 Windows 바탕화면에 캐릭터가 표시되지 않는 문제 해결

## 1. 작업 목적 (Why)
캐릭터 생성 및 방 입장 후 **Windows 바탕화면 위(`Overlay Window`)에 캐릭터가 정상적으로 나타나도록** 통신 구조(Supabase Realtime 일원화), Electron 오버레이 창 초기화 타이밍, 그리고 Vercel 웹 ↔ Windows Electron 데스크톱 연동(`deskmate://` 딥링크 및 원클릭 실행)을 개선합니다.

---

## 2. 배경 및 원인 분석 (Background & Root Cause)

1. **원인 1: 웹 브라우저(Chrome/Edge)의 OS 보안 제약과 Electron 연동 부재**
   - 일반 웹 브라우저에서 Vercel URL(`https://*.vercel.app`)만 열었을 때는 브라우저 보안 정책상 브라우저 창 바깥의 **Windows 바탕화면 전체 투명 오버레이(`BrowserWindow` 투명 창)**를 직접 생성할 수 없습니다.
   - Windows 바탕화면에 캐릭터를 띄우려면 **Electron 데스크톱 프로세스**가 실행되거나, 웹(Vercel)에서 방 입장 시 로컬 Electron 오버레이를 호출(`deskmate://` 커스텀 프로토콜 딥링크)해야 합니다.

2. **원인 2: 로컬 Electron 오버레이 창과 Vercel(Supabase Realtime) 간의 소켓 분리**
   - 현재 `src/services/socket.ts`에서 로컬(`localhost` / `file://`) 환경일 때는 `http://localhost:4000` (Socket.io)에만 연결을 시도하고, Vercel 환경일 때만 `SupabaseRealtimeSocketAdapter`를 사용하도록 분기되어 있습니다.
   - 이 때문에 로컬 4000번 서버가 꺼져 있거나, Vercel DB/Realtime을 사용하는 환경에서 Electron 오버레이 창(`OverlayWindow`)이 켜지면 소켓 연결이 이루어지지 않아 `roomStateUpdate`(내 캐릭터 생성 이벤트)를 받지 못하고 바탕화면이 빈 화면으로 남게 됩니다.

3. **원인 3: Electron `OverlayWindow`의 `INIT_OVERLAY` IPC 수신 타이밍 누락 가능성**
   - `electron/main.cjs`에서 방 입장(`ENTER_ROOM`) 시점에 `overlayWindow`가 아직 로딩 중이거나 `showInactive()`가 Windows 환경에서 창 렌더링을 갱신하지 못하면, `INIT_OVERLAY` 데이터를 놓쳐 캐릭터가 렌더링되지 않을 수 있습니다.

---

## 3. 해결 방향 및 기대 효과 (Expected Outcomes & Goals)

1. **모든 환경(Electron & Vercel)에서 Supabase Realtime 실시간 엔진 일원화**:
   - 로컬 4000번 서버가 없어도 Electron의 `MainWindow`와 바탕화면 `OverlayWindow`가 **항상 Supabase Realtime + BroadcastChannel**을 통해 즉시 캐릭터 상태를 생성·공유하도록 통합합니다.
   - 방 입장(`INIT_OVERLAY`) 즉시 서버 응답을 기다리기 전에도 내 캐릭터(`myInfo`)를 바탕화면 초기 위치(`x: 50%, y: 88%`)에 **즉각 선(先)렌더링**하여 바탕화면에 빈 화면이 절대 나오지 않게 합니다.
2. **Electron 오버레이 초기화 핸드셰이크(`GET_CURRENT_ROOM`) 및 표시 보장**:
   - `electron/main.cjs`에서 `currentRoomData`를 보관하고, `OverlayWindow`가 마운트될 때 능동적으로 현재 방 정보를 가져오도록(`GET_CURRENT_ROOM` IPC) 하여 IPC 타이밍 유실을 100% 방지합니다.
3. **Vercel 웹 ↔ Windows 바탕화면 Electron 브릿지 (`deskmate://` 딥링크 & 데스크톱 실행)**:
   - Electron 앱에 `deskmate://` Windows 커스텀 URL 프로토콜을 등록하여, Vercel 웹 브라우저에서 방에 접속하더라도 자동으로(또는 `🖥️ Windows 바탕화면에 띄우기` 버튼 클릭 시) 로컬 Electron 오버레이 창이 깨어나면서 **실제 Windows 바탕화면 위에 캐릭터가 즉시 나타나도록** 연동합니다.
