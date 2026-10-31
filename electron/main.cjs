const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let localBridgeServer = null;

let isQuitting = false;
let isRoomActive = false;
let currentRoomData = null;
let isOverlayHiddenByUser = false;
let isDndMode = false;
let selectedDisplayId = null;

const VITE_DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';
const BRIDGE_PORT = 45678;
const APP_ROOT = path.resolve(__dirname, '..');

// Windows 커스텀 URL 프로토콜(deskmate://) 등록
// 반드시 APP_ROOT(프로젝트 절대 경로)를 두 번째 인자로 명시해야 브라우저에서 [열기] 클릭 시 창이 닫히지 않고 실행됩니다!
if (process.defaultApp) {
  app.setAsDefaultProtocolClient('deskmate', process.execPath, [APP_ROOT]);
} else {
  app.setAsDefaultProtocolClient('deskmate');
}

/**
 * 개발 서버(5173)가 실행 중인지 또는 dist/index.html이 있는지 판별하여 URL 반환
 */
function getRouteUrl(hashRoute) {
  const distIndex = path.join(__dirname, '../dist/index.html');
  if (app.isPackaged && fs.existsSync(distIndex)) {
    return `file://${distIndex}#/${hashRoute}`;
  }
  if (process.env.USE_DIST_FILE === '1' && fs.existsSync(distIndex)) {
    return `file://${distIndex}#/${hashRoute}`;
  }
  return `${VITE_DEV_URL}/#/${hashRoute}`;
}

/**
 * DeskMate 전용 캐릭터 아이콘(.ico / .png) 로드
 */
function getAppIconPath() {
  const icoPath = path.join(__dirname, 'tray-icon.ico');
  const pngPath = path.join(__dirname, 'tray-icon.png');
  if (fs.existsSync(icoPath)) {
    return icoPath;
  }
  return pngPath;
}

function createTrayIcon() {
  const iconPath = getAppIconPath();
  let icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    const pngPath = path.join(__dirname, 'tray-icon.png');
    icon = nativeImage.createFromPath(pngPath);
  }

  return icon.resize({ width: 16, height: 16 });
}

function getDisplaysList() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, index) => ({
    id: d.id,
    label: `${d.label || `모니터 ${index + 1}`} (${d.workArea.width}x${
      d.workArea.height
    })${d.id === primaryId ? ' [주 모니터]' : ''}`,
    bounds: d.bounds,
    workArea: d.workArea,
    isPrimary: d.id === primaryId,
  }));
}

function applyOverlayDisplayBounds(displayId) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  const allDisplays = screen.getAllDisplays();
  const targetDisplay =
    allDisplays.find((d) => d.id === Number(displayId)) ||
    screen.getPrimaryDisplay();

  selectedDisplayId = targetDisplay.id;
  const { x, y, width, height } = targetDisplay.workArea;
  overlayWindow.setBounds({ x, y, width, height });
}

function broadcastAppSettings() {
  const payload = {
    isOverlayHidden: isOverlayHiddenByUser,
    isDndMode,
    selectedDisplayId:
      selectedDisplayId || screen.getPrimaryDisplay().id,
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('APP_SETTINGS_UPDATED', payload);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('APP_SETTINGS_UPDATED', payload);
  }
  updateTrayMenu();
}

/**
 * Windows 포커스 잠금(ForegroundLockTimeout)을 우회하여 컨트롤 창을 화면 최상단 앞으로 확실히 표시
 */
function bringMainWindowToFront() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.setAlwaysOnTop(true);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 350);
  }
}

/**
 * 방 입장 시 Windows 바탕화면 오버레이 창을 확실하게 깨우고 캐릭터 데이터 전달
 */
