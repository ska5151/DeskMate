import { CharacterType, RoomSummary, User } from '../types';
import {
  directCreateRoom,
  directGetRooms,
  directJoinRoomByCode,
  directLogin,
  directRegister,
  directResetCharacters,
  directSelectCharacter,
  directUpdateNickname,
  directVerifyRoomPassword,
  isSupabaseReady,
} from './supabaseClient';

/**
 * 로컬/배포(Vercel) 모든 환경에서 HTTP 404나 로컬 서버 의존성 없이
 * Direct Supabase 클라이언트로 즉시 일관되게 처리합니다.
 */
export const api = {
  checkHealth: async (): Promise<{ ok: boolean; dbMode: string }> => ({
    ok: true,
    dbMode: isSupabaseReady ? 'supabase' : 'in-memory-fallback',
  }),

  register: (payload: {
    id: string;
    password: string;
    nickname: string;
  }): Promise<{ user: User; dbMode: string }> => directRegister(payload),

  login: (payload: {
    id: string;
    password: string;
  }): Promise<{ user: User; dbMode: string }> => directLogin(payload),

  selectCharacter: (payload: {
    userId: string;
    characterType: CharacterType;
  }): Promise<{ user: User }> => directSelectCharacter(payload),

  updateNickname: (payload: {
    userId: string;
    nickname: string;
  }): Promise<{ user: User }> => directUpdateNickname(payload),

  resetCharacters: (
    userId?: string
  ): Promise<{ ok: boolean; message: string }> => directResetCharacters(userId),

  getRooms: (): Promise<{ rooms: RoomSummary[] }> => directGetRooms(),

  createRoom: (
    roomName: string,
    password?: string
  ): Promise<{ room: RoomSummary }> => directCreateRoom(roomName, password),

  verifyRoomPassword: (
    roomId: string,
    password?: string
  ): Promise<{ room: RoomSummary }> => directVerifyRoomPassword(roomId, password),

  joinRoomByCode: (inviteCode: string): Promise<{ room: RoomSummary }> =>
    directJoinRoomByCode(inviteCode),
};
