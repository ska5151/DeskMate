# 상세 기획 및 구현 계획서 (Plan): 순수 웹 기반 대화방 좌·우 2분할 레이아웃 전환 및 캐릭터 드래그 위치 고정

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/web-split-layout-fixed-drag/intent.md)를 바탕으로, Electron 없이 웹 화면에서 대화방 하단을 **좌·우 2분할(좌측: 캐릭터 돌아다니는 란 / 우측: 채팅방)**로 구성하고, **캐릭터 드래그 이동 시 아래로 떨어뜨리지 않고 이동된 상태 그대로 고정**하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 Electron 연동 호출 및 버튼 제거 (`src/pages/MainWindow.tsx`)
- 페이지 접속 시 실행되던 `deskmate://open` 및 `http://127.0.0.1:45678/open` 자동 실행 `useEffect`를 제거합니다.
- 방 입장(`connectAndEnterRoom`) 및 퇴장(`handleLeaveRoom`) 시 호출하던 `127.0.0.1:45678` 브릿지 fetch 및 `deskmate://enter-room` 딥링크 이동 로직을 제거합니다.
- 헤더의 `🚀 Electron 앱 열기` 버튼과 스테이지 상단의 `🚀 Windows 바탕화면에 캐릭터 띄우기` 버튼을 제거합니다.

### 1.2 대화방(`CHAT_ROOM`) 하단 좌·우 2분할 레이아웃 (`src/pages/MainWindow.tsx`, `src/index.css`)
- **전체 컨테이너 폭 확장**:
  - 대화방 진입 시 좌·우 2분할 화면이 쾌적하게 보이도록 `.main-window-shell` 내부 카드가 넓은 폭(최대 `1180px`, 화면 전체 높이 활용)으로 표시되도록 스타일을 구성합니다.
- **하단 2분할 영역 (`.chat-room-split-body`)**:
  - 대화방 상단 헤더/포모도로/이모트 바 아래의 본문 영역을 `display: grid; grid-template-columns: 1.15fr 1fr; gap: 14px; flex: 1; min-height: 0;`로 좌·우 2분할합니다.
  - **좌측 (`.split-left-stage` - 캐릭터 돌아다니는 란)**:
    - 방에 참여 중인 Rive 캐릭터들이 돌아다니고, 말풍선·이모트·타 유저 상호작용(쓰다듬기/찌르기/하이파이브)·더블클릭 빠른 채팅이 동작하는 스테이지 영역입니다.
  - **우측 (`.split-right-chat` - 실시간 채팅방)**:
    - 실시간 채팅 메시지 목록(`.chat-messages`)과 하단 메시지 입력창(`.chat-input-row`)이 꽉 차게 배치됩니다.

### 1.3 캐릭터 드래그 이동 시 낙하 제거 및 이동 위치 그대로 고정 (`src/pages/OverlayWindow.tsx`)
- **좌측 스테이지 영역 기준 정밀 드래그 좌표 계산 (`stageContainerRef`)**:
  - 좌측 캐릭터 란(`stageContainerRef`)의 `getBoundingClientRect()`를 기준으로 마우스 드래그 좌표(`x: 5% ~ 95%`, `y: 12% ~ 94%`)를 계산하여 마우스 커서 위치와 캐릭터 위치가 정확히 일치하도록 개선합니다.
- **중력 낙하(`startGravityDrop`) 제거 및 이동된 위치 고정(`pinnedUsers`)**:
  - 마우스 드래그 종료(`handleMouseUp`) 시 아래로 떨어뜨리는 `startGravityDrop` 물리 낙하 함수를 호출하지 않고, 놓은 위치(`x, y`)에서 `state: 'idle'`로 즉시 정지 및 브로드캐스트합니다.
  - 또한 사용자가 마우스로 잡고 이동시킨 캐릭터는 고정 상태(`pinnedUsers[userId] = true`)로 기록하여, 이후 자동 배회 타이머가 돌더라도 위치가 바뀌거나 아래로 내려가지 않고 **사용자가 이동시켜 놓은 위치 그대로 고정**되도록 합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/pages/OverlayWindow.tsx` 캐릭터 드래그 낙하 제거 및 위치 고정 구현**
  - [x] `stageContainerRef` 추가 및 스테이지 영역(`getBoundingClientRect()`) 기준 마우스 드래그 좌표(`x, y`) 계산 적용
  - [x] `handleMouseUp`에서 중력 낙하(`startGravityDrop`) 제거 및 놓은 좌표(`x, y`) 그대로 `idle` 상태로 고정
  - [x] 드래그로 위치를 이동한 캐릭터(`pinnedUsers`)는 자동 배회(`Random Walk`)에서 제외하여 이동된 위치 그대로 고정 유지
- [x] **Phase 2: `src/pages/MainWindow.tsx` Electron 호출 제거 및 대화방 하단 좌·우 2분할 구조 적용**
  - [x] `deskmate://` 및 `127.0.0.1:45678` 관련 코드·버튼 모두 제거
  - [x] `CHAT_ROOM` 하단 영역을 좌측 캐릭터 돌아다니는 란(`.split-left-stage`)과 우측 채팅방(`.split-right-chat`) 2분할 구조로 개편
- [x] **Phase 3: `src/index.css` 좌·우 2분할 레이아웃 스타일링 및 빌드 검증**
  - [x] `.chat-room-split-body`, `.split-left-stage`, `.split-right-chat` 스타일 추가
  - [x] 실행 중인 로컬 Electron 프로세스 종료 및 `npm run build` 검증

---

## 3. 영향 범위 및 고려사항
- **실시간 멀티플레이어 동기화 유지**: 캐릭터를 드래그해 원하는 위치(`x, y`)에 고정하면 `moveCharacter` 이벤트가 Supabase Realtime을 통해 방 안의 다른 모든 유저에게도 동일한 고정 좌표(`x, y`)로 실시간 반영됩니다.
- **반응형 대응**: 데스크톱/노트북 브라우저에서는 좌·우 2분할(`grid-template-columns: 1.15fr 1fr`)로 표시되며, 좁은 모바일 화면(`max-width: 760px`)에서도 깨지지 않도록 유연하게 대응합니다.

---

## 4. 검증 및 테스트 계획
1. **레이아웃 검증**: 대화방 진입 시 하단이 좌측(캐릭터 돌아다니는 란)과 우측(채팅방)으로 2분할 표시되는지 확인
2. **캐릭터 드래그 고정 검증**: 좌측 란에서 캐릭터를 마우스로 잡고 상·중·하 원하는 곳으로 이동시킨 뒤 놓았을 때, 아래로 떨어지지 않고 이동된 위치 그대로 고정되는지 확인
3. **프로덕션 빌드 검증**: `npm run build` 시 TypeScript 및 Vite 번들 에러 0건 확인
