# 상세 기획 및 구현 계획서 (Plan): Vercel 배포 에러 해결 및 클라우드 배포 최적화

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/vercel-deployment-fix/intent.md)를 바탕으로 Vercel 배포 시 발생하는 `dev:electron` 종료 에러(`Command "npm run dev" exited with 1`)를 해결하기 위한 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 `vercel.json` 배포 구성 파일 추가
- 프로젝트 루트에 `vercel.json`을 생성하여 Vercel 클라우드 빌더가 `npm run dev`를 잘못 호출하지 않고 정적 웹 빌드(`npm run build`)와 `/api/*` 서버리스 라우팅을 수행하도록 명시합니다:
  ```json
  {
    "version": 2,
    "framework": "vite",
    "buildCommand": "npm run build",
    "outputDirectory": "dist",
    "devCommand": "vite --port $PORT",
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/index.js" },
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```

### 1.2 안전한 Electron 실행 가드 스크립트 (`scripts/start-electron-safe.cjs`)
- 사용자가 Vercel 대시보드 설정에서 Build Command를 기본값이나 `npm run dev`로 두었거나, 로컬에서 Electron 바이너리가 아직 없는 상태에서도 절대 `exit code 1` 에러를 발생시키지 않도록 `scripts/start-electron-safe.cjs`를 구현합니다.
- **동작 로직**:
  1. `process.env.VERCEL`, `process.env.CI` 환경변수가 존재하면:
     - `[DeskMate] Vercel/CI 클라우드 환경이 감지되어 Electron 데스크톱 실행을 건너뜁니다.` 로그 출력 후 `process.exit(0)`으로 정상 종료합니다.
  2. `node_modules/electron/path.txt` 및 실제 바이너리 파일이 존재하는지 먼저 확인하여, 없으면 자동으로 `node_modules/electron/install.js`를 시도하거나 에러 없이 안내 후 종료(`exit(0)`)합니다.
  3. 로컬 데스크톱 환경이고 바이너리가 정상이면 `wait-on tcp:5173 tcp:4000` 후 `electron .`을 정상 실행합니다.
- 또한 `package.json`의 `"dev"` 스크립트에서 `concurrently`의 `-k` (`--kill-others`, 하나만 종료되어도 전체를 죽이는 옵션) 대신 `--kill-others-on-fail`만 사용하도록 변경하여, 클라우드 환경에서 Electron 가드가 `exit(0)`으로 끝나더라도 서버나 빌드가 강제 종료(`SIGTERM`)되지 않도록 개선합니다.

### 1.3 Vercel 서버리스 API 호환 엔트리 (`api/index.js`) 및 `server/index.js` 모듈화
- Vercel에 배포된 웹 페이지에서도 회원가입, 로그인, 5종 캐릭터 선택, 방 목록 조회/생성(`REST API: /api/*`)이 404 에러 없이 바로 동작하도록:
  - `server/index.js`에서 Express `app` 객체를 `module.exports = app`으로 내보내고, 직접 실행(`require.main === module`)일 때만 `server.listen(4000)`을 호출하도록 개선합니다.
  - 루트에 `api/index.js`를 생성하여 Vercel Serverless Function이 Express `app`을 그대로 처리하도록 연결합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: Electron 안전 실행 가드 및 `package.json` 스크립트 개선**
  - [x] `scripts/start-electron-safe.cjs` 작성 (Vercel/CI 감지 및 Electron 바이너리 존재 여부 사전 검증)
  - [x] `package.json`의 `dev:electron` 및 `dev` 스크립트 업데이트 (`-k` 제거 및 안전 가드 연결)
- [x] **Phase 2: Vercel 배포 설정 (`vercel.json`) 및 서버리스 API (`api/index.js`) 구성**
  - [x] `server/index.js` 하단에 `if (require.main === module)` 조건부 `server.listen` 및 `module.exports = app` 적용
  - [x] `api/index.js` 생성 및 `vercel.json` 작성
- [x] **Phase 3: Vercel 환경 시뮬레이션 및 빌드 검증**
  - [x] `VERCEL=1` 환경에서 `node scripts/start-electron-safe.cjs` 실행 시 에러 없이 종료 코드 `0` 반환 확인
  - [x] `npm run build` (`tsc -b && vite build`) 정상 빌드 확인

---

## 3. 영향 범위 및 고려사항
- **로컬 Windows 개발 환경 호환성**: 로컬 PC에서 `npm run dev` 실행 시 기존과 100% 동일하게 백엔드 서버(4000) + Vite(5173) + Electron 멀티 윈도우가 실행됩니다.
- **Vercel 클라우드 배포 호환성**: Vercel이 `npm run build`를 실행하든 `dev:electron`이 호출되든 `Electron failed to install correctly` 에러가 절대 발생하지 않습니다.

---

## 4. 검증 및 테스트 계획
1. **클라우드 가드 테스트**: `VERCEL=1` 상태에서 `npm run dev:electron` 실행 시 에러 없이 코드 `0`으로 통과하는지 확인
2. **프로덕션 빌드 테스트**: `npm run build` 실행 시 `dist/` 번들 생성 성공 확인
