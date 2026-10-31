# 상세 기획 및 구현 계획서 (Plan): Windows 바탕화면 실행 런처 구성 및 Electron 직접 구동

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/windows-desktop-execution-guide/intent.md)를 바탕으로 개발자님의 Windows PC에서 **실제 Windows 바탕화면 위에 투명 오버레이 캐릭터가 즉시 뜨도록** 실행 환경을 구성하는 상세 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 Electron 단독 실행 시 `dist/index.html` 즉시 로드 보장 (`electron/main.cjs`)
- 로컬에서 Vite 개발 서버(`localhost:5173`)를 켜지 않고 Electron만 단독 실행하더라도, 5173 타임아웃을 기다리거나 빈 화면이 뜨지 않도록:
  - `process.env.USE_DIST_FILE === '1'`이거나 5173 포트가 닫혀 있을 때 **`path.join(__dirname, '../dist/index.html')`을 `win.loadFile()`로 즉시 로드**하고 `hash` 라우트(`/main`, `/overlay`)를 전달합니다.
  - 이를 통해 별도의 터미널 서버 없이 Electron 앱 하나만 켜도 **즉시 Supabase 클라우드 DB/Realtime과 연결되어 Windows 바탕화면 위에 캐릭터가 나타납니다.**

### 1.2 Windows 원클릭 실행 파일 (`DeskMate-실행.bat`) 및 `.exe` 빌드 스크립트 구성
- 프로젝트 루트에 **`DeskMate-실행.bat`** 배치 파일을 생성하여, 탐색기에서 더블클릭만 하면 최신 빌드 확인 후 Electron 데스크톱 앱이 즉시 실행되도록 합니다.
- 또한 `package.json`에 `"dist:win": "npm run build && electron-builder --win --dir"` 스크립트를 추가하여 독립 실행형 `.exe` 폴더(`release/win-unpacked/DeskMate.exe`)를 생성할 수 있도록 구성합니다.

### 1.3 개발자님의 Windows PC에 Electron 앱 즉시 실행
- 구현 완료 후 개발자님의 PC에서 Electron 프로세스를 백그라운드로 직접 기동하여, 컨트롤 창에서 로그인 후 방 입장 시 **실제 Windows 바탕화면 하단에 5종 Rive 캐릭터가 걸어 다니는 것**을 즉시 확인하실 수 있게 합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: Electron `file://` 해시 라우트 로딩 안정화 (`electron/main.cjs`)**
  - [x] `USE_DIST_FILE=1` 또는 프로덕션 모드에서 `win.loadFile(distIndex, { hash: `/${hashRoute}` })`를 사용하여 Windows 경로 역슬래시(`\`)나 공백 문제 없이 `/main` 및 `/overlay`가 100% 정확히 로드되도록 개선
- [x] **Phase 2: 원클릭 실행기(`DeskMate-실행.bat`) 및 `package.json` 스크립트 추가**
  - [x] 더블클릭으로 바로 실행 가능한 `DeskMate-실행.bat` 생성
  - [x] `package.json`에 `dist:win` 스크립트 추가 및 `npm run build` 실행
- [x] **Phase 3: 개발자 PC에서 Electron 데스크톱 앱 직접 실행 및 검증**
  - [x] `npm run start:electron`으로 실제 Windows PC 화면에 DeskMate 컨트롤 창 & 바탕화면 오버레이 창 실행

---

## 3. 영향 범위 및 고려사항
- **Windows 파일 경로 호환성**: Windows에서 `file://C:\project\...` 문자열을 `loadURL`에 직접 넣으면 역슬래시(`\`) 인코딩 차이로 해시 라우트(`#/overlay`)가 무시될 수 있으므로, Electron 공식 API인 `win.loadFile(distIndex, { hash: '/overlay' })`를 사용하여 100% 안전하게 로드합니다.

---

## 4. 검증 및 테스트 계획
1. **프로덕션 빌드 검증**: `npm run build` 성공 확인
2. **실제 Windows 데스크톱 창 기동 확인**: Electron 프로세스를 기동하여 컨트롤 창(`MainWindow`)과 투명 오버레이 창(`OverlayWindow`)이 개발자님의 Windows 화면에 정상 표시되는지 확인