function activateDesktopOverlay(roomData, syncMainWindow = false) {
  if (!roomData || !roomData.roomId || !roomData.userId) return;

  isRoomActive = true;
  currentRoomData = roomData;
  isOverlayHiddenByUser = false;

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    applyOverlayDisplayBounds(selectedDisplayId);
    overlayWindow.showInactive();
    overlayWindow.show();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.moveTop();
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    const sendOverlayInit = () => {
      if (overlayWindow && !overlayWindow.isDestroyed() && currentRoomData) {
        overlayWindow.showInactive();
        overlayWindow.show();
        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        overlayWindow.moveTop();
        overlayWindow.webContents.send('INIT_OVERLAY', currentRoomData);
      }
    };

    if (overlayWindow.webContents.isLoading()) {
      overlayWindow.webContents.once('did-finish-load', sendOverlayInit);
    } else {
      sendOverlayInit();
    }

    // React 마운트 타이밍 경합을 100% 방지하기 위해 다중 재전송
    setTimeout(sendOverlayInit, 250);
    setTimeout(sendOverlayInit, 800);
  }

  // 웹 브라우저나 딥링크에서 방 입장 시 Electron 메인 컨트롤 창도 동일 세션으로 즉시 동기화
  if (syncMainWindow && mainWindow && !mainWindow.isDestroyed()) {
    const sendMainSync = () => {
      if (mainWindow && !mainWindow.isDestroyed() && currentRoomData) {
        mainWindow.webContents.send('SYNC_ROOM_SESSION', currentRoomData);
      }
    };
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', sendMainSync);
    } else {
      sendMainSync();
    }
    setTimeout(sendMainSync, 300);
  }

  broadcastAppSettings();
}

function deactivateDesktopOverlay() {
  isRoomActive = false;
  currentRoomData = null;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('CLEAR_OVERLAY');
    overlayWindow.setFocusable(false);
    overlayWindow.hide();
  }
  broadcastAppSettings();
}

function toggleOverlayVisibility() {
  isOverlayHiddenByUser = !isOverlayHiddenByUser;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (isRoomActive && !isOverlayHiddenByUser) {
      overlayWindow.show();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.moveTop();
      if (currentRoomData) {
        overlayWindow.webContents.send('INIT_OVERLAY', currentRoomData);
      }
    } else {
      overlayWindow.hide();
    }
  }
  broadcastAppSettings();
}

function toggleDndMode() {
  isDndMode = !isDndMode;
  broadcastAppSettings();
}

function openQuickChatOnOverlay() {
  if (!isRoomActive || !overlayWindow || overlayWindow.isDestroyed()) return;

  if (isOverlayHiddenByUser) {
    isOverlayHiddenByUser = false;
  }

  overlayWindow.show();
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.moveTop();
  overlayWindow.setFocusable(true);
  overlayWindow.focus();
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.webContents.send('OPEN_QUICK_CHAT');
  broadcastAppSettings();
}

/**
 * Vercel 웹 브라우저(https://*.vercel.app)에서 방에 입장했을 때
 * 로컬 Windows Electron 바탕화면 오버레이를 즉시 깨워주는 로컬 HTTP 브릿지 서버 (127.0.0.1:45678)
 */
function startLocalDesktopBridgeServer() {
  try {
    localBridgeServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedReqUrl = new URL(req.url || '/', `http://127.0.0.1:${BRIDGE_PORT}`);

      if (parsedReqUrl.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            desktopOverlayReady: true,
            isRoomActive,
            currentRoomData,
          })
        );
        return;
      }

      if (
        parsedReqUrl.pathname === '/open' &&
        (req.method === 'POST' || req.method === 'GET')
      ) {
        bringMainWindowToFront();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, opened: true }));
        return;
      }

      // 1) GET /enter-room?roomId=...&userId=... (CORS 프리플라이트 없이 즉시 호출 가능)
      if (parsedReqUrl.pathname === '/enter-room' && req.method === 'GET') {
        const roomData = {
          roomId: parsedReqUrl.searchParams.get('roomId') || 'plaza',
          roomName: parsedReqUrl.searchParams.get('roomName') || '광장',
          userId: parsedReqUrl.searchParams.get('userId') || 'guest',
          nickname: parsedReqUrl.searchParams.get('nickname') || '게스트',
          characterType: parsedReqUrl.searchParams.get('characterType') || 'cat',
          statusBadge: parsedReqUrl.searchParams.get('statusBadge') || 'online',
        };
        activateDesktopOverlay(roomData, true);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // 2) POST /enter-room
      if (parsedReqUrl.pathname === '/enter-room' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const roomData = JSON.parse(body);
            activateDesktopOverlay(roomData, true);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, message: e.message }));
          }
        });
        return;
      }

      if (
        parsedReqUrl.pathname === '/leave-room' &&
        (req.method === 'POST' || req.method === 'GET')
      ) {
        deactivateDesktopOverlay();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    localBridgeServer.on('error', () => {
      // 이미 다른 인스턴스가 포트를 사용 중이면 무시
    });

    localBridgeServer.listen(BRIDGE_PORT, '127.0.0.1', () => {
      console.log(
        `[DeskMate Desktop Bridge] 로컬 바탕화면 오버레이 브릿지 실행 중 (http://127.0.0.1:${BRIDGE_PORT})`
      );
    });
  } catch (e) {
    console.warn('[Bridge Server 경고]', e.message);
  }
}

