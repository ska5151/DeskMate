# 상세 기획 및 구현 계획서 (Plan): 시스템 트레이 및 앱 아이콘 생성·설정

본 문서는 [intent.md](file:///c:/project/DeskMate/intent/tray-icon-setup/intent.md)를 바탕으로 Windows 시스템 트레이 아이콘이 비어 보이는 문제를 해결하기 위한 상세 구현 계획입니다.

---

## 1. 세부 기획 및 기능 요구사항 명세

### 1.1 아이콘 디자인 및 파일 생성 (`electron/tray-icon.png`, `electron/tray-icon.ico`)
- **아이콘 그래픽 디자인**:
  - 어두운 작업표시줄과 밝은 작업표시줄 모두에서 선명하게 보이도록 **진한 인디고/바이올렛 원형 배지 배경(`#4F46E5`) + 귀여운 치즈 고양이 얼굴(`#FBBF24` 귀/얼굴, 눈, 분홍 볼터치)** 픽셀/벡터 그래픽으로 구성합니다.
- **포맷 및 해상도**:
  - `electron/tray-icon.png`: 32x32(고해상도 DPI 대응) 유효 PNG 이미지 파일
  - `electron/tray-icon.ico`: Windows 네이티브 트레이 및 실행 파일 호환을 위한 표준 ICO 포맷(내부 32x32 PNG 엔트리 포함) 파일
  - `public/favicon.png`: 웹/렌더러 타이틀 아이콘용 동시 배치

### 1.2 Electron 메인 프로세스 적용 (`electron/main.cjs`)
- **`createTrayIcon()` 개선**:
  - 기존 빈 Base64 문자열 방식을 제거하고, `path.join(__dirname, 'tray-icon.ico')`(및 폴백으로 `tray-icon.png`)를 `nativeImage.createFromPath()`로 로드하여 생성합니다.
  - 만약의 경우에도 절대 비어 보이지 않도록 `nativeImage.createFromBitmap()` 기반의 선명한 픽셀 버퍼 폴백까지 이중으로 보장합니다.
- **`MainWindow` 창 아이콘 적용**:
  - `new BrowserWindow({ ..., icon: path.join(__dirname, 'tray-icon.ico') })` 옵션을 추가하여 메인 컨트롤 창의 타이틀바와 작업표시줄 아이콘에도 동일하게 표시되도록 설정합니다.

---

## 2. 단계별 구현 계획 (구현 체크리스트)

- [x] **Phase 1: 아이콘 생성 스크립트 실행 및 에셋 파일 생성**
  - [x] Node.js 픽셀/PNG/ICO 바이너리 생성을 통해 `electron/tray-icon.png`, `electron/tray-icon.ico`, `public/favicon.png` 파일 생성
- [x] **Phase 2: Electron 메인 프로세스(`electron/main.cjs`) 및 `index.html` 아이콘 연결**
  - [x] `electron/main.cjs`의 `createTrayIcon()`에서 `tray-icon.ico` / `tray-icon.png` 로드 및 `BrowserWindow`의 `icon` 속성 적용
  - [x] `package.json`의 `build.win.icon`에 `electron/tray-icon.ico` 설정 추가
- [x] **Phase 3: 아이콘 유효성 및 Electron 로드 검증**
  - [x] 생성된 `.ico`, `.png` 파일의 바이트 크기 및 Electron `nativeImage.isEmpty()`가 `false`이고 크기가 `32x32`인지 검증

---

## 3. 영향 범위 및 고려사항
- **Windows DPI 스케일링 대응**: 32x32 해상도로 아이콘을 생성하면 Windows 기본(100%) 및 고배율(125%, 150%, 200%) 작업표시줄 트레이 모두에서 깨지지 않고 또렷하게 표시됩니다.
- **패키징 호환성**: `electron/` 폴더 내에 아이콘을 위치시켜 개발 모드(`npm run dev`)와 빌드 후 실행 모드 모두에서 동일한 상대 경로(`path.join(__dirname, 'tray-icon.ico')`)로 참조할 수 있습니다.

---

## 4. 검증 및 테스트 계획
1. **파일 생성 확인**: `electron/tray-icon.ico` 및 `electron/tray-icon.png` 파일 존재 및 유효 헤더 검증
2. **`nativeImage` 검증**: Electron/Node 환경에서 아이콘 로드 시 빈 이미지(`isEmpty() === false`)가 아닌지 확인 및 `npm run build` 정상 통과 확인
