# 상세 기획 및 구현 계획서 (Plan): 닉네임 수정 시 '요청 실패 (HTTP 404)' 오류 해결

본 문서는 승인된 [intent.md](file:///c:/project/DeskMate/intent/fix-nickname-update-404/intent.md)를 바탕으로, 닉네임 수정 시 발생하는 `HTTP 404` 오류를 해결하기 위해 [`src/services/api.ts`](file:///c:/project/DeskMate/src/services/api.ts)를 Direct Supabase 직접 호출 구조로 일원화하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 `src/services/api.ts` Direct Supabase 직접 호출 일원화
- 기존 `requestWithFallback`이 로컬 환경에서 `http://localhost:4000/api/...`를 먼저 호출하다가 구버전 서버나 정적 라우터로부터 `HTTP 404`를 반환받던 구조를 제거합니다.
- 모든 API 메서드(`checkHealth`, `register`, `login`, `selectCharacter`, `updateNickname`, `resetCharacters`, `getRooms`, `createRoom`, `verifyRoomPassword`, `joinRoomByCode`)가 **항상 [`src/services/supabaseClient.ts`](file:///c:/project/DeskMate/src/services/supabaseClient.ts)의 Direct Supabase 함수를 직접 호출**하도록 변경합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `src/services/api.ts` Direct Supabase 직접 호출로 수정**
  - [x] `updateNickname`을 포함한 모든 `api` 메서드가 로컬 4000번 서버 경유 없이 `directUpdateNickname` 등 Direct Supabase 함수를 즉시 실행하도록 변경
- [x] **Phase 2: 프로덕션 빌드(`npm run build`) 및 검증**
  - [x] `npm run build` 실행하여 TypeScript 및 번들 에러 0건 확인

---

## 3. 영향 범위 및 고려사항
- Direct Supabase 직접 호출로 일원화하면 로컬(`localhost:5173`)과 Vercel 배포 도메인(`*.vercel.app`)에서 100% 동일한 코드 경로로 동작하므로 환경 차이로 인한 `HTTP 404`나 타임아웃 지연이 완전히 사라집니다.

---

## 4. 검증 및 테스트 계획
1. **닉네임 수정 동작 확인**: 방 목록에서 `[닉네임 변경]` 후 저장 시 `HTTP 404` 없이 즉시 Supabase DB 및 화면에 반영되는지 확인
2. **닉네임 중복 방지 확인**: 이미 사용 중인 닉네임 입력 시 `"이미 사용 중인 닉네임입니다."` 메시지가 정상 표시되는지 확인
3. **프로덕션 빌드 검증**: `npm run build` 에러 0건 확인
