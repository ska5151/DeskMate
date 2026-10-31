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

let mainWindow = null;
let overlayWindow = null;
let tray = null;

let isQuitting = false;
let isRoomActive = false;
let isOverlayHiddenByUser = false;
let isDndMode = false;
let selectedDisplayId = null;

const isDev = !app.isPackaged;
const VITE_DEV_URL = process.env.VITE_DEV_URL || 'http://localhost:5173';

function getRouteUrl(hashRoute) {
  if (isDev) {
    return `${VITE_DEV_URL}/#/${hashRoute}`;
  }
  return `file://${path.join(__dirname, '../dist/index.html')}#/${hashRoute}`;
}

/**
 * DeskMate 전용 캐릭터 아이콘(.ico / .png) 로드
 */
function getAppIconPath() {
  const icoPath = path.join(__dirname, 'tray-icon.ico');
  const pngPath = path.join(__dirname, 'tray-icon.png');
  const fs = require('fs');
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

function toggleOverlayVisibility() {
  isOverlayHiddenByUser = !isOverlayHiddenByUser;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (isRoomActive && !isOverlayHiddenByUser) {
      overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
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
  overlayWindow.setFocusable(true);
  overlayWindow.focus();
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.webContents.send('OPEN_QUICK_CHAT');
  broadcastAppSettings();
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('DeskMate - 바탕화면 멀티플레이어 캐릭터 채팅');

  tray.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'DeskMate 컨트롤 창 열기',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
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
    },
  });

  mainWindow.loadURL(getRouteUrl('main'));

  // 닫기(X) 클릭 시 종료 대신 시스템 트레이로 최소화
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
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadURL(getRouteUrl('overlay'));
  overlayWindow.hide();

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
  createTray();

  // 글로벌 단축키 등록
  globalShortcut.register('Alt+Enter', () => {
    openQuickChatOnOverlay();
  });

  globalShortcut.register('Alt+H', () => {
    toggleOverlayVisibility();
  });

  // 디스플레이 추가/제거 감지
  screen.on('display-added', () => broadcastAppSettings());
  screen.on('display-removed', () => broadcastAppSettings());
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
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
  isRoomActive = true;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (!isOverlayHiddenByUser) {
      overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.webContents.send('INIT_OVERLAY', roomData);
  }
  broadcastAppSettings();
});

// 2. 방 퇴장 시 오버레이 창 숨김
ipcMain.on('LEAVE_ROOM', () => {
  isRoomActive = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('CLEAR_OVERLAY');
    overlayWindow.setFocusable(false);
    overlayWindow.hide();
  }
  broadcastAppSettings();
});

// 3. 캐릭터 위에 마우스가 올라갔을 때만 클릭/드래그 허용
ipcMain.on('SET_IGNORE_MOUSE', (_event, ignore) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  }
});

// 4. 바탕화면 Quick Chat 키보드 입력 포커스 전환
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

// 5. 오버레이 숨김/보이기 및 방해 금지 모드 토글
ipcMain.on('TOGGLE_OVERLAY_VISIBILITY', () => {
  toggleOverlayVisibility();
});

ipcMain.on('TOGGLE_DND_MODE', () => {
  toggleDndMode();
});

ipcMain.on('TRIGGER_QUICK_CHAT', () => {
  openQuickChatOnOverlay();
});

// 6. 다중 모니터 목록 조회 및 모니터 이동
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
