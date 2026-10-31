import { CharacterType, RoomSummary, User } from '../types';

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `요청 실패 (HTTP ${res.status})`);
  }
  return data as T;
}

export const api = {
  getServerUrl: () => SERVER_URL,

  checkHealth: () =>
    request<{ ok: boolean; dbMode: string }>('/api/health'),

  register: (payload: { id: string; password: string; nickname: string }) =>
    request<{ user: User; dbMode: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { id: string; password: string }) =>
    request<{ user: User; dbMode: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  selectCharacter: (payload: {
    userId: string;
    characterType: CharacterType;
  }) =>
    request<{ user: User }>('/api/user/character', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetCharacters: (userId?: string) =>
    request<{ ok: boolean; message: string }>('/api/user/reset-characters', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  getRooms: () => request<{ rooms: RoomSummary[] }>('/api/rooms'),

  createRoom: (roomName: string, password?: string) =>
    request<{ room: RoomSummary }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ roomName, password }),
    }),

  verifyRoomPassword: (roomId: string, password?: string) =>
    request<{ room: RoomSummary }>('/api/rooms/verify', {
      method: 'POST',
      body: JSON.stringify({ roomId, password }),
    }),

  joinRoomByCode: (inviteCode: string) =>
    request<{ room: RoomSummary }>('/api/rooms/join-by-code', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    }),
};
