# 작업 의도 정의서 (Intent): Vercel 배포 환경에서 Windows 바탕화면 캐릭터 미표시 근본 원인 해결

## 1. 작업 목적
Vercel 배포 링크(`https://*.vercel.app`)에 접속하여 로그인 및 캐릭터 선택 후 방에 입장했을 때(또는 Electron 앱으로 열었을 때), **Windows 바탕화면(작업표시줄 위 투명 오버레이 창)에 캐릭터가 표시되지 않는 근본 원인을 완벽히 해결**합니다.

---

## 2. 배경 및 필요성 (근본 원인 진단 결과)
현재 PC 프로세스 및 네트워크 브릿지 상태를 정밀 진단한 결과, 다음 **4가지 결정적 원인**이 복합적으로 작용하여 바탕화면에 캐릭터가 표시되지 않고 있었습니다.

1. **백그라운드 데몬 프로세스(`SW_HIDE`)의 단일 인스턴스 잠금(Single-Instance Lock) 및 포트 선점 문제**:
   - 터미널 백그라운드 태스크로 실행된 `electron.exe` 프로세스들이 Windows `STARTUPINFO.wShowWindow = SW_HIDE` (`MainWindowHandle: 0`, 화면 비표시 상태)로 떠 있으면서 `app.requestSingleInstanceLock()`과 `127.0.0.1:45678` 포트를 선점하고 있었습니다.
   - 이로 인해 사용자가 브라우저에서 `"Electron을 여시겠습니까? -> 열기"`(`deskmate://`)를 클릭해도 새로 실행된 정상 Electron 프로세스가 `gotTheLock === false`에 걸려 즉시 종료되었고, 백그라운드의 숨겨진 프로세스는 창 핸들(`MainWindowHandle: 0`)이 없어 바탕화면에 캐릭터를 그리지 못했습니다.
2. **Vercel 웹(`https://`)에서 방 입장(`입장하기`) 시 `deskmate://enter-room` 자동 실행 누락 및 HTTPS → HTTP PNA 차단**:
   - 사용자가 Vercel 웹 페이지에서 로그인·캐릭터 선택 후 **`[입장하기]`** 버튼을 눌렀을 때, `fetch('http://127.0.0.1:45678/enter-room', { method: 'POST', headers: { 'Content-Type': 'application/json' } })`만 호출하고 실패 시(`catch`) 아무 동작도 하지 않았습니다.
   - Chrome/Edge에서 `https://*.vercel.app`이 로컬 `http://127.0.0.1`로 JSON POST 요청을 보낼 때 Private Network Access(PNA) 프리플라이트 차단이나 로컬 앱 미실행이 발생하면 바탕화면 오버레이가 전혀 깨어나지 않았습니다.
3. **`OverlayWindow` 초기 로드 시 IPC 타이밍 경합(`INIT_OVERLAY` 유실) 및 백그라운드 렌더러 스로틀링**:
   - `electron/main.cjs`에서 `overlayWindow` 생성 직후 비동기 `loadFile()`이 완료되기 전에 `overlayWindow.hide()` 및 `INIT_OVERLAY`가 호출되거나, React 컴포넌트가 마운트되기 직전에 `did-finish-load` 이벤트가 먼저 발생하여 방/캐릭터 초기 데이터가 유실되는 타이밍 구간이 존재했습니다.
4. **`deskmate://enter-room`으로 실행 시 컨트롤 창(`MainWindow`)과 오버레이 창(`OverlayWindow`) 간 세션 동기화 부재**:
   - 웹에서 방에 입장하여 Electron이 깨어났을 때, Electron 컨트롤 창(`MainWindow`)은 로그인 화면에 머물러 있어 사용자가 다시 로그인해야 하거나 혼란을 겪는 문제가 있었습니다.

---

## 3. 기대 효과 / 해결 목표
1. **비정상 숨김(`MainWindowHandle: 0`) Electron 프로세스 완전 정리 및 정상 대화형(Interactive) 창 표시 보장**:
   - 단일 인스턴스 잠금을 가로채던 백그라운드 프로세스를 모두 종료하고, 브라우저 `deskmate://` 또는 로컬 실행 시 항상 정상 윈도우 핸들을 가진 창과 오버레이가 표시되도록 합니다.
2. **Vercel 웹에서 `[입장하기]` 클릭 즉시 바탕화면 캐릭터 100% 자동 표시**:
   - 프리플라이트가 없는 `GET /enter-room?roomId=...` 브릿지 호출과 함께, 로컬 브릿지 미응답 시 즉시 자동으로 `deskmate://enter-room?roomId=...&userId=...&nickname=...&characterType=...` 딥링크를 실행하여 어떤 상황에서도 바탕화면에 캐릭터가 즉시 나타나도록 합니다.
3. **`OverlayWindow` 능동 폴링(1초 주기 `getCurrentRoom`) 및 다중 재전송으로 IPC 타이밍 누락 0% 달성**:
   - `OverlayWindow`가 방 정보를 받을 때까지 메인 프로세스의 `GET_CURRENT_ROOM`을 능동적으로 확인하고, `backgroundThrottling: false`를 적용해 투명 오버레이 캔버스가 항상 즉시 렌더링되도록 보장합니다.
4. **Electron 컨트롤 창(`MainWindow`) 세션 자동 동기화**:
   - 웹에서 `enter-room`으로 Electron을 깨우면 `MainWindow`도 재로그인 없이 즉시 해당 캐릭터와 방(`CHAT_ROOM`) 상태로 동기화됩니다.
