# 상세 기획 및 구현 계획서 (Plan): DeskMate 고도화 기능 확장 (v2)

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/feature-expansion-v2/intent.md)에서 승인된 **3대 영역 11개 고도화 기능**을 DeskMate 코드베이스에 구현하기 위한 상세 설계 및 단계별 실행 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 영역 1: 캐릭터 상호작용 & 애니메이션 고도화

#### ① 감정 표현(이모트) 및 액션 제스처
- **지원 이모트/제스처 종류**:
  - `wave` (`👋 인사하기`), `jump` (`⭐ 점프`), `dance` (`🎵 춤추기`), `heart` (`❤️ 하트`), `sleep` (`💤 잠자기(ZZZ)`)
- **조작 방식**:
  - 메인 컨트롤 창의 이모트 버튼 바 또는 바탕화면 오버레이 단축키(`Alt+1`~`Alt+5`) 및 미니 액션 메뉴로 실행
- **동기화 및 렌더링**:
  - Socket 이벤트 `triggerEmote` (`{ roomId, userId, emoteType }`) 전송 → 방 전체 `characterEmote` 수신
  - 캐릭터 머리 위에 플로팅 이모트 배지/이펙트 표시 및 캐릭터 모션(점프 바운스, 좌우 댄스 회전, ZZZ 수면 모션) 3.5초간 재생 (`sleep`은 이동 전까지 유지 가능)

#### ② 물리 효과 (중력 & 작업표시줄 착지)
- **동작 원리**:
  - 오버레이 창에서 내 캐릭터를 마우스로 높은 곳(`y < 88%`)으로 드래그한 뒤 마우스를 놓으면(`mouseup`), 즉시 중력 가속도(`gravity`)와 탄성 반발 계수(`bounce`)가 적용된 물리 루프(`requestAnimationFrame`)가 작동합니다.
  - 캐릭터가 화면 바닥(작업표시줄 바로 위 기준선 `GROUND_Y = 88%`)까지 가속 낙하한 뒤 1~2회 통통 튀어 오르며 자연스럽게 착지합니다.
  - 착지 완료 시 최종 좌표(`x`, `y: 88%`)를 서버(`moveCharacter`)로 동기화하여 다른 유저 화면에서도 바닥으로 내려오는 모습을 표현합니다.

#### ③ 다른 유저 캐릭터와 상호작용
- **지원 상호작용 종류**:
  - `pet` (`🫳 쓰다듬기`), `poke` (`👉 찌르기`), `highfive` (`🙌 하이파이브`)
- **동작 원리**:
  - 바탕화면 오버레이에서 **다른 유저의 캐릭터를 클릭**하면 캐릭터 옆에 귀여운 원형 팝업 메뉴(`쓰다듬기`, `찌르기`, `하이파이브`)가 나타납니다.
  - 선택 시 Socket 이벤트 `interactCharacter` (`{ roomId, fromUserId, fromNickname, toUserId, toNickname, actionType }`)를 전송합니다.
  - 대상 캐릭터와 발신 캐릭터 머리 위에 상호작용 이펙트(예: `🙌 데스크메이트님이 하이파이브!`)와 점프/흔들림 리액션 애니메이션이 동시에 표시되고 채팅 로그에도 시스템 알림으로 기록됩니다.

---

### 1.2 영역 2: 데스크톱 편의성 & 업무/생산성 결합 (코워킹 기능)

#### ④ 바탕화면 위 미니 채팅 입력바 (Quick Chat)
- **호출 방식**:
  - 바탕화면의 **내 캐릭터를 더블클릭**하거나, 글로벌 단축키 **`Alt + Enter`**를 누르면 내 캐릭터 바로 아래(또는 머리 위)에 미니 채팅 입력바가 즉시 나타납니다.
- **포커스 및 마우스 제어**:
  - Quick Chat이 열릴 때 Electron IPC(`SET_OVERLAY_FOCUSABLE`, `true`)를 호출하여 투명 오버레이 창에서도 키보드 타이핑이 가능하도록 포커스를 획득하고, `Enter`로 전송하거나 `Esc`를 누르면 다시 `focusable: false` 및 마우스 투과(`setIgnoreMouseEvents(true)`) 상태로 복귀합니다.

#### ⑤ 시스템 트레이(System Tray) 아이콘 및 단축키 제어
- **시스템 트레이 상주**:
  - Electron `Tray` 및 프로그래밍 방식으로 생성한 `nativeImage` 아이콘을 등록합니다.
  - 메인 컨트롤 창의 닫기(`X`) 버튼을 누르면 프로세스를 종료하지 않고 트레이로 숨기며, 트레이 아이콘 클릭 시 메인 창을 다시 엽니다.
- **트레이 컨텍스트 메뉴 & 글로벌 단축키**:
  - `컨트롤 창 열기/숨기기`
  - `바탕화면 오버레이 보이기/숨기기` (글로벌 단축키: `Alt + H`)
  - `방해 금지 모드 (DND) 켜기/끄기` (활성화 시 말풍선 팝업 및 효과음 차단)
  - `빠른 채팅 입력 열기` (`Alt + Enter`)
  - `DeskMate 완전 종료`

