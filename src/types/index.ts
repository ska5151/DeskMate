export type CharacterType = 'cat' | 'dog' | 'panda' | 'tiger' | 'pig';

export type EmoteType = 'wave' | 'jump' | 'dance' | 'heart' | 'sleep';

export type InteractionType = 'pet' | 'poke' | 'highfive';

export type StatusBadgeType =
  | 'online'
  | 'coding'
  | 'resting'
  | 'meeting'
  | 'focus';

export interface User {
  userId: string;
  nickname: string;
  characterType: CharacterType | null;
}

export interface RoomSummary {
  roomId: string;
  roomName: string;
  userCount: number;
  isPrivate?: boolean;
  inviteCode?: string;
}

export interface RoomOverlayInitData {
  roomId: string;
  roomName: string;
  userId: string;
  nickname: string;
  characterType: CharacterType;
  statusBadge?: StatusBadgeType;
}

export interface CharacterState {
  socketId?: string;
  userId: string;
  nickname: string;
  characterType: CharacterType;
  x: number; // 화면 가로 비율 (0.0 ~ 100.0)
  y: number; // 화면 세로 비율 (0.0 ~ 100.0)
  direction: 'left' | 'right';
  state: 'idle' | 'walk';
  statusBadge?: StatusBadgeType;
  activeEmote?: EmoteType | null;
}

export interface GameResultMeta {
  gameType: 'dice' | 'rps';
  value: number | string;
  badge: string;
}

export interface ChatMessage {
  id: string;
  roomId?: string;
  userId: string;
  nickname: string;
  message: string;
  messageType?: 'chat' | 'system' | 'game';
  gameResult?: GameResultMeta;
  timestamp: string;
}

export interface PomodoroState {
  mode: 'focus' | 'break';
  remainingSeconds: number;
  isRunning: boolean;
  updatedBy: string | null;
}

export interface CharacterEmoteEvent {
  userId: string;
  nickname: string;
  emoteType: EmoteType;
}

export interface CharacterInteractionEvent {
  fromUserId: string;
  fromNickname: string;
  toUserId: string;
  toNickname: string;
  actionType: InteractionType;
  badge: string;
}

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

export interface AppSettingsState {
  isOverlayHidden: boolean;
  isDndMode: boolean;
  selectedDisplayId: number;
}
