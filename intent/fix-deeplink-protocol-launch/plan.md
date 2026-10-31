# 상세 기획 및 구현 계획서 (Plan): Vercel 접속 시 자동 Electron 실행 및 프로토콜 창 닫힘 해결

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/fix-deeplink-protocol-launch/intent.md)를 바탕으로 **Vercel 링크 접속 시 처음부터 자동으로 Electron 앱이 실행**되도록 하고, `"Electron을 여시겠습니까? -> 열기"` 선택 시 **창이 열렸다 닫히는 문제를 해결**하는 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 Windows 레지스트리 `deskmate://` 프로토콜 명령어 정확 등록 (`electron/main.cjs` & 레지스트리 등록)
- **기존 문제**:
  - Windows 레지스트리의 `HKCU\Software\Classes\deskmate\shell\open\command`에 프로젝트 경로(`"c:\project\DeskMate"`) 없이 `"...\electron.exe" "%1"` 형태로 등록되면, 브라우저가 `deskmate://open`을 넘길 때 `electron.exe`가 `"deskmate://open"`을 앱 디렉토리로 잘못 인식하여 창이 열리자마자 종료됩니다.
- **해결 설계**:
  1. `electron/main.cjs` 상단에서 프로젝트 루트 절대 경로(`const APP_ROOT = path.resolve(__dirname, '..');`)를 명시하여 `app.setAsDefaultProtocolClient('deskmate', process.execPath, [APP_ROOT])`로 등록합니다.
  2. 또한 현재 개발자님의 Windows PC 레지스트리(`HKCU\Software\Classes\deskmate\shell\open\command`)에 `"C:\project\DeskMate\node_modules\electron\dist\electron.exe" "C:\project\DeskMate" "%1"` 값을 직접 등록하여, 지금 바로 브라우저에서 `"열기"`를 눌렀을 때도 즉시 정상 작동하도록 보장합니다.

### 1.2 브라우저에서 실행된 Electron 프로세스의 `dist/index.html` 즉시 로드 (`electron/main.cjs`)
- 브라우저의 `deskmate://` 프로토콜로 실행된 Electron은 터미널 환경변수(`USE_DIST_FILE`)가 없으므로:
  - `loadWindowWithDistFallback(win, hashRoute)`에서 `dist/index.html` 파일이 존재하고 개발 모드 강제 플래그(`VITE_DEV_MODE=1`)가 없으면, 꺼져 있는 `localhost:5173`을 기다리지 않고 **처음부터 즉시 `win.loadFile(distIndex, { hash: `/${hashRoute}` })`를 로드**합니다.
  - 이를 통해 `deskmate://`로 실행된 즉시 0.1초 만에 컨트롤 창(`MainWindow`)과 바탕화면 투명 오버레이 창(`OverlayWindow`)이 로드됩니다.

### 1.3 Vercel 링크 접속 시 처음부터 자동으로 Electron 실행 (`src/pages/MainWindow.tsx`, `electron/main.cjs`)
- **웹 브라우저(`!window.electronAPI`) 최초 접속 시 자동 실행 로직**:
  1. 사용자가 Vercel 링크(`https://*.vercel.app`)에 접속하면 `MainWindow` 마운트 즉시:
     - 먼저 로컬 브릿지(`http://127.0.0.1:45678/open`)에 요청을 보내 이미 트레이에 켜져 있는 Electron이 있다면 즉시 메인 창을 화면 앞으로 띄웁니다(`mainWindow.show()`, `mainWindow.focus()`).
     - 동시에(또는 로컬 브릿지 응답이 없을 때) **`window.location.href = 'deskmate://open'`**을 자동 실행하여 브라우저가 즉시 `"Electron을 여시겠습니까?"` 팝업을 띄우고 Electron 데스크톱 앱을 처음부터 실행하도록 합니다.
  2. 상단에도 **`🚀 Electron 앱 다시 열기`** 버튼을 함께 배치하여, 혹시 팝업을 닫았더라도 언제든 클릭 한 번으로 다시 열 수 있게 합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: `electron/main.cjs` 프로토콜 경로 고정 및 `dist/index.html` 기본 로드 적용**
  - [x] `app.setAsDefaultProtocolClient('deskmate', process.execPath, [path.resolve(__dirname, '..')])` 적용
  - [x] `deskmate://open` 및 `http://127.0.0.1:45678/open` 호출 시 `mainWindow.show()` & `mainWindow.focus()` 동작 추가
  - [x] `dist/index.html` 존재 시 즉시 `win.loadFile()`로 로드하도록 개선
- [x] **Phase 2: `src/pages/MainWindow.tsx` 최초 접속 시 자동 `deskmate://open` 트리거 구현**
  - [x] `!window.electronAPI` (웹 브라우저 접속) 시 마운트 즉시 로컬 브릿지 `/open` 및 `deskmate://open` 자동 호출
- [x] **Phase 3: Windows 레지스트리 `deskmate://` 명령어 등록 및 빌드 검증**
  - [x] Windows 레지스트리 `HKCU\Software\Classes\deskmate\shell\open\command`에 정확한 실행 경로 등록
  - [x] `npm run build` 실행 및 `deskmate://open` 실행 시 창이 닫히지 않고 정상 유지되는지 검증

---

## 3. 영향 범위 및 고려사항
- **무한 팝업 방지**: Electron 내부(`window.electronAPI`가 존재하는 환경)에서는 `deskmate://open`을 호출하지 않으며, 오직 일반 웹 브라우저(`!window.electronAPI`)로 접속했을 때만 최초 1회 자동으로 Electron을 실행합니다.

---

## 4. 검증 및 테스트 계획
1. **레지스트리 및 딥링크 실행 검증**: `deskmate://open`으로 Electron 프로세스 기동 시 창이 닫히지 않고 컨트롤 창(`MainWindow`)과 오버레이 창(`OverlayWindow`)이 정상 유지되는지 확인
2. **프론트엔드 빌드 검증**: `npm run build` 에러 0건 확인