/**
 * deskmate://enter-room?roomId=...&userId=...&nickname=...&characterType=... 딥링크 파서
 */
function handleDeepLinkUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const targetAction = `${parsed.hostname}${parsed.pathname}`;

    if (targetAction.includes('enter-room')) {
      const roomData = {
        roomId: parsed.searchParams.get('roomId') || 'plaza',
        roomName: parsed.searchParams.get('roomName') || '광장',
        userId: parsed.searchParams.get('userId') || 'guest',
        nickname: parsed.searchParams.get('nickname') || '게스트',
        characterType: parsed.searchParams.get('characterType') || 'cat',
        statusBadge: parsed.searchParams.get('statusBadge') || 'online',
      };
      activateDesktopOverlay(roomData, true);
      return;
    }

    bringMainWindowToFront();
  } catch {
    bringMainWindowToFront();
  }
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('DeskMate - 바탕화면 멀티플레이어 캐릭터 채팅');

  tray.on('click', () => {
    bringMainWindowToFront();
  });

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'DeskMate 컨트롤 창 열기',
      click: () => {
        bringMainWindowToFront();
      },
    },
    {
      label: isOverlayHiddenByUser
        ? '바탕화면 오버레이 다시 보이기 (Alt+H)'
        : '바탕화면 오버레이 잠시 숨기기 (Alt+H)',
      click: () => toggleOverlayVisibility(),
    },
    {
      label: isDndMode
        ? '🌙 방해 금지 모드 해제 (현재 켜짐)'
        : '🌙 방해 금지 모드 켜기 (말풍선/소리 차단)',
      click: () => toggleDndMode(),
    },
    {
      label: '💬 바탕화면 빠른 채팅 열기 (Alt+Enter)',
      enabled: isRoomActive,
      click: () => openQuickChatOnOverlay(),
    },
    { type: 'separator' },
    {
      label: 'DeskMate 완전 종료',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function loadWindowWithDistFallback(win, hashRoute) {
  const distIndex = path.join(__dirname, '../dist/index.html');
  // 브라우저(deskmate://)나 단독 실행으로 켜졌을 때 꺼져 있는 localhost:5173을 기다리지 않고 즉시 dist/index.html 로드!
  if (fs.existsSync(distIndex) && process.env.VITE_DEV_MODE !== '1') {
    win.loadFile(distIndex, { hash: `/${hashRoute}` });
    return;
  }

  const targetUrl = `${VITE_DEV_URL}/#/${hashRoute}`;
  win.loadURL(targetUrl).catch(() => {
    if (fs.existsSync(distIndex)) {
      win.loadFile(distIndex, { hash: `/${hashRoute}` });
    }
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 740,
    resizable: true,
    minWidth: 420,
    minHeight: 650,
    title: 'DeskMate - 컨트롤러',
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  loadWindowWithDistFallback(mainWindow, 'main');

  mainWindow.once('ready-to-show', () => {
    bringMainWindowToFront();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  selectedDisplayId = primaryDisplay.id;
  const { x, y, width, height } = primaryDisplay.workArea;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    transparent: true, // 배경 투명
    frame: false, // 창 테두리 및 타이틀바 제거
    alwaysOnTop: true, // 항상 최상단 유지
    skipTaskbar: true, // 작업표시줄에 아이콘 표시 안 함
    hasShadow: false,
    resizable: false,
    focusable: false, // 평소에는 바탕화면 작업 포커스 방해 방지
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  loadWindowWithDistFallback(overlayWindow, 'overlay');

  overlayWindow.webContents.on('did-finish-load', () => {
    if (isRoomActive && currentRoomData && !isOverlayHiddenByUser) {
      overlayWindow.showInactive();
      overlayWindow.show();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.moveTop();
      overlayWindow.webContents.send('INIT_OVERLAY', currentRoomData);
    }
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// 단일 인스턴스 잠금 및 두 번째 실행 시 딥링크 처리
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const deepLinkArg = commandLine.find((arg) => arg.startsWith('deskmate://'));
    if (deepLinkArg) {
      handleDeepLinkUrl(deepLinkArg);
    } else {
      bringMainWindowToFront();
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  createTray();
  startLocalDesktopBridgeServer();

  // 초기 실행 인자에 deskmate:// 딥링크가 있는 경우 처리
  const initDeepLink = process.argv.find((arg) => arg.startsWith('deskmate://'));
  if (initDeepLink) {
    handleDeepLinkUrl(initDeepLink);
  }

  // 글로벌 단축키 등록
  globalShortcut.register('Alt+Enter', () => {
    openQuickChatOnOverlay();
  });

  globalShortcut.register('Alt+H', () => {
    toggleOverlayVisibility();
  });

  screen.on('display-added', () => broadcastAppSettings());
  screen.on('display-removed', () => broadcastAppSettings());
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (localBridgeServer) {
    localBridgeServer.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// =========================================================
// IPC 핸들러
// =========================================================

// 1. 방 입장 시 오버레이 창 활성화 및 유저/방 정보 전달
ipcMain.on('ENTER_ROOM', (_event, roomData) => {
  activateDesktopOverlay(roomData);
});

// 2. 방 퇴장 시 오버레이 창 숨김
ipcMain.on('LEAVE_ROOM', () => {
  deactivateDesktopOverlay();
});

// 3. OverlayWindow가 마운트될 때 현재 방 정보를 능동적으로 가져오는 핸들러 (타이밍 누락 100% 방지)
ipcMain.handle('GET_CURRENT_ROOM', () => {
  return isRoomActive ? currentRoomData : null;
});

// 4. MainWindow <-> OverlayWindow 간 실시간 이벤트 직접 중계
ipcMain.on('RELAY_ROOM_EVENT', (event, payload) => {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender !== mainWindow.webContents
  ) {
    mainWindow.webContents.send('ROOM_EVENT_RELAYED', payload);
  }
  if (
    overlayWindow &&
    !overlayWindow.isDestroyed() &&
    event.sender !== overlayWindow.webContents
  ) {
    overlayWindow.webContents.send('ROOM_EVENT_RELAYED', payload);
  }
});

// 5. 캐릭터 위에 마우스가 올라갔을 때만 클릭/드래그 허용
ipcMain.on('SET_IGNORE_MOUSE', (_event, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  }
});

// 6. 바탕화면 Quick Chat 키보드 입력 포커스 전환
ipcMain.on('SET_OVERLAY_FOCUSABLE', (_event, focusable) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  if (focusable) {
    overlayWindow.setFocusable(true);
    overlayWindow.focus();
    overlayWindow.setIgnoreMouseEvents(false);
  } else {
    overlayWindow.setFocusable(false);
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  }
});

// 7. 오버레이 숨김/보이기 및 방해 금지 모드 토글
ipcMain.on('TOGGLE_OVERLAY_VISIBILITY', () => {
  toggleOverlayVisibility();
});

ipcMain.on('TOGGLE_DND_MODE', () => {
  toggleDndMode();
});

ipcMain.on('TRIGGER_QUICK_CHAT', () => {
  openQuickChatOnOverlay();
});

// 8. 다중 모니터 목록 조회 및 모니터 이동
ipcMain.handle('GET_DISPLAYS', () => {
  return {
    displays: getDisplaysList(),
    selectedDisplayId:
      selectedDisplayId || screen.getPrimaryDisplay().id,
    isOverlayHidden: isOverlayHiddenByUser,
    isDndMode,
  };
});

ipcMain.on('MOVE_OVERLAY_DISPLAY', (_event, displayId) => {
  applyOverlayDisplayBounds(displayId);
  broadcastAppSettings();
});
