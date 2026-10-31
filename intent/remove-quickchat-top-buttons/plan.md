# 상세 기획 및 구현 계획서 (Plan): 캐릭터 월드 내 채팅 입력란 상단 중복 버튼들 삭제

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/remove-quickchat-top-buttons/intent.md)를 바탕으로, 캐릭터 월드 내 미니 채팅 입력창(`Quick Chat`) 상단의 중복 이모트/미니게임 버튼 줄을 삭제하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 `src/pages/OverlayWindow.tsx` 내 `.quickchat-action-strip` 및 미사용 핸들러 삭제
- `OverlayWindow.tsx`의 `.overlay-quickchat-container` 내부에 있던 `.quickchat-action-strip` 블록(이모트 5종 버튼 및 주사위/가위바위보 버튼)과 관련 핸들러(`handleQuickEmote`, `handleQuickCommand`)를 삭제합니다.
- `.overlay-quickchat-container` 내부에는 순수하게 채팅 입력 폼(`.quickchat-form`: 텍스트 입력칸 + `전송` 버튼 + `✕` 닫기 버튼)만 렌더링되도록 구성합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/pages/OverlayWindow.tsx` 채팅 입력창 상단 버튼 줄 제거**
  - [x] `.quickchat-action-strip` 영역 및 미사용 `handleQuickEmote`, `handleQuickCommand` 제거
- [x] **Phase 2: 프로덕션 빌드(`npm run build`) 및 검증**
  - [x] `npm run build` 실행하여 TypeScript 컴파일 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- 캐릭터 월드 상단 바(`.action-bar-row`)의 이모트 및 미니게임 버튼들과 입력창 내 `/주사위`, `/가위바위보` 명령어 입력 기능은 그대로 정상 동작합니다.

---

## 4. 검증 및 테스트 계획
1. **채팅 입력창 UI 확인**: `[💬 채팅 입력]` 클릭 시 상단 아이콘 버튼들 없이 깔끔한 한 줄 채팅 입력창만 표시되는지 확인
2. **빌드 검증**: `npm run build` 에러 0건 확인
