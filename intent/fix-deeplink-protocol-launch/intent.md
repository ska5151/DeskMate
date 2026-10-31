# 작업 의도 정의서 (Intent): Vercel 링크 접속 시 처음부터 자동으로 Electron 실행 및 창 닫힘 문제 해결

## 1. 작업 목적 (Why)
1. **Vercel 링크 접속 시 처음부터 자동으로 Electron 데스크톱 앱 실행**:
   - 사용자가 웹 브라우저로 Vercel 배포 주소(`https://*.vercel.app`)에 접속하는 순간, 별도로 방에 입장할 때까지 기다리지 않고 **처음부터 자동으로 `deskmate://open` 프로토콜(및 로컬 브릿지)을 트리거하여 DeskMate Electron 데스크톱 앱을 즉시 실행**합니다.
2. **`"Electron을 여시겠습니까? -> 열기"` 선택 시 창이 열렸다 닫히는 현상 완벽 해결**:
   - Windows 레지스트리의 `deskmate://` 프로토콜 실행 명령어에 프로젝트 절대 경로(`"c:\project\DeskMate"`)를 정확히 포함시켜, `[열기]` 클릭 시 창이 닫히지 않고 Electron 컨트롤 창과 Windows 바탕화면 오버레이 창이 정상 작동하도록 수정합니다.

---

## 2. 배경 및 원인 분석 (Background & Root Cause)

1. **웹 접속 초기에 Electron 자동 전환 필요**:
   - 바탕화면 투명 오버레이는 Electron 데스크톱 환경에서 가장 완벽하게 동작하므로, 사용자가 Vercel 웹 링크로 들어왔을 때 **페이지 진입 즉시 자동으로 Electron 앱을 깨워 실행**하는 플로우가 가장 직관적입니다.
2. **`"열기"` 클릭 시 창이 닫혔던 기술적 원인**:
   - Windows가 `deskmate://...` 링크로 `electron.exe`를 호출할 때 실행 인자에 프로젝트 루트 경로(`c:\project\DeskMate`)가 누락되면, `electron.exe`가 `deskmate://...` 문자열을 실행할 폴더 경로로 착각하여 즉시 종료(`exit`)됩니다.
   - 또한 브라우저가 실행한 Electron 프로세스는 터미널 환경변수가 없으므로 `localhost:5173` 대신 빌드된 `dist/index.html`을 기본으로 즉시 로드해야 합니다.

---

## 3. 해결 방향 및 기대 효과 (Expected Outcomes & Goals)
- **Vercel 링크 접속 즉시 자동 Electron 실행 (`deskmate://open`)**:
  - 일반 웹 브라우저(`!window.electronAPI`)에서 Vercel 링크가 열리자마자 자동으로 로컬 브릿지(`127.0.0.1:45678/open`) 또는 `window.location.href = 'deskmate://open'`을 실행하여 처음부터 Electron 데스크톱 앱으로 연결합니다.
- **창 닫힘 없는 완벽한 Electron 기동 및 바탕화면 캐릭터 출력**:
  - Windows 레지스트리 및 `electron/main.cjs`의 프로토콜 인자를 `"<electron.exe>" "<프로젝트 루트 경로>" "%1"`로 고정하고 `dist/index.html`을 즉시 로드하여, `[열기]` 선택 시 Electron 컨트롤러 창이 바로 뜨고 방 입장 시 Windows 바탕화면 위에 캐릭터가 정상적으로 돌아다닙니다.