#### ⑥ 함께 집중하기 (포모도로 타이머 & 상태 표시)
- **사용자 상태 표시 (`statusBadge`)**:
  - `online` (`🟢 온라인`), `coding` (`🔥 코딩 중`), `resting` (`☕ 휴식 중`), `meeting` (`🎧 회의 중`), `focus` (`🍅 집중 중`)
  - 상태 변경 시 Socket `updateStatus` 이벤트로 방 전체에 즉시 동기화되며, 바탕화면 캐릭터 닉네임 태그 옆에 상태 배지가 표시됩니다.
- **공유 포모도로 타이머 (`Pomodoro`)**:
  - 방 단위로 공유되는 **25분 집중(`FOCUS`) / 5분 휴식(`BREAK`)** 타이머를 서버에서 관리합니다.
  - 메인 컨트롤 창 및 바탕화면 상단 미니 HUD에서 남은 시간을 실시간 확인하고 `시작 / 일시정지 / 리셋 / 모드 전환`을 함께 제어할 수 있습니다.

#### ⑦ 다중 모니터(Multi-Monitor) 이동 및 모니터 선택
- **Electron 디스플레이 제어**:
  - `screen.getAllDisplays()`로 연결된 모든 모니터 목록(ID, 이름/해상도, 주 모니터 여부, `workArea`)을 조회하는 IPC(`GET_DISPLAYS`) 및 특정 모니터로 오버레이 창을 즉시 재배치하는 IPC(`MOVE_OVERLAY_DISPLAY`, `displayId`)를 구현합니다.
  - 메인 컨트롤 창 상단/로비 및 채팅방에서 드롭다운으로 오버레이를 띄울 모니터를 언제든 변경할 수 있습니다.

---

### 1.3 영역 3: 멀티플레이어 방(Room) & 채팅 기능 확장

#### ⑧ 비밀방(비밀번호) 및 초대 코드 기능
- **방 보안 및 초대 코드**:
  - 방 생성 시 선택적으로 **비밀번호(`password`)**를 설정할 수 있으며, 모든 방에는 고유한 6자리 영숫자 **초대 코드(`inviteCode`, 예: `DM7X9K`)**가 자동 발급됩니다.
  - 잠금 표시(`🔒`)가 있는 비밀방 입장 시 비밀번호를 검증하며, 로비에서 **초대 코드 입력**으로 원하는 방에 바로 입장하거나 방 안에서 초대 코드를 클립보드에 복사할 수 있습니다.

