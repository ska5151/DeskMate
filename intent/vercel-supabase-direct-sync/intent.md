# 작업 의도 정의서 (Intent): Vercel 환경 Supabase 직접 연동 및 실시간 멀티플레이어 동기화

## 1. 작업 목적 (Why)
Vercel로 배포된 환경에서 **"서버 대기 중"**으로 표시되며 Supabase에 접속되지 않는 문제를 근본적으로 해결하여, 별도의 로컬 Node.js 서버(`localhost:4000`)가 없는 **Vercel 클라우드 환경에서도 Supabase DB(회원가입/로그인/캐릭터 선택/방·채팅 기록)와 실시간 캐릭터·말풍선 동기화가 100% 정상 작동**하도록 개선합니다.

---

## 2. 배경 및 원인 분석 (Background & Root Cause)

1. **원인 1: `.env`의 `VITE_SERVER_URL=http://localhost:4000` 고정 참조**
   - `.env`에 설정된 `VITE_SERVER_URL=http://localhost:4000` 값이 프론트엔드 빌드 시 그대로 주입되어, Vercel(`https://*.vercel.app`)에 접속한 브라우저가 클라우드가 아닌 `http://localhost:4000/api/health`를 호출하다가 연결에 실패하여 `"서버 대기 중"`으로 표시되었습니다.
2. **원인 2: Vite 프론트엔드에 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 환경변수 미주입**
   - `.env`에는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`로 선언되어 있으나, Vite는 기본적으로 `VITE_` 접두사가 없는 변수를 클라이언트에 전달하지 않아 프론트엔드가 Supabase 접속 정보를 알 수 없었습니다.
3. **원인 3: Vercel Serverless 환경에서의 Socket.io 한계와 Supabase Realtime의 필요성**
   - Vercel은 Serverless 환경이므로 상주형 Socket.io 서버(4000번 포트)를 유지할 수 없습니다.
   - 따라서 Vercel 배포 환경에서는 백엔드 서버를 거치지 않고도 **프론트엔드에서 직접 `@supabase/supabase-js`로 DB 및 Supabase Realtime(Broadcast & Presence) 채널에 연결**해야 서버 대기 없이 즉시 동작합니다.

---

## 3. 기대 효과 및 해결 목표 (Expected Outcomes & Goals)
- **Vercel 접속 즉시 `"Supabase DB"` 연결 완료**: `localhost:4000` 의존성을 제거하고, 프론트엔드와 Vercel API 양쪽에서 Supabase에 즉시 연결되어 `"서버 대기 중"` 문제가 완전히 사라집니다.
- **Supabase Realtime 기반 실시간 멀티플레이 지원**: 로컬 Socket.io 서버가 없는 Vercel 배포 환경에서도 Supabase Realtime 채널을 통해 방 입장, 캐릭터 이동, 이모트, 포모도로, 말풍선 채팅이 실시간으로 동기화됩니다.
- **웹 내장 오버레이 뷰어 제공**: Electron이 없는 일반 웹 브라우저(Vercel URL)에서 방에 입장했을 때도, 화면 내에 바탕화면 캐릭터들이 즉시 나타나 돌아다니고 대화할 수 있도록 지원합니다.
