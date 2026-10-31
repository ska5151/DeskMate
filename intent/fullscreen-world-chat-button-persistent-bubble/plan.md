# 상세 기획 및 구현 계획서 (Plan): 우측 채팅방 제거 후 캐릭터 월드 전체 화면 확장, 닉네임 하단 채팅 입력 버튼 추가 및 말풍선 지속 유지

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/fullscreen-world-chat-button-persistent-bubble/intent.md)를 바탕으로, 우측 실시간 채팅방을 없애고 캐릭터 월드를 전체 화면으로 채우며, 내 캐릭터 닉네임 하단에 `[💬 채팅 입력]` 버튼을 추가하고, 캐릭터 상단 말풍선이 다음 채팅 전까지 사라지지 않도록 하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 우측 실시간 채팅방 제거 및 캐릭터 월드 화면 100% 확장 (`src/pages/MainWindow.tsx`, `src/index.css`)
- `MainWindow.tsx`의 대화방(`step === 'CHAT_ROOM'`)에서 우측 `.split-right-chat`(채팅 메시지 목록 및 하단 입력창)을 제거합니다.
- `.chat-room-split-body`를 단일 전체 영역(`display: flex; flex: 1; width: 100%; height: 100%;`)으로 변경하여 **캐릭터 월드(`.split-left-stage`)가 대화방 하단 전체 화면을 빈틈없이 꽉 채우도록** 구성합니다.

### 1.2 내 캐릭터 닉네임 하단 `[💬 채팅 입력]` 버튼 추가 (`src/pages/OverlayWindow.tsx`, `src/index.css`)
- `OverlayWindow.tsx`의 캐릭터 렌더링 영역에서 `.overlay-nametag-row`(닉네임 표시줄) 바로 하단에 `isMe`(내 캐릭터)일 때 **`💬 채팅 입력`** 버튼(`.character-chat-open-btn`)을 표시합니다.
- 버튼 클릭 시 이벤트 전파(`e.stopPropagation()`)를 막고 `openQuickChatBar()`를 호출하여, 캐릭터를 더블클릭했을 때 나타나는 **미니 채팅 입력바(이모트 5종 + 주사위/가위바위보 + 말풍선 입력창)**가 즉시 열리고 입력창에 자동 포커스되도록 구현합니다.

### 1.3 캐릭터 상단 말풍선 영구 유지 — 다음 채팅 전까지 삭제 안 함 (`src/pages/OverlayWindow.tsx`)
- `socket.on('receiveMessage', ...)` 이벤트 핸들러에서 4.5초 뒤 말풍선을 삭제하던 `bubbleTimersRef` `setTimeout(..., 4500)` 로직을 완전히 제거합니다.
- 이를 통해 캐릭터가 채팅을 치면 머리 위 말풍선이 사라지지 않고 계속 유지되며, **해당 캐릭터가 다음 채팅을 입력할 때 새로운 말풍선 텍스트로 교체**됩니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/pages/OverlayWindow.tsx` 말풍선 영구 유지 및 닉네임 하단 `[💬 채팅 입력]` 버튼 구현**
  - [x] `receiveMessage` 수신 시 4.5초 말풍선 자동 삭제 타이머(`bubbleTimersRef`) 제거 (다음 채팅 전까지 계속 유지)
  - [x] 내 캐릭터(`isMe`)의 닉네임 태그(`.overlay-nametag-row`) 하단에 `💬 채팅 입력` 버튼 추가 및 클릭 시 `openQuickChatBar()` 실행
- [x] **Phase 2: `src/pages/MainWindow.tsx` 및 `src/index.css` 우측 채팅방 제거 및 캐릭터 월드 전체 화면 확장**
  - [x] `MainWindow.tsx`에서 우측 `.split-right-chat` 영역 제거 및 캐릭터 월드 단독 전체 화면 배치
  - [x] `src/index.css`에서 캐릭터 월드 전체 화면 스타일 및 `.character-chat-open-btn` 버튼 스타일 추가
- [x] **Phase 3: 프로덕션 빌드(`npm run build`) 및 동작 검증**
  - [x] `npm run build` 실행하여 TypeScript 컴파일 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- **빠른 채팅창(Quick Chat) 위치 보정**: 캐릭터가 화면 하단(`y: 88%` 등)이나 상단에 있을 때도 미니 채팅 입력창이 화면 밖으로 잘리지 않도록 위치를 자동 보정하여 언제나 쾌적하게 입력할 수 있도록 합니다.
- **방향키 이동과의 조화**: `💬 채팅 입력` 버튼을 눌러 입력창에 포커스된 동안에는 방향키 이동이 일시 정지되고, 채팅 전송(`Enter`) 또는 닫기(`Esc` / `✕`) 시 다시 캐릭터 월드 포커스로 돌아와 방향키로 즉시 이동할 수 있습니다.

---

## 4. 검증 및 테스트 계획
1. **캐릭터 월드 전체 화면 확인**: 우측 채팅방이 제거되고 캐릭터 월드가 대화방 전체를 꽉 채우는지 확인
2. **닉네임 하단 `[💬 채팅 입력]` 버튼 동작 확인**: 내 캐릭터 닉네임 아래의 `💬 채팅 입력` 버튼 클릭 시 더블클릭 때와 동일한 미니 채팅/이모트/게임 창이 열리는지 확인
3. **말풍선 지속 유지 확인**: 채팅 전송 후 시간이 지나도 캐릭터 상단 말풍선이 사라지지 않고 다음 채팅 입력 시에만 새 내용으로 바뀌는지 확인
4. **빌드 검증**: `npm run build` 에러 0건 확인
