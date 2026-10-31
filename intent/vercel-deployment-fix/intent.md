# 작업 의도 정의서 (Intent): Vercel 배포 시 Electron 실행 에러 해결 및 클라우드 배포 최적화

## 1. 작업 목적 (Why)
Vercel 클라우드 배포 과정에서 데스크톱 GUI 전용 프로세스인 `electron`(`dev:electron`)이 실행되면서 발생하는 **`Electron failed to install correctly` 및 `Command "npm run dev" exited with 1` 빌드 실패 에러를 근본적으로 해결**하고, Vercel 웹 환경과 로컬 Windows Electron 데스크톱 환경 양쪽에서 모두 완벽히 동작하도록 구성합니다.

---

## 2. 배경 및 원인 분석 (Background & Root Cause)

1. **원인 1: 클라우드 빌드 서버(Vercel)에서 데스크톱 `electron .` 실행 시도**
   - 현재 `package.json`의 `"dev"` 스크립트가 `concurrently -k "npm:dev:server" "npm:dev:vite" "npm:dev:electron"`으로 설정되어 있습니다.
   - Vercel 빌드/프리뷰 환경이 `npm run dev`를 호출할 때, 모니터(GUI)가 없는 리눅스 컨테이너에서 데스크톱 창을 띄우는 `dev:electron`까지 실행하려고 시도합니다.
2. **원인 2: Vercel의 `npm` 스크립트 제한으로 인한 Electron 바이너리 미설치**
   - Vercel의 Node.js v26 빌드 컨테이너는 `electron` 패키지의 `postinstall` 대용량 바이너리 다운로드를 차단하므로 `node_modules/electron/index.js`에서 `Electron failed to install correctly` 예외를 던지며 즉시 종료(`exit code 1`)되고, `concurrently -k` 옵션 때문에 다른 프로세스까지 모두 강제 종료(`SIGTERM`)되었습니다.
3. **원인 3: `vercel.json` 배포 설정 부재**
   - 프로젝트 루트에 `vercel.json`이 없어 Vercel이 프레임워크 빌드 명령어(`buildCommand`), 출력 폴더(`outputDirectory`: `dist`), 개발 명령어(`devCommand`)를 올바르게 분리하지 못했습니다.

---

## 3. 해결 방향 및 기대 효과 (Expected Outcomes & Goals)
- **`vercel.json` 명시적 구성**: Vercel이 빌드 시 데스크톱 Electron을 실행하지 않고 순수 프론트엔드 번들(`npm run build` → `dist`)만 깔끔하게 빌드 및 서빙하도록 설정합니다.
- **스마트 실행 스크립트 분리 (`package.json` & `scripts/run-electron-safe.cjs`)**:
  - Vercel/CI 환경(`process.env.VERCEL` 또는 `CI`)이거나 Electron 바이너리가 없는 환경에서는 `dev:electron`이 에러(exit code 1)로 죽지 않고 안전하게 스킵되도록 가드 스크립트를 적용합니다.
  - 로컬 Windows PC에서는 기존처럼 Electron 멀티 윈도우가 그대로 실행됩니다.
- **Vercel 배포 100% 성공 달성**: Vercel에서 빌드 에러 없이 즉시 배포가 완료됩니다.
