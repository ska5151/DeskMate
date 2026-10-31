# 상세 기획 및 구현 계획서 (Plan): 모바일 버전 캐릭터 월드 좌측 하단 투명 방향키 및 우측 하단 투명 채팅 버튼 추가

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/mobile-touch-controls/intent.md)를 바탕으로, 모바일 환경에서 캐릭터 월드 좌측 하단에 투명 방향키(D-Pad), 우측 하단에 투명 채팅 버튼을 추가하기 위한 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 모바일 터치 방향키 및 채팅 버튼 UI (`src/pages/OverlayWindow.tsx`)
1. **좌측 하단 투명 방향키 패드 (`.mobile-dpad-container`)**:
   - 캐릭터 월드(`.overlay-stage-container`) 좌측 하단에 십자(또는 역T자) 배열의 `↑`, `←`, `↓`, `→` 방향키 버튼을 렌더링합니다.
   - 각 버튼은 터치 시작(`onTouchStart`) 및 마우스 누름(`onMouseDown`) 시 `pressedKeysRef.current`에 해당 방향키(`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`)를 등록하여 키보드 방향키와 동일하게 걷기 애니메이션(`walk`) 및 연속 이동이 수행되도록 연동합니다.
   - 터치 종료(`onTouchEnd`, `onTouchCancel`) 및 마우스 뗌(`onMouseUp`, `onMouseLeave`) 시 해당 키를 해제하고 캐릭터를 즉시 대기 상태(`idle`)로 멈추게 합니다.
2. **우측 하단 투명 채팅 버튼 (`.mobile-chat-btn`)**:
   - 캐릭터 월드 우측 하단에 `💬 채팅` 투명 버튼을 배치합니다.
   - 터치/클릭 시 `openQuickChatBar()`를 호출하여 즉시 채팅 입력란(`Quick Chat`)이 열리도록 합니다.

### 1.2 모바일 전용 표시 및 투명 버튼 스타일링 (`src/index.css`)
- **반응형 모바일 감지**:
  - 기본(PC 데스크톱)에서는 숨김(`display: none`) 처리하고, 모바일 화면 폭 또는 터치 기기(`@media (max-width: 768px), (hover: none) and (pointer: coarse)`)일 때만 좌측 하단 방향키와 우측 하단 채팅 버튼이 표시되도록 구성합니다.
- **투명색 버튼 디자인**:
  - `background: transparent` (누름 상태 시 미세한 반투명 피드백 `rgba(255, 255, 255, 0.15)`), 은은한 반투명 테두리(`border: 1.5px solid rgba(15, 23, 42, 0.25)`)를 적용하여 캐릭터 월드 배경을 가리지 않는 투명 버튼으로 스타일링합니다.
  - 모바일 화면에서도 채팅 입력창(`.overlay-quickchat-container`)이 화면 밖으로 잘리지 않도록 폭(`max-width: calc(100vw - 32px)`) 보정을 함께 적용합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/pages/OverlayWindow.tsx` 모바일 방향키 및 채팅 버튼 구현**
  - [x] 모바일 터치 방향키 시작/종료 핸들러(`handleDirectionPressStart`, `handleDirectionPressEnd`) 구현 및 이동 루프 연동
  - [x] 캐릭터 월드 좌측 하단에 투명 방향키(`↑`, `←`, `↓`, `→`) 및 우측 하단에 투명 채팅 버튼(`💬 채팅`) 렌더링 추가
- [x] **Phase 2: `src/index.css` 모바일 전용 미디어 쿼리 및 투명 버튼 스타일 추가**
  - [x] `.mobile-dpad-container`, `.mobile-dpad-btn`, `.mobile-chat-btn` 투명 스타일 및 `@media (max-width: 768px), (hover: none) and (pointer: coarse)` 반응형 규칙 추가
- [x] **Phase 3: 프로덕션 빌드(`npm run build`) 및 검증**
  - [x] `npm run build` 실행하여 TypeScript 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- 방향키 버튼 터치 시 모바일 브라우저의 기본 길게 누르기 메뉴(텍스트 선택, 컨텍스트 메뉴, 화면 스크롤/줌)가 발생하지 않도록 `user-select: none`, `touch-action: none`, `e.preventDefault()`를 적용합니다.
- PC 환경에서는 기존과 동일하게 키보드 방향키와 스페이스바 조작이 유지됩니다.

---

## 4. 검증 및 테스트 계획
1. **모바일 뷰포트/터치 환경 확인**: 모바일 화면에서 캐릭터 월드 좌측 하단에 투명 방향키, 우측 하단에 투명 채팅 버튼이 표시되는지 확인
2. **터치 이동 및 정지 확인**: 투명 방향키를 누르는 동안 캐릭터가 이동(`walk`)하고 손을 떼면 멈추는지(`idle`) 확인
3. **우측 하단 채팅 버튼 확인**: 투명 채팅 버튼 터치 시 채팅 입력란이 정상적으로 열리는지 확인
4. **빌드 검증**: `npm run build` 성공 확인
