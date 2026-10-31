# 작업 의도 정의서 (Intent): 시스템 트레이 및 앱 아이콘 생성·설정

## 1. 작업 목적 (Why)
Windows 작업표시줄 시스템 트레이(System Tray)와 앱 창 타이틀바에 표시될 **전용 DeskMate 캐릭터 아이콘 파일(`tray-icon.ico`, `tray-icon.png`)을 직접 생성하여 설정**함으로써, 트레이에서 아이콘이 비어 보이는 문제를 해결하고 시각적 완성도를 높입니다.

---

## 2. 배경 및 필요성 (Background & Needs)
1. **기존 트레이 아이콘이 비어 보이는 원인**:
   - 현재 [electron/main.cjs](file:///c:/project/DeskMate/electron/main.cjs)의 `createTrayIcon()` 함수에서 임시로 사용한 Base64 PNG 데이터가 투명 픽셀 위주의 최소 더미 데이터로 되어 있어, Windows 시스템 트레이 영역에서 아이콘이 투명하게(비어 있는 것처럼) 표시됩니다.
2. **Windows 트레이 호환성을 위한 실제 아이콘 에셋 필요**:
   - Windows 환경의 Electron `Tray`와 `BrowserWindow`는 명확한 픽셀 그래픽이 그려진 실제 `.ico` / `.png` 파일(32x32 및 16x16 해상도 대응)을 경로로 지정할 때 가장 선명하고 안정적으로 렌더링됩니다.

---

## 3. 기대 효과 및 해결 목표 (Expected Outcomes & Goals)
- **선명하고 귀여운 트레이 아이콘 표시**: DeskMate의 마스코트(귀여운 치즈 고양이/말풍선 테마)가 그려진 `electron/tray-icon.png` 및 `electron/tray-icon.ico` 파일을 생성하여 작업표시줄 트레이에서 한눈에 식별할 수 있게 합니다.
- **메인 컨트롤 창 아이콘 동시 적용**: 시스템 트레이뿐만 아니라 메인 컨트롤 창(`MainWindow`) 및 작업표시줄 아이콘에도 동일한 아이콘을 적용하여 일관된 브랜드 이미지를 제공합니다.
