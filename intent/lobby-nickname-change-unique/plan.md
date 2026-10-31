# 상세 기획 및 구현 계획서 (Plan): 방 목록(로비) 화면 닉네임 변경 기능 추가 및 닉네임 중복 불가 처리

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/lobby-nickname-change-unique/intent.md)를 바탕으로, 방 목록(`LOBBY`) 화면에서 닉네임을 변경할 수 있도록 하고 회원가입 및 닉네임 변경 시 중복된 닉네임을 사용할 수 없도록 하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 닉네임 중복 검사 및 변경 DB/API 로직 (`src/services/supabaseClient.ts`, `src/services/api.ts`, `server/supabase.js`, `server/index.js`)
- **닉네임 중복 확인 (`isNicknameTaken`)**:
  - 입력된 닉네임(`nickname.trim()`)과 동일한 닉네임을 가진 다른 사용자(`id !== currentUserId`)가 Supabase `users` 테이블(및 로컬 폴백 스토리지)에 존재하는지 조회합니다.
  - 이미 존재할 경우 `"이미 사용 중인 닉네임입니다."` 에러를 반환하여 중복 사용을 차단합니다.
- **회원가입(`directRegister`, `POST /api/auth/register`) 시 중복 검사**:
  - 아이디 중복 검사와 함께 닉네임 중복 검사를 수행하여, 이미 등록된 닉네임이면 `"이미 사용 중인 닉네임입니다."` 에러를 발생시킵니다.
- **닉네임 변경(`directUpdateNickname`, `api.updateNickname`, `POST /api/user/nickname`) API 추가**:
  - `{ userId, nickname }`을 전달받아 공백 제거 후 빈 문자열인지 확인하고, 본인을 제외한 다른 유저 중 동일 닉네임이 있는지 검사합니다.
  - 중복이 없으면 `users` 테이블의 `nickname` 컬럼(및 로컬 폴백 데이터)을 업데이트하고 갱신된 `User` 객체를 반환합니다.

### 1.2 방 목록(`LOBBY`) 화면 닉네임 변경 UI (`src/pages/MainWindow.tsx`, `src/index.css`)
- 방 목록(`step === 'LOBBY'`) 상단 사용자 요약 바(`.user-summary-bar`)에 **`닉네임 변경`** 버튼을 추가합니다.
- `[닉네임 변경]` 버튼 클릭 시 새 닉네임을 입력할 수 있는 인라인 폼(`.nickname-edit-box`)이 열리며:
  - 새 닉네임 입력 후 **`저장`** 클릭 시 `api.updateNickname({ userId: user.userId, nickname })`을 호출합니다.
  - 중복된 닉네임인 경우 상단 에러 배너(`.error-banner`)에 `"이미 사용 중인 닉네임입니다."`를 즉시 표시합니다.
  - 변경 성공 시 `user.nickname` 상태가 즉시 새 닉네임으로 갱신되고 입력 폼이 닫힙니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: 백엔드 및 Direct Supabase 닉네임 중복 검증 & 변경 API 구현**
  - [x] `src/services/supabaseClient.ts`에 닉네임 중복 검사 헬퍼 및 `directUpdateNickname` 추가, `directRegister`에 닉네임 중복 검사 적용
  - [x] `src/services/api.ts`에 `updateNickname` 메서드 추가
  - [x] `server/supabase.js` 및 `server/index.js`에 `findUserByNickname`, `updateUserNickname` 및 `POST /api/user/nickname` 엔드포인트 추가
- [x] **Phase 2: `src/pages/MainWindow.tsx` 및 `src/index.css` 방 목록 닉네임 변경 UI 구현**
  - [x] `MainWindow.tsx` 로비 상단 프로필 바에 `[닉네임 변경]` 버튼 및 닉네임 변경 입력/저장/취소 폼 구현
  - [x] `src/index.css`에 닉네임 변경 폼 스타일 추가
- [x] **Phase 3: 프로덕션 빌드(`npm run build`) 및 검증**
  - [x] `npm run build` 실행하여 TypeScript 컴파일 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- **본인 현재 닉네임과 동일한 경우 처리**: 현재 사용 중인 본인의 닉네임과 같은 값으로 저장을 누른 경우에는 에러 없이 변경 창만 닫히거나 정상 처리되도록 예외 처리합니다.
- **방 입장 시 변경된 닉네임 즉시 반영**: 로비에서 닉네임을 변경한 뒤 방에 입장하면 변경된 새 닉네임이 캐릭터 월드 태그와 말풍선에 즉시 적용됩니다.

---

## 4. 검증 및 테스트 계획
1. **닉네임 변경 동작 확인**: 방 목록 화면에서 `[닉네임 변경]` 클릭 후 사용되지 않은 새 닉네임 입력 시 즉시 변경되는지 확인
2. **닉네임 중복 불가 확인**: 이미 존재하는 다른 유저의 닉네임으로 변경(또는 회원가입) 시도 시 `"이미 사용 중인 닉네임입니다."` 에러가 표시되고 차단되는지 확인
3. **프로덕션 빌드 검증**: `npm run build` 에러 0건 확인
