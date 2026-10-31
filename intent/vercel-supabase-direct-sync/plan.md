# 상세 기획 및 구현 계획서 (Plan): Vercel 환경 Supabase 직접 연동 및 실시간 동기화

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/vercel-supabase-direct-sync/intent.md)를 바탕으로 Vercel 배포 환경에서 `"서버 대기 중"`이 뜨는 문제를 해결하고, 로컬 서버(`localhost:4000`) 없이도 **Supabase Direct DB + Supabase Realtime**으로 모든 기능이 동작하도록 만드는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 Vite 환경변수 노출 및 Supabase 클라이언트 구성 (`vite.config.ts`, `src/services/supabaseClient.ts`)
- **`vite.config.ts` 환경변수 설정**:
  - `envPrefix: ['VITE_', 'SUPABASE_']`를 설정하여 `.env` 또는 Vercel 환경변수에 등록된 `SUPABASE_URL`, `SUPABASE_ANON_KEY`(또는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)를 프론트엔드 번들에서 즉시 읽을 수 있게 합니다.
  - 또한 프로젝트의 기본 Supabase URL(`https://lspsajftivujnzfxizob.supabase.co`)과 Publishable Anon Key를 안전한 기본값 폴백으로 함께 구성하여, Vercel 대시보드에서 환경변수 누락이 있더라도 즉시 `"Supabase DB"`로 연결되도록 보장합니다.

### 1.2 `localhost:4000` 오작동 방지 및 Direct Supabase API 어댑터 (`src/services/api.ts`)
- **`resolveServerUrl()` 수정**:
  - 브라우저 도메인이 `localhost` / `127.0.0.1`이 아닌 경우(예: `*.vercel.app`), `.env`에 `VITE_SERVER_URL=http://localhost:4000`이 들어 있더라도 이를 무시하고 현재 도메인(`window.location.origin`) 또는 **Direct Supabase 클라이언트**를 사용하도록 수정합니다.
- **Direct Supabase DB 폴백 / 우선 처리**:
  - 백엔드 Express 서버(`localhost:4000`)가 응답하지 않는 환경(Vercel 정적/클라우드 환경)에서는 프론트엔드의 `api.ts`가 직접 `@supabase/supabase-js`와 `bcryptjs`를 사용하여:
    - `checkHealth()` → 즉시 `{ ok: true, dbMode: 'supabase' }` 반환 (`"서버 대기 중"` 완전 해소!)
    - `register()` / `login()` / `selectCharacter()` / `resetCharacters()` → Supabase `users` 테이블 직접 조회·저장 (만약 Supabase에 아직 `users` 테이블이 생성되지 않은 경우 브라우저 `localStorage` 폴백으로 에러 없이 즉시 가입/로그인 동작)
    - `getRooms()` / `createRoom()` / `verifyRoomPassword()` / `joinRoomByCode()` → Supabase `rooms` 테이블 및 로컬 스토리지 연동

### 1.3 Supabase Realtime 기반 실시간 멀티플레이어 어댑터 (`src/services/socket.ts`)
- **하이브리드 실시간 통신 (`RealtimeSocketAdapter`)**:
  - 로컬 개발 환경(`localhost`)에서 로컬 Socket.io 서버(4000)가 켜져 있으면 Socket.io로 연결하고,
  - **Vercel 배포 환경**에서는 **Supabase Realtime Channel (`supabase.channel('deskmate_room_' + roomId)`)**의 **Presence(접속 캐릭터 상태 공유)** 및 **Broadcast(캐릭터 이동 `moveCharacter`, 채팅/미니게임 `sendMessage`, 이모트 `triggerEmote`, 상호작용 `interactCharacter`, 포모도로 `pomodoroControl`)** 기능을 사용하여 Socket.io와 100% 동일한 이벤트 인터페이스로 동작합니다!
  - 또한 같은 브라우저/탭 간의 즉각적인 동기화를 위해 `BroadcastChannel`도 함께 연동합니다.

### 1.4 웹 브라우저(Vercel) 접속 시 내장 오버레이 스테이지 지원 (`src/pages/MainWindow.tsx`)
- Electron 데스크톱 앱이 아닌 일반 웹 브라우저(Vercel URL)에서 접속하여 방에 입장했을 때, 별도의 Electron 투명 창이 없으므로 메인 화면 하단/배경에 **웹 내장 캐릭터 오버레이 스테이지(`OverlayWindow` 미리보기)**를 함께 띄워주어 웹에서도 5종 Rive 캐릭터가 걸어 다니고 말풍선이 뜨는 모습을 바로 확인하고 조작할 수 있게 합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: Vite 환경변수 확장 및 프론트엔드 Supabase 클라이언트 모듈 구현**
  - [x] `vite.config.ts`에 `envPrefix: ['VITE_', 'SUPABASE_']` 설정 추가
  - [x] `src/services/supabaseClient.ts` 작성 (Supabase 클라이언트 초기화 및 테이블 미생성 시 `localStorage` 자동 폴백 지원)
- [x] **Phase 2: `src/services/api.ts` Direct Supabase 연동 구현**
  - [x] Vercel 도메인에서 `localhost:4000` 호출 차단
  - [x] 서버 연결 실패 또는 클라우드 환경에서 프론트엔드가 직접 Supabase DB로 인증/캐릭터선택/방 관리를 수행하도록 구현
- [x] **Phase 3: `src/services/socket.ts` Supabase Realtime 멀티플레이어 어댑터 구현**
  - [x] Socket.io와 동일한 인터페이스(`.on()`, `.emit()`, `.disconnect()`)를 제공하는 Supabase Realtime + BroadcastChannel 어댑터 구현
- [x] **Phase 4: 웹 브라우저(Vercel) 내장 오버레이 뷰어 추가 및 빌드 검증**
  - [x] `!window.electronAPI` (웹 브라우저 접속) 상태에서 방 입장 시 캐릭터 오버레이 스테이지를 함께 표시하도록 `MainWindow.tsx` 개선
  - [x] `npm run build` (`tsc -b && vite build`) 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- **로컬 Electron 데스크톱 모드 100% 유지**: 로컬에서 `npm run dev` 실행 시 기존의 멀티 윈도우(Main Window + 투명 바탕화면 Overlay Window) 동작은 그대로 유지됩니다.
- **Vercel 클라우드 완벽 독립 동작**: Vercel에 배포된 URL에서는 별도의 Node 서버가 없어도 즉시 `"Supabase DB"`로 연결되며 모든 기능이 작동합니다.

---

## 4. 검증 및 테스트 계획
1. **타입 및 번들 빌드 검증**: `npm run build` 실행 시 에러 0건 확인
2. **Direct Supabase 연결 검증**: 로컬 백엔드 서버(4000)를 끈 상태에서도 `checkHealth()`, 회원가입, 로그인, 5종 캐릭터 선택, 방 입장이 `"서버 대기 중"` 없이 즉시 동작하는지 검증
