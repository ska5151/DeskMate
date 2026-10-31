# 상세 기획 및 구현 계획서 (Plan): 마우스 드래그 이동 삭제, 캐릭터 월드 방향키 이동(걷기 모션) 전환 및 상단 '내 상태' 란 삭제

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/arrow-key-movement-and-remove-status/intent.md)를 바탕으로, 마우스 드래그 이동을 제거하고 **캐릭터 월드 창 클릭(선택) 후 방향키(`↑`, `↓`, `←`, `→`)로만 이동(걷기 모션 포함)**하도록 전환하며, 대화방 상단의 **'내 상태' 란을 삭제**하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 마우스 드래그 이동 및 자동 배회 제거 (`src/pages/OverlayWindow.tsx`)
- 기존에 캐릭터를 마우스로 잡고 이동시키던 `draggingUserId` 상태 및 `mousemove`/`mouseup` 이벤트 핸들러를 완전히 삭제합니다.
- 캐릭터가 혼자 임의로 돌아다니던 자동 배회(`setInterval` Random Walk) 로직도 함께 제거하여, 오직 사용자의 방향키 조작으로만 이동하고 멈춘 자리에 그대로 고정되도록 합니다.

### 1.2 캐릭터 월드 창 선택(포커스) 후 방향키(`↑`, `↓`, `←`, `→`) 이동 및 걷기 모션(`walk`) 구현 (`src/pages/OverlayWindow.tsx`, `src/index.css`)
- **캐릭터 월드 창 클릭 선택 (`tabIndex={0}`, `isWorldFocused`)**:
  - 좌측 캐릭터 월드 컨테이너(`stageContainerRef`)에 `tabIndex={0}` 및 `onMouseDown={() => stageContainerRef.current?.focus()}`를 적용하여, 사용자가 캐릭터 월드 영역 어디든 클릭하면 즉시 방향키 입력을 받을 수 있는 선택(포커스) 상태가 됩니다.
  - 선택 여부에 따라 상단 안내 배지 및 포커스 테두리 스타일을 표시해 현재 방향키 조작이 가능한 상태임을 직관적으로 보여줍니다.
- **방향키(`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) 이동 및 `walk` 모션**:
  - 캐릭터 월드 창이 선택된 상태에서 방향키(`↑`, `↓`, `←`, `→`)를 누르면(`keydown`):
    1. 브라우저 스크롤(`e.preventDefault()`)을 차단하고, 잠자기(`sleep`) 이모트 중이었다면 깨웁니다.
    2. 눌려 있는 방향키(`pressedKeysRef`)를 감지하여 매 프레임(약 `40ms` 간격)마다 상·하·좌·우(대각선 포함)로 부드럽게 좌표를 이동(`x: 6% ~ 94%`, `y: 16% ~ 95%`)합니다.
    3. 좌(`←`)·우(`→`) 방향키에 맞춰 캐릭터가 바라보는 방향(`direction: 'left' | 'right'`)을 전환하고, **이동하는 동안 캐릭터 상태를 `state: 'walk'`로 설정하여 팔·다리·귀·꼬리가 움직이는 걷기 모션을 재생**합니다.
    4. 방향키에서 손을 떼면(`keyup`) 즉시 이동된 현재 좌표(`x, y`)에서 **`state: 'idle'`로 전환되어 그 자리에 그대로 고정**됩니다.
  - 기존 CSS의 `transition: left 2.4s linear, top 2.4s linear` 지연을 제거하여 방향키 입력에 즉각적이고 매끄럽게 반응하도록 개선합니다.

### 1.3 대화방 상단 '내 상태' 란 삭제 (`src/pages/MainWindow.tsx`, `src/index.css`)
- `MainWindow.tsx`의 대화방(`step === 'CHAT_ROOM'`) 상단 `.cowork-panel` 내부에 있던 `.status-selector-row`(`내 상태:` 라벨 및 `🟢 온라인`, `🔥 코딩 중`, `☕ 휴식 중`, `🎧 회의 중`, `🍅 집중 중` 버튼 목록)를 삭제합니다.
- `.cowork-panel` 안의 포모도로 바 상단 구분선(`border-top`)을 정리하여 깔끔한 단일 바로 표시합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/pages/OverlayWindow.tsx` 마우스 드래그 제거 및 방향키(`↑`, `↓`, `←`, `→`) 이동 + 걷기 모션(`walk`) 구현**
  - [x] 마우스 드래그 이동(`draggingUserId`, `mousemove`, `mouseup`) 및 자동 배회(`Random Walk`) 로직 삭제
  - [x] 캐릭터 월드 컨테이너(`stageContainerRef`) 포커스(`tabIndex={0}`, `isWorldFocused`) 처리 추가
  - [x] 방향키(`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) 입력 시 `state: 'walk'` 걷기 모션과 함께 이동하고, 키 해제 시 `state: 'idle'`로 정지·고정되도록 구현
- [x] **Phase 2: `src/pages/MainWindow.tsx` 및 `src/index.css` 상단 '내 상태' 란 삭제 및 스타일 정리**
  - [x] `MainWindow.tsx`에서 `.status-selector-row`(`내 상태` 선택 란) 삭제 및 캐릭터 월드 안내 배지 문구 업데이트
  - [x] `src/index.css`에서 캐릭터 월드 포커스 스타일 및 `.pomodoro-bar` 스타일 정리
- [x] **Phase 3: 프로덕션 빌드(`npm run build`) 및 동작 검증**
  - [x] `npm run build` 실행하여 TypeScript 컴파일 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- **채팅 입력창과의 키 충돌 방지**: 우측 채팅 입력창이나 빠른 채팅 입력창(`input`)을 클릭하면 캐릭터 월드 창의 포커스가 자연스럽게 해제(`onBlur`)되어, 채팅 입력 중 방향키로 커서를 이동할 때는 캐릭터가 움직이지 않도록 분리됩니다.
- **실시간 멀티플레이어 동기화**: 방향키로 이동하는 좌표와 걷기 모션(`state: 'walk'`) 및 정지 상태(`state: 'idle'`)가 방 안의 모든 유저에게 실시간으로 동기화됩니다.

---

## 4. 검증 및 테스트 계획
1. **마우스 드래그 제거 확인**: 캐릭터를 마우스로 잡고 끌어도 이동하지 않는지 확인
2. **캐릭터 월드 선택 후 방향키 이동 및 걷기 모션 확인**: 좌측 캐릭터 월드 창 클릭 후 방향키(`↑`, `↓`, `←`, `→`) 입력 시 캐릭터가 걷는 모션(`walk`)을 취하며 이동하고, 키를 떼면 이동된 위치에 고정(`idle`)되는지 확인
3. **상단 '내 상태' 란 삭제 확인**: 대화방 상단에서 '내 상태' 선택 란이 제거되었는지 확인
4. **빌드 검증**: `npm run build` 에러 0건 확인
