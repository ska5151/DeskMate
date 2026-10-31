import {
  AppSettingsState,
  DisplayInfo,
  RoomOverlayInitData,
} from './index';

export interface DisplaysResponse extends AppSettingsState {
  displays: DisplayInfo[];
}

export interface ElectronAPI {
  enterRoom: (roomData: RoomOverlayInitData) => void;
  leaveRoom: () => void;
  getCurrentRoom: () => Promise<RoomOverlayInitData | null>;
  relayRoomEvent: (payload: { event: string; payload: any }) => void;
  setIgnoreMouse: (ignore: boolean) => void;
  setOverlayFocusable: (focusable: boolean) => void;
  toggleOverlayVisibility: () => void;
  toggleDndMode: () => void;
  triggerQuickChat: () => void;
  getDisplays: () => Promise<DisplaysResponse>;
  moveOverlayDisplay: (displayId: number) => void;

  onInitOverlay: (callback: (data: RoomOverlayInitData) => void) => () => void;
  onSyncRoomSession: (
    callback: (data: RoomOverlayInitData) => void
  ) => () => void;
  onClearOverlay: (callback: () => void) => () => void;
  onRoomEventRelayed: (
    callback: (data: { event: string; payload: any }) => void
  ) => () => void;
  onOpenQuickChat: (callback: () => void) => () => void;
  onAppSettingsUpdated: (
    callback: (settings: AppSettingsState) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