#### ⑨ 채팅 기록(History) 및 방 목록 Supabase DB 연동
- **Supabase 추가 테이블 스키마 ([server/schema.sql](file:///c:/project/DeskMate/server/schema.sql))**:
  - `public.rooms`: `room_id`, `room_name`, `is_private`, `password_hash`, `invite_code`, `created_at`
  - `public.messages`: `id`, `room_id`, `user_id`, `nickname`, `message`, `message_type` (`chat` | `system` | `game`), `created_at`
- **동작 방식**:
  - 서버 시작 시 Supabase `rooms` 테이블에서 방 목록을 로드하고, 새 방 생성 및 채팅 메시지 전송 시 Supabase DB에 비동기로 영구 저장합니다.
  - 유저가 방에 늦게 입장하더라도 해당 방의 **최근 채팅 내역(최대 50개)**을 즉시 불러와(`roomHistory` 이벤트) 이전 대화 맥락을 그대로 확인할 수 있습니다. (테이블 미생성 시에도 인메모리 히스토리 폴백으로 완벽 동작)

#### ⑩ 효과음(SFX) 및 말풍선 알림음
- **Web Audio API 신디사이저 사운드 엔진 (`src/utils/sound.ts`)**:
  - 외부 오디오 파일(`.mp3`) 의존성이나 로드 실패 없이 언제나 즉각 재생되는 경량 Web Audio API 효과음 모듈을 구현합니다.
  - 상황별 효과음:
    - 새 말풍선 팝업음 (`pop`)
    - 캐릭터별 고유 울음/효과음 (`cat` 야옹 톤, `dog` 멍멍 톤, `slime` 보글 톤)
    - 이모트/상호작용 알림음 (`emote`)
    - 미니게임/포모도로 완료 알림음 (`fanfare`)
  - 메인 창 헤더 및 오버레이에서 **음소거(`Mute`) 토글**을 지원하며, 방해 금지 모드(DND) 활성화 시 자동으로 소리가 차단됩니다.

#### ⑪ 미니 게임 / 주사위 & 가위바위보
- **명령어 및 버튼 실행**:
  - 채팅창 또는 바탕화면 Quick Chat에 `/주사위` (`/dice`) 또는 `/가위바위보` (`/rps`, 또는 `/가위`, `/바위`, `/보`)를 입력하거나 빠른 미니게임 버튼을 클릭하면 발동합니다.
- **연출**:
  - 서버에서 공정한 난수 결과(주사위 `🎲 1~6`, 가위바위보 `✌️ 가위 / ✊ 바위 / 🖐️ 보`)를 생성하여 방 전체에 브로드캐스트합니다.
  - 바탕화면 캐릭터 머리 위에 회전/애니메이션 효과가 있는 특별 미니게임 결과 말풍선이 뜨고 효과음이 재생됩니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: Supabase 스키마 및 데이터 레이어 확장 (`server/schema.sql`, `server/supabase.js`)**
  - [x] `rooms`, `messages` 테이블 DDL 추가 (`schema.sql`)
  - [x] 방 생성/조회 및 최근 채팅 기록(History) 저장/조회 함수 및 인메모리 폴백 구현 (`supabase.js`)
- [x] **Phase 2: 백엔드 REST API & Socket.io 프로토콜 확장 (`server/index.js`)**
  - [x] 비밀방 비밀번호 검증, 6자리 초대 코드 생성 및 초대 코드 입장 API 추가
  - [x] Socket 이벤트 확장: `roomHistory`, `triggerEmote`, `interactCharacter`, `updateStatus`, `pomodoroControl`, 미니게임 명령어(`/주사위`, `/가위바위보`) 파싱 및 브로드캐스팅 구현
- [x] **Phase 3: Electron 트레이, 글로벌 단축키, 다중 모니터, Quick Chat 포커스 제어 (`electron/main.cjs`, `electron/preload.cjs`)**
  - [x] 시스템 트레이(`Tray`) 아이콘 및 컨텍스트 메뉴(오버레이 숨김/보이기, 방해 금지 모드, 완전 종료) 구현
  - [x] 글로벌 단축키(`Alt+Enter` 퀵챗 열기, `Alt+H` 오버레이 토글) 등록
  - [x] 다중 모니터 목록 조회(`GET_DISPLAYS`) 및 모니터 이동(`MOVE_OVERLAY_DISPLAY`) IPC 구현
  - [x] 바탕화면 Quick Chat 입력 시 오버레이 창 포커스 전환(`SET_OVERLAY_FOCUSABLE`) IPC 구현
- [x] **Phase 4: 프론트엔드 사운드 엔진, 물리 엔진, 오버레이 & 메인 창 고도화**
  - [x] `src/utils/sound.ts` (Web Audio API 효과음 및 Mute 관리) 구현
  - [x] `src/types/index.ts`, `src/types/electron.d.ts`, `src/services/api.ts` 확장
  - [x] `src/components/CharacterAvatar.tsx`에 이모트/제스처 모션(`wave`, `jump`, `dance`, `heart`, `sleep`) 및 리액션 효과 추가
  - [x] `src/pages/OverlayWindow.tsx`에 중력/바운스 착지 물리 엔진, 타 유저 클릭 상호작용 메뉴, Quick Chat 미니 입력바, 포모도로 상단 미니 배지, 이모트/미니게임 말풍선 구현
  - [x] `src/pages/MainWindow.tsx`에 비밀방/초대코드 UI, 다중 모니터 선택기, 음소거/방해금지 토글, 상태 선택(`🔥 코딩 중` 등), 공유 포모도로 타이머, 이모트/미니게임 퀵 버튼 바 구현
- [x] **Phase 5: 통합 빌드 및 기능 검증**
  - [x] `npm run build` (`tsc -b && vite build`) 정적 타입 및 번들 빌드 검증
  - [x] 비밀방/초대코드, 채팅 히스토리, 이모트/상호작용/포모도로/미니게임 서버 통합 테스트 수행

---

## 3. 영향 범위 및 고려사항

1. **오버레이 키보드 입력과 마우스 투과의 조화**:
   - 평소에는 `OverlayWindow`가 `focusable: false` 및 `setIgnoreMouseEvents(true)` 상태로 동작하여 바탕화면 작업을 전혀 방해하지 않으며, 오직 Quick Chat(`Alt+Enter` 또는 내 캐릭터 더블클릭)이 활성화된 동안에만 `setFocusable(true)` 및 포커스를 부여한 뒤 전송/취소 즉시 원래의 투과 상태로 복원합니다.
2. **Supabase 하위 호환성**:
   - 기존 `users` 테이블뿐만 아니라 새로 추가되는 `rooms`, `messages` 테이블이 아직 Supabase에 생성되지 않은 경우에도 서버가 중단되지 않고 자동으로 인메모리 폴백으로 채팅 기록과 비밀방을 유지하도록 설계합니다.

---

## 4. 검증 및 테스트 계획

1. **타입 및 프로덕션 빌드 검증**:
   - `npm run build` 실행 시 TypeScript 컴파일 에러 0건 및 Vite 번들 생성 확인
2. **백엔드 확장 API & 실시간 이벤트 검증**:
   - 비밀방 생성/비밀번호 검증/초대코드 입장 테스트
   - 채팅 전송 후 재입장 시 최근 채팅 히스토리(`roomHistory`) 수신 확인
   - `/주사위`, `/가위바위보` 명령어, 이모트(`triggerEmote`), 상호작용(`interactCharacter`), 상태 변경(`updateStatus`), 포모도로(`pomodoroControl`) 이벤트 정상 브로드캐스트 확인
