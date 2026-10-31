# 상세 기획 및 구현 계획서 (Plan): 채팅 입력란 상단 버튼 선택 시 채팅 입력란 자동 닫기

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/close-quickchat-on-top-button/intent.md)를 바탕으로, 채팅 입력창(`Quick Chat`) 상단 버튼 클릭 시 입력란이 즉시 사라지도록 수정하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 `handleQuickEmote` 실행 시 `closeQuickChatBar()` 호출 추가 (`src/pages/OverlayWindow.tsx`)
- `OverlayWindow.tsx`의 `handleQuickEmote(emoteType: EmoteType)` 함수에서 `socketRef.current?.emit('triggerEmote', ...)`를 전송한 직후 **`closeQuickChatBar()`를 호출**합니다.
- 이를 통해 입력란 상단의 이모트 버튼(`👋`, `⭐`, `🎵`, `❤️`, `💤`)과 미니게임 버튼(`🎲`, `✌️`) 중 어느 것을 클릭하더라도 즉시 채팅 입력란(`overlay-quickchat-container`)이 닫히고 캐릭터 월드로 포커스가 복귀됩니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/pages/OverlayWindow.tsx` 상단 버튼 클릭 시 입력란 닫기 처리**
  - [x] `handleQuickEmote` 내부에 `closeQuickChatBar()` 호출 추가
- [x] **Phase 2: 프로덕션 빌드(`npm run build`) 및 동작 검증**
  - [x] `npm run build` 실행하여 TypeScript 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- `closeQuickChatBar()`가 호출되면 입력창 상태(`quickChatOpen`)가 `false`가 되어 입력란이 즉시 화면에서 사라지고, `stageContainerRef.current?.focus()`가 자동 호출되어 곧바로 방향키(`↑`, `↓`, `←`, `→`) 이동을 이어갈 수 있습니다.

---

## 4. 검증 및 테스트 계획
1. **상단 버튼 클릭 시 입력란 닫힘 확인**: `💬 채팅 입력`으로 입력란을 연 상태에서 상단 이모트/게임 버튼 선택 시 즉시 입력란이 사라지는지 확인
2. **빌드 검증**: `npm run build` 에러 0건 확인
