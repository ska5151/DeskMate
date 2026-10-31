# 상세 기획 및 구현 계획서 (Plan): DeskMate 초기 개발

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/deskmate-initial-development/intent.md) 및 [windows.md](file:///C:/project/windows.md)를 바탕으로 **DeskMate (Windows 바탕화면 멀티플레이어 캐릭터 채팅 프로그램)**를 구현하기 위한 상세 기획과 단계별 실행 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 프로젝트 디렉토리 구조
```text
c:\project\DeskMate\
├── electron/
│   ├── main.cjs              # Electron 메인 프로세스 (Main Window & Overlay Window 생성/제어, IPC 핸들러)
│   └── preload.cjs           # ContextBridge 기반 렌더러-메인 IPC 브릿지 (window.electronAPI)
├── server/
│   ├── index.js              # Express REST API + Socket.io 실시간 서버 (Port: 4000)
│   ├── supabase.js           # @supabase/supabase-js 클라이언트 설정 및 헬퍼
│   └── schema.sql            # Supabase PostgreSQL users 테이블 생성 SQL 스크립트
├── src/
│   ├── App.tsx               # HashRouter 기반 라우팅 (/#/main, /#/overlay)
│   ├── main.tsx              # React 엔트리포인트
│   ├── index.css             # 투명 배경(background: transparent) 및 글로벌 스타일
│   ├── types/
│   │   ├── electron.d.ts     # window.electronAPI 타입 선언
│   │   └── index.ts          # User, Character, Room, ChatMessage 공통 인터페이스
│   ├── services/
│   │   ├── api.ts            # 백엔드 인증/캐릭터 선택/방 목록 REST API 클라이언트
│   │   └── socket.ts         # Socket.io 클라이언트 인스턴스 관리
│   ├── pages/
│   │   ├── MainWindow.tsx    # 컨트롤 창 (LOGIN -> SELECT_CHAR -> LOBBY -> CHAT_ROOM 단계 전환)
│   │   └── OverlayWindow.tsx # 바탕화면 투명 오버레이 창 (캐릭터 렌더링, 자동 배회/드래그, 말풍선)
│   └── components/
│       └── CharacterAvatar.tsx # 캐릭터 타입별(cat, dog, slime 등) 애니메이션/스프라이트 렌더링 컴포넌트
├── .env.example              # SUPABASE_URL, SUPABASE_ANON_KEY, VITE_SERVER_URL 환경변수 템플릿
├── package.json              # 프론트엔드/Electron/서버 실행 스크립트 및 의존성
└── vite.config.ts            # Vite 빌드 및 개발 서버 설정 (Port: 5173)
```

---

### 1.2 기능별 상세 명세

#### ① 데이터베이스 (Supabase PostgreSQL)
- **`users` 테이블 스키마**:
  ```sql
  CREATE TABLE IF NOT EXISTS public.users (
      id VARCHAR(50) PRIMARY KEY,               -- 사용자 로그인 아이디
      password_hash VARCHAR(255) NOT NULL,      -- 암호화된 비밀번호 (bcryptjs)
      nickname VARCHAR(50) NOT NULL,            -- 표시 닉네임
      character_type VARCHAR(30) DEFAULT NULL,  -- 선택한 캐릭터 ('cat' | 'dog' | 'slime' | NULL)
      created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- **환경변수 연동**: `.env` 파일의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`(또는 `SUPABASE_ANON_KEY`)를 통해 서버에서 Supabase와 통신합니다. (Supabase 연결 정보가 아직 설정되지 않은 로컬 테스트 상황에서도 즉시 동작을 검증할 수 있도록 안전한 폴백/안내 처리를 함께 제공합니다.)

#### ② 백엔드 서버 (`server/index.js` - Express + Socket.io, Port: 4000)
- **REST API**:
  - `POST /api/auth/register`: 회원가입 (`id`, `password`, `nickname`) → 비밀번호 해시 후 Supabase `users` 테이블 저장 (`character_type`은 `NULL`)
  - `POST /api/auth/login`: 로그인 검증 → 유저 정보(`id`, `nickname`, `characterType`) 반환
  - `POST /api/user/character`: 캐릭터 최초 선택/변경 (`userId`, `characterType`) → Supabase `users` 테이블 업데이트
  - `GET /api/rooms`: 현재 활성화된 실시간 방 목록 및 접속 인원수 조회
- **Socket.io 이벤트**:
  - `joinRoom` (`{ roomId, roomName, userId, nickname, characterType }`): 방 입장 및 초기 위치(`x: 15~85%`, `y: 85%`) 배정 후 `roomStateUpdate` 브로드캐스트
  - `moveCharacter` (`{ roomId, userId, x, y, direction, state }`): 캐릭터 좌표(`0~100%` 비율) 및 방향/상태 갱신 후 `characterMoved` 브로드캐스트
  - `sendMessage` (`{ roomId, userId, nickname, message }`): 방 전체에 `receiveMessage` 브로드캐스트 (메인 창 채팅 로그 + 오버레이 창 말풍선 동시 반영)
  - `leaveRoom` / `disconnect`: 방에서 유저 제거 후 `roomStateUpdate` 브로드캐스트

#### ③ Electron 멀티 윈도우 및 IPC (`electron/main.cjs`, `electron/preload.cjs`)
- **`Main Window` (420 x 650)**:
  - 일반 프레임 창, 크기 고정(`resizable: false`), `/#/main` 라우트 로드
- **`Overlay Window` (주 모니터 `workAreaSize` 전체 크기)**:
  - `transparent: true`, `frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `hasShadow: false`
  - 초기 상태는 `hide()` 및 `setIgnoreMouseEvents(true, { forward: true })`로 마우스 클릭을 바탕화면으로 완전 투과
- **IPC 채널**:
  - `ENTER_ROOM`: 오버레이 창 `show()` 및 `INIT_OVERLAY` 이벤트로 방/유저 정보 전달
  - `LEAVE_ROOM`: 오버레이 창 `hide()`
  - `SET_IGNORE_MOUSE`: 캐릭터 호버/드래그 시 `setIgnoreMouseEvents(false)`로 상호작용 활성화, 마우스 이탈 시 `setIgnoreMouseEvents(true, { forward: true })`로 복원

#### ④ 프론트엔드 (`MainWindow.tsx` & `OverlayWindow.tsx`)
- **`MainWindow` (`/main`) 4단계 상태 전환**:
  1. `LOGIN`: 로그인 및 회원가입 탭 전환 UI
  2. `SELECT_CHAR`: `characterType === null`인 경우 고양이(`cat`), 강아지(`dog`), 슬라임(`slime`) 중 아바타 선택 후 DB 저장
  3. `LOBBY`: 활성 방 목록 조회/입장 또는 새 방 이름 입력 후 생성
  4. `CHAT_ROOM`: 방 입장 시 Electron IPC(`enterRoom`) 호출로 오버레이 활성화, 실시간 채팅 메시지 송수신 및 방 나가기(`leaveRoom`) 제어
- **`OverlayWindow` (`/overlay`)**:
  - 방 내 전체 유저 캐릭터를 화면 비율(`left: ${x}%`, `top: ${y}%`)로 렌더링
  - 내 캐릭터 **자동 배회(Random Walk)** + **마우스 드래그 이동** 지원
  - 채팅 수신 시 해당 캐릭터 머리 위에 **말풍선(4초 후 자동 소멸)** 렌더링
  - 캐릭터 위에 마우스 진입/이탈 시 `window.electronAPI.setIgnoreMouse(false / true)` 호출

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: 프로젝트 초기화 및 환경 구성**
  - [x] React + Vite + TypeScript 프로젝트 구조 및 `package.json` 설정
  - [x] 필수 패키지 설치 (`electron`, `concurrently`, `wait-on`, `express`, `socket.io`, `socket.io-client`, `cors`, `@supabase/supabase-js`, `bcryptjs`, `dotenv`, `react-router-dom`)
  - [x] `.env.example` 및 Supabase SQL 스키마 파일(`server/schema.sql`) 작성
- [x] **Phase 2: Supabase 연동 백엔드 및 Socket.io 서버 구현**
  - [x] `server/supabase.js` 모듈 구현 (환경변수 로드 및 Supabase 클라이언트 초기화)
  - [x] `server/index.js`에 회원가입/로그인/캐릭터 선택/방 목록 REST API 구현
  - [x] `server/index.js`에 실시간 방 관리(`joinRoom`, `moveCharacter`, `sendMessage`, `disconnect`) Socket.io 로직 구현
- [x] **Phase 3: Electron 메인 프로세스 및 Preload 브릿지 구현**
  - [x] `electron/main.cjs`에 `createMainWindow()`, `createOverlayWindow()` 및 IPC 리스너(`ENTER_ROOM`, `LEAVE_ROOM`, `SET_IGNORE_MOUSE`) 구현
  - [x] `electron/preload.cjs`에 `window.electronAPI` 노출 구현
- [x] **Phase 4: 프론트엔드 메인 컨트롤 창 (`MainWindow.tsx`) 및 오버레이 창 (`OverlayWindow.tsx`) 구현**
  - [x] 투명 배경 CSS 및 캐릭터 아바타 그래픽 컴포넌트(`CharacterAvatar.tsx` - SVG/CSS 스프라이트 애니메이션으로 외부 이미지 깨짐 없이 즉시 고품질 렌더링) 구현
  - [x] `MainWindow.tsx`에 `LOGIN` → `SELECT_CHAR` → `LOBBY` → `CHAT_ROOM` 4단계 UI 및 API/소켓 연동 구현
  - [x] `OverlayWindow.tsx`에 바탕화면 캐릭터 렌더링, 자동 배회, 마우스 드래그 이동, 말풍선(4초 타이머), 마우스 클릭 투과 제어 구현
- [x] **Phase 5: 통합 실행 스크립트 구성 및 동작 검증**
  - [x] `npm run dev` 한 번으로 백엔드 서버(4000) + Vite 개발 서버(5173) + Electron 앱이 순차 실행되도록 스크립트 구성
  - [x] 타입체크(`tsc`), 프론트엔드 빌드(`vite build`), 서버 API 및 소켓 연동 테스트 수행

---

## 3. 영향 범위 및 고려사항

1. **투명 창 및 CSS 충돌 방지**:
   - `OverlayWindow`가 투명하게 렌더링되려면 `html`, `body`, `#root`의 배경이 기본적으로 `transparent`여야 하며, `MainWindow` 내부 컨테이너에만 불투명 배경 스타일을 부여해야 합니다.
2. **캐릭터 에셋(Asset) 가용성**:
   - 외부 `.gif` 파일이 없을 경우 엑스박스(깨진 이미지)가 표시될 수 있으므로, 초기 버전에서도 즉시 귀여운 애니메이션으로 동작하는 내장 SVG/CSS 스프라이트 캐릭터(`cat`, `dog`, `slime`)와 커스텀 GIF 경로 지원을 동시에 제공하여 완성도를 높입니다.
3. **소켓 연결 및 동기화 일관성**:
   - 메인 창에서 전송한 채팅 메시지가 오버레이 창의 캐릭터 말풍선과 메인 창의 채팅창 양쪽에 즉시 표시되도록 Socket.io 방(`roomId`) 이벤트를 일관되게 구독합니다.
4. **Supabase 환경변수 설정**:
   - 개발자의 Supabase 프로젝트 URL과 Key를 `.env`에 입력하면 즉시 실제 Supabase DB와 통신하며, `.env` 설정 전에도 로컬 테스트가 막히지 않도록 안내 메시지 및 연결 체크 엔드포인트를 제공합니다.

---

## 4. 검증 및 테스트 계획

1. **정적 타입 및 빌드 검증**:
   - `npm run build` (TypeScript 컴파일 및 Vite 번들링) 에러 0건 확인
2. **백엔드 API & Socket.io 검증**:
   - 서버 기동 후 회원가입 → 로그인(`characterType: null` 확인) → 캐릭터 선택(`cat` 저장) → 방 생성/입장 및 실시간 메시지/이동 이벤트 송수신 정상 동작 확인
3. **Electron 멀티 윈도우 & 오버레이 투과 검증**:
   - `Main Window`와 `Overlay Window` 동시 생성 확인
   - 방 입장 시 바탕화면에 캐릭터가 나타나고, 캐릭터 외 영역 클릭 시 바탕화면 통과(`setIgnoreMouseEvents(true)`) 및 캐릭터 호버 시 클릭/드래그 가능 여부 확인
