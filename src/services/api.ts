import { CharacterType, RoomSummary, User } from '../types';
import {
  directCreateRoom,
  directGetRooms,
  directJoinRoomByCode,
  directLogin,
  directRegister,
  directResetCharacters,
  directSelectCharacter,
  directVerifyRoomPassword,
  isSupabaseReady,
} from './supabaseClient';

/**
 * 로컬 개발 환경(localhost / 127.0.0.1 / Electron file://)인지 판별합니다.
 * Vercel 등 외부 웹 도메인에서는 .env의 VITE_SERVER_URL=http://localhost:4000을 절대 사용하지 않습니다!
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  const proto = window.location.protocol;
  return host === 'localhost' || host === '127.0.0.1' || proto === 'file:';
}

function resolveServerUrl(): string {
  if (!isLocalEnvironment()) {
    return window.location.origin;
  }
  return import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
}

const SERVER_URL = resolveServerUrl();

async function requestWithFallback<T>(
  path: string,
  options: RequestInit | undefined,
  fallbackFn: () => Promise<T>
): Promise<T> {
  // Vercel 등 원격 웹 환경에서는 로컬 4000번 서버를 기다리지 않고 즉시 Direct Supabase로 처리
  if (!isLocalEnvironment()) {
    return fallbackFn();
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1800);
    const res = await fetch(`${SERVER_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timer);

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `요청 실패 (HTTP ${res.status})`);
    }
    return data as T;
  } catch (err: any) {
    // 네트워크 연결 실패(서버 미실행 등) 시 Direct Supabase 클라이언트로 자동 처리
    if (
      err?.name === 'AbortError' ||
      String(err?.message || '').includes('Failed to fetch') ||
      String(err?.message || '').includes('NetworkError')
    ) {
      return fallbackFn();
    }
    throw err;
  }
}

export const api = {
  getServerUrl: () => SERVER_URL,

  checkHealth: () =>
    requestWithFallback<{ ok: boolean; dbMode: string }>(
      '/api/health',
      undefined,
      async () => ({
        ok: true,
        dbMode: isSupabaseReady ? 'supabase' : 'in-memory-fallback',
      })
    ),

  register: (payload: { id: string; password: string; nickname: string }) =>
    requestWithFallback<{ user: User; dbMode: string }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
      () => directRegister(payload)
    ),

  login: (payload: { id: string; password: string }) =>
    requestWithFallback<{ user: User; dbMode: string }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(payload) },
      () => directLogin(payload)
    ),

  selectCharacter: (payload: {
    userId: string;
    characterType: CharacterType;
  }) =>
    requestWithFallback<{ user: User }>(
      '/api/user/character',
      { method: 'POST', body: JSON.stringify(payload) },
      () => directSelectCharacter(payload)
    ),

  resetCharacters: (userId?: string) =>
    requestWithFallback<{ ok: boolean; message: string }>(
      '/api/user/reset-characters',
      { method: 'POST', body: JSON.stringify({ userId }) },
      () => directResetCharacters(userId)
    ),

  getRooms: () =>
    requestWithFallback<{ rooms: RoomSummary[] }>(
      '/api/rooms',
      undefined,
      () => directGetRooms()
    ),

  createRoom: (roomName: string, password?: string) =>
    requestWithFallback<{ room: RoomSummary }>(
      '/api/rooms',
      { method: 'POST', body: JSON.stringify({ roomName, password }) },
      () => directCreateRoom(roomName, password)
    ),

  verifyRoomPassword: (roomId: string, password?: string) =>
    requestWithFallback<{ room: RoomSummary }>(
      '/api/rooms/verify',
      { method: 'POST', body: JSON.stringify({ roomId, password }) },
      () => directVerifyRoomPassword(roomId, password)
    ),

  joinRoomByCode: (inviteCode: string) =>
    requestWithFallback<{ room: RoomSummary }>(
      '/api/rooms/join-by-code',
      { method: 'POST', body: JSON.stringify({ inviteCode }) },
      () => directJoinRoomByCode(inviteCode)
    ),
};
