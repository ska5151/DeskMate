# 상세 기획 및 구현 계획서 (Plan): 미니게임 말풍선 3초 소멸, 상단 버튼 클릭 시 캐릭터 월드 자동 포커스, 스페이스바 채팅 입력 연동

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/game-bubble-3s-timeout/intent.md)를 바탕으로, 미니게임 말풍선 3초 소멸, 상단 버튼 클릭 시 캐릭터 월드 자동 포커스, 스페이스바 채팅 입력 기능을 구현하기 위한 상세 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 주사위·가위바위보 말풍선 3초 소멸 & 직접 입력 채팅 지속 표시 (`src/pages/OverlayWindow.tsx`)
- **직접 입력 채팅 상태 (`bubbles`)**:
  - `msg.messageType !== 'game'`인 일반 채팅만 저장하며, 자동 삭제 타이머 없이 다음 일반 채팅 전까지 계속 유지합니다.
  - `roomHistory` 이벤트에서도 `m.messageType !== 'game'` && `m.messageType !== 'system'`인 일반 채팅만 복원합니다.
- **미니게임 결과 말풍선 상태 (`gameBubbles`)**:
  - `msg.messageType === 'game'`(주사위, 가위바위보)일 때 `gameBubbles[msg.userId]`에 저장하고, `bubbleTimersRef.current[msg.userId]`를 통해 **3초(`3000ms`) 후 자동으로 삭제**합니다.
  - 캐릭터 상단에는 `gameBubbles[char.userId]`가 있을 때 3초간 게임 결과 말풍선을 표시하고, 3초 뒤 사라지면 기존 직접 입력 채팅(`bubbles[char.userId]`)이 있을 경우 계속 표시합니다.

### 1.2 캐릭터 월드 상단 버튼 선택 시 자동 포커스 (`src/pages/MainWindow.tsx`, `src/pages/OverlayWindow.tsx`)
- `MainWindow.tsx`에서 상단 바의 버튼(`handleTriggerEmote`, `handleSendGameCommand`, `handlePomodoroControl`, `handleCopyInviteCode`)을 클릭할 때 `deskmate:focus-world` 커스텀 이벤트 발생 및 `.overlay-stage-container` 포커스를 수행합니다.
- `OverlayWindow.tsx`에서 `deskmate:focus-world` 이벤트 수신 시(그리고 방 입장 시) 열려 있는 미니 채팅창이 있다면 닫고 `stageContainerRef.current?.focus()` 및 `setIsWorldFocused(true)`를 수행하여, 상단 버튼 클릭 직후 곧바로 방향키(`↑`, `↓`, `←`, `→`)로 캐릭터를 이동할 수 있게 합니다.

### 1.3 캐릭터 하단 `스페이스바` 변경 및 스페이스바 키 입력 시 채팅 입력란 표시 (`src/pages/OverlayWindow.tsx`, `src/pages/MainWindow.tsx`)
- 내 캐릭터 하단 버튼(`.character-chat-open-btn`)의 텍스트를 기존 `💬 채팅 입력`에서 **`💬 스페이스바`**로 변경합니다.
- `OverlayWindow.tsx`의 키보드 이벤트 핸들러에서 채팅 입력창이 닫혀 있을 때(`!quickChatOpen`) **스페이스바(`e.code === 'Space' || e.key === ' '`)** 입력 시 `e.preventDefault()` 처리 후 `openQuickChatBar()`를 호출하여 채팅 입력란이 즉시 나타나고 포커스되도록 합니다.
- `MainWindow.tsx`의 캐릭터 월드 상단 배지 안내 문구도 `[💬 스페이스바]` 기준으로 업데이트합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: 미니게임 3초 소멸 및 직접 입력 채팅 지속 유지 구현 (`src/pages/OverlayWindow.tsx`)**
  - [x] `gameBubbles` 상태 분리 및 `receiveMessage`에서 `msg.messageType === 'game'`일 때 `3000ms` 타이머 삭제 적용
  - [x] `roomHistory`에서 일반 채팅(`m.messageType !== 'game'`)만 `bubbles`에 복원하도록 수정
- [x] **Phase 2: 상단 버튼 클릭 시 캐릭터 월드 자동 포커스 연동 (`src/pages/MainWindow.tsx`, `src/pages/OverlayWindow.tsx`)**
  - [x] `MainWindow.tsx` 상단 액션 핸들러들에 캐릭터 월드 포커스 헬퍼(`focusCharacterWorld`) 호출 추가
  - [x] `OverlayWindow.tsx`에서 `deskmate:focus-world` 이벤트 리스너 및 초기 자동 포커스 처리 추가
- [x] **Phase 3: 캐릭터 하단 `스페이스바` 버튼 문구 변경 및 스페이스바 단축키 구현 (`src/pages/OverlayWindow.tsx`, `src/pages/MainWindow.tsx`)**
  - [x] 내 캐릭터 하단 버튼 문구를 `💬 스페이스바`로 변경
  - [x] 스페이스바(`Space`) 입력 시 채팅 입력란(`openQuickChatBar()`) 오픈 연동
- [x] **Phase 4: 프로덕션 빌드(`npm run build`) 및 검증**
  - [x] `npm run build` 실행하여 TypeScript 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- 스페이스바 입력 시 `e.preventDefault()`를 호출하여, 새로 열리는 채팅 입력칸(`input`)에 공백 문자가 먼저 입력되거나 포커스된 버튼이 재클릭되는 현상을 방지합니다.
- 이미 채팅 입력란(`input`)이 열려 글을 작성 중일 때는 스페이스바가 정상적으로 띄어쓰기로 입력됩니다.

---

## 4. 검증 및 테스트 계획
1. **주사위·가위바위보 3초 소멸 확인**: 상단 `🎲 주사위`, `✌️ 가위바위보` 클릭 시 캐릭터 상단 말풍선이 3초 뒤 사라지고, 직접 입력한 채팅만 계속 유지되는지 확인
2. **상단 버튼 클릭 후 방향키 이동 확인**: 상단 이모트/주사위/가위바위보 버튼 클릭 직후 마우스 추가 클릭 없이 방향키로 캐릭터가 즉시 이동하는지 확인
3. **스페이스바 채팅 입력 확인**: 내 캐릭터 하단에 `💬 스페이스바`가 표시되고, 키보드 스페이스바를 누르면 즉시 채팅 입력란이 열리는지 확인
4. **빌드 검증**: `npm run build` 성공 확인
