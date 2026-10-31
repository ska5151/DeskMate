const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  enterRoom: (roomData) => ipcRenderer.send('ENTER_ROOM', roomData),
  leaveRoom: () => ipcRenderer.send('LEAVE_ROOM'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('SET_IGNORE_MOUSE', ignore),
  setOverlayFocusable: (focusable) =>
    ipcRenderer.send('SET_OVERLAY_FOCUSABLE', focusable),
  toggleOverlayVisibility: () =>
    ipcRenderer.send('TOGGLE_OVERLAY_VISIBILITY'),
  toggleDndMode: () => ipcRenderer.send('TOGGLE_DND_MODE'),
  triggerQuickChat: () => ipcRenderer.send('TRIGGER_QUICK_CHAT'),
  getDisplays: () => ipcRenderer.invoke('GET_DISPLAYS'),
  moveOverlayDisplay: (displayId) =>
    ipcRenderer.send('MOVE_OVERLAY_DISPLAY', displayId),

  onInitOverlay: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('INIT_OVERLAY', listener);
    return () => ipcRenderer.removeListener('INIT_OVERLAY', listener);
  },
  onClearOverlay: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('CLEAR_OVERLAY', listener);
    return () => ipcRenderer.removeListener('CLEAR_OVERLAY', listener);
  },
  onOpenQuickChat: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('OPEN_QUICK_CHAT', listener);
    return () => ipcRenderer.removeListener('OPEN_QUICK_CHAT', listener);
  },
  onAppSettingsUpdated: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('APP_SETTINGS_UPDATED', listener);
    return () => ipcRenderer.removeListener('APP_SETTINGS_UPDATED', listener);
  },
});
