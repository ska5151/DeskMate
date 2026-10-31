# 작업 의도 정의서 (Intent): 닉네임 수정 시 '요청 실패 (HTTP 404)' 오류 해결

## 1. 작업 목적
방 목록 화면에서 닉네임 수정 시 발생하는 **`요청 실패 (HTTP 404)` 오류를 즉시 해결**하여, 로컬(`localhost`) 및 배포(Vercel) 모든 환경에서 닉네임 변경과 중복 검사가 100% 정상 동작하도록 수정합니다.

---

## 2. 배경 및 필요성 (원인 분석)
- 현재 [`src/services/api.ts`](file:///c:/project/DeskMate/src/services/api.ts)의 `requestWithFallback` 함수는 로컬 환경(`localhost`)일 때 먼저 `http://localhost:4000/api/user/nickname`으로 요청을 보냅니다.
- 이때 이전에 켜져 있던 구버전 로컬 서버(또는 정적 서버)가 응답하면 신규 엔드포인트(`/api/user/nickname`)를 찾지 못해 `HTTP 404`를 반환하며, 기존 `catch` 블록이 네트워크 단절(`Failed to fetch`)만 폴백 처리하고 `HTTP 404` 응답은 그대로 에러로 던져서 `요청 실패 (HTTP 404)`가 발생했습니다.
- DeskMate는 모든 인증·캐릭터·닉네임·방 데이터를 Direct Supabase 클라이언트([`src/services/supabaseClient.ts`](file:///c:/project/DeskMate/src/services/supabaseClient.ts))로 직접 처리할 수 있으므로, `api.ts`가 로컬 4000번 서버를 거치지 않고 **항상 Direct Supabase 함수를 직접 호출**하도록 일원화하면 `HTTP 404` 오류가 원천적으로 제거됩니다.

---

## 3. 기대 효과 / 해결 목표
1. **`HTTP 404` 오류 100% 해결**:
   - 로컬 개발 환경(`localhost`)과 Vercel 배포 환경 모두에서 4000번 서버 상태와 무관하게 Direct Supabase(`directUpdateNickname` 등)로 즉시 처리되어 `HTTP 404` 에러가 발생하지 않습니다.
2. **빠른 응답 속도 및 일관된 중복 검증**:
   - 불필요한 로컬 서버 경유 및 타임아웃 대기 없이 즉시 Supabase DB에서 닉네임 중복 검사 및 업데이트가 완료됩니다.
