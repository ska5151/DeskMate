import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { CharacterType, ChatMessage, RoomSummary, User } from '../types';

export const VALID_CHARACTER_TYPES: CharacterType[] = [
  'cat',
  'dog',
  'panda',
  'tiger',
  'pig',
];

const envAny = import.meta.env as Record<string, string | undefined>;

const SUPABASE_URL =
  envAny.VITE_SUPABASE_URL ||
  envAny.SUPABASE_URL ||
  'https://lspsajftivujnzfxizob.supabase.co';

const SUPABASE_ANON_KEY =
  envAny.VITE_SUPABASE_ANON_KEY ||
  envAny.SUPABASE_ANON_KEY ||
  'sb_publishable_YpRHfXgF99GK842PYI0tVQ_WMG8yElp';

export const isSupabaseReady =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) &&
  !SUPABASE_URL.includes('your-project-id.supabase.co');

export const supabaseClient: SupabaseClient | null = isSupabaseReady
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: {
        params: {
          eventsPerSecond: 15,
        },
      },
    })
  : null;

// =========================================================
// 브라우저 localStorage 폴백 (Supabase에 아직 테이블이 생성되기 전에도 에러 없이 작동)
// =========================================================
const LS_USERS_KEY = 'deskmate_cloud_users_v2';
const LS_ROOMS_KEY = 'deskmate_cloud_rooms_v2';
const LS_MSGS_KEY = 'deskmate_cloud_msgs_v2';

interface StoredUserRow {
  id: string;
  password_hash: string;
  nickname: string;
  character_type: CharacterType | null;
  created_at: string;
}

interface StoredRoomRow {
  room_id: string;
  room_name: string;
  is_private: boolean;
  password_hash: string | null;
  invite_code: string;
  created_at: string;
}

function readLocalUsers(): Record<string, StoredUserRow> {
  try {
    const raw = localStorage.getItem(LS_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalUsers(map: Record<string, StoredUserRow>) {
  try {
    localStorage.setItem(LS_USERS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readLocalRooms(): Record<string, StoredRoomRow> {
  const defaultPlaza: StoredRoomRow = {
    room_id: 'plaza',
    room_name: '광장 (기본 방)',
    is_private: false,
    password_hash: null,
    invite_code: 'PLAZA1',
    created_at: new Date().toISOString(),
  };
  try {
    const raw = localStorage.getItem(LS_ROOMS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed.plaza) {
      parsed.plaza = defaultPlaza;
    }
    return parsed;
  } catch {
    return { plaza: defaultPlaza };
  }
}

function writeLocalRooms(map: Record<string, StoredRoomRow>) {
  try {
    localStorage.setItem(LS_ROOMS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function normalizeChar(c: any): CharacterType | null {
  return VALID_CHARACTER_TYPES.includes(c) ? (c as CharacterType) : null;
}

function isTableMissing(err: any): boolean {
  const msg = String(err?.message || '');
  return (
    msg.includes('Could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('Failed to fetch')
  );
}

// =========================================================
// Direct Supabase DB Operations (인증 / 캐릭터 / 방 / 메시지)
// =========================================================

export async function directRegister(payload: {
  id: string;
  password: string;
  nickname: string;
}): Promise<{ user: User; dbMode: string }> {
  const cleanId = payload.id.trim();
  const cleanNick = payload.nickname.trim();
  const passwordHash = await bcrypt.hash(payload.password, 10);

  if (supabaseClient) {
    const { data: existing, error: selErr } = await supabaseClient
      .from('users')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle();

    if (!selErr) {
      if (existing) {
        throw new Error('이미 사용 중인 아이디입니다.');
      }
      const { data: created, error: insErr } = await supabaseClient
        .from('users')
        .insert([
          {
            id: cleanId,
            password_hash: passwordHash,
            nickname: cleanNick,
            character_type: null,
          },
        ])
        .select('id, nickname, character_type')
        .single();

      if (!insErr && created) {
        return {
          user: {
            userId: created.id,
            nickname: created.nickname,
            characterType: normalizeChar(created.character_type),
          },
          dbMode: 'supabase',
        };
      }
      if (insErr && !isTableMissing(insErr)) {
        throw new Error(insErr.message);
      }
    } else if (!isTableMissing(selErr)) {
      throw new Error(selErr.message);
    }
  }

  // Supabase에 아직 테이블이 생성되기 전일 경우 브라우저 스토리지 연동
  const localUsers = readLocalUsers();
  if (localUsers[cleanId]) {
    throw new Error('이미 사용 중인 아이디입니다.');
  }
  localUsers[cleanId] = {
    id: cleanId,
    password_hash: passwordHash,
    nickname: cleanNick,
    character_type: null,
    created_at: new Date().toISOString(),
  };
  writeLocalUsers(localUsers);

  return {
    user: {
      userId: cleanId,
      nickname: cleanNick,
      characterType: null,
    },
    dbMode: 'supabase',
  };
}

export async function directLogin(payload: {
  id: string;
  password: string;
}): Promise<{ user: User; dbMode: string }> {
  const cleanId = payload.id.trim();

  if (supabaseClient) {
    const { data: userRow, error } = await supabaseClient
      .from('users')
      .select('id, password_hash, nickname, character_type')
      .eq('id', cleanId)
      .maybeSingle();

    if (!error && userRow) {
      const ok = await bcrypt.compare(payload.password, userRow.password_hash);
      if (!ok) {
        throw new Error('존재하지 않는 아이디이거나 비밀번호가 틀렸습니다.');
      }
      return {
        user: {
          userId: userRow.id,
          nickname: userRow.nickname,
          characterType: normalizeChar(userRow.character_type),
        },
        dbMode: 'supabase',
      };
    }
    if (!error && !userRow) {
      throw new Error('존재하지 않는 아이디이거나 비밀번호가 틀렸습니다.');
    }
    if (error && !isTableMissing(error)) {
      throw new Error(error.message);
    }
  }

  const localUsers = readLocalUsers();
  const localUser = localUsers[cleanId];
  if (!localUser) {
    throw new Error('존재하지 않는 아이디이거나 비밀번호가 틀렸습니다.');
  }
  const ok = await bcrypt.compare(payload.password, localUser.password_hash);
  if (!ok) {
    throw new Error('존재하지 않는 아이디이거나 비밀번호가 틀렸습니다.');
  }

  return {
    user: {
      userId: localUser.id,
      nickname: localUser.nickname,
      characterType: normalizeChar(localUser.character_type),
    },
    dbMode: 'supabase',
  };
}

export async function directSelectCharacter(payload: {
  userId: string;
  characterType: CharacterType;
}): Promise<{ user: User }> {
  const { userId, characterType } = payload;

  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .update({ character_type: characterType })
      .eq('id', userId)
      .select('id, nickname, character_type')
      .single();

    if (!error && data) {
      return {
        user: {
          userId: data.id,
          nickname: data.nickname,
          characterType: normalizeChar(data.character_type),
        },
      };
    }
  }

  const localUsers = readLocalUsers();
  const target = localUsers[userId];
  if (target) {
    target.character_type = characterType;
    writeLocalUsers(localUsers);
    return {
      user: {
        userId: target.id,
        nickname: target.nickname,
        characterType,
      },
    };
  }

  return {
    user: {
      userId,
      nickname: userId,
      characterType,
    },
  };
}

export async function directResetCharacters(
  userId?: string
): Promise<{ ok: boolean; message: string }> {
  if (supabaseClient) {
    let q = supabaseClient.from('users').update({ character_type: null });
    q = userId ? q.eq('id', userId) : q.not('id', 'is', null);
    await q;
  }

  const localUsers = readLocalUsers();
  if (userId && localUsers[userId]) {
    localUsers[userId].character_type = null;
  } else {
    Object.values(localUsers).forEach((u) => {
      u.character_type = null;
    });
  }
  writeLocalUsers(localUsers);

  return { ok: true, message: '캐릭터 선택 정보가 초기화되었습니다.' };
}

export async function directGetRooms(): Promise<{ rooms: RoomSummary[] }> {
  const localRooms = readLocalRooms();

  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('room_id, room_name, is_private, invite_code, created_at')
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      return {
        rooms: data.map((r) => ({
          roomId: r.room_id,
          roomName: r.room_name,
          userCount: 1,
          isPrivate: Boolean(r.is_private),
          inviteCode: r.invite_code,
        })),
      };
    }
  }

  return {
    rooms: Object.values(localRooms).map((r) => ({
      roomId: r.room_id,
      roomName: r.room_name,
      userCount: 1,
      isPrivate: Boolean(r.is_private),
      inviteCode: r.invite_code,
    })),
  };
}

export async function directCreateRoom(
  roomName: string,
  password?: string
): Promise<{ room: RoomSummary }> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let inviteCode = '';
  for (let i = 0; i < 6; i++) {
    inviteCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const roomId = `room_${Date.now()}`;
  const isPrivate = Boolean(password && password.trim());
  const passwordHash = isPrivate
    ? await bcrypt.hash(password!.trim(), 10)
    : null;

  const newRow: StoredRoomRow = {
    room_id: roomId,
    room_name: roomName.trim(),
    is_private: isPrivate,
    password_hash: passwordHash,
    invite_code: inviteCode,
    created_at: new Date().toISOString(),
  };

  const localRooms = readLocalRooms();
  localRooms[roomId] = newRow;
  writeLocalRooms(localRooms);

  if (supabaseClient) {
    await supabaseClient.from('rooms').upsert([newRow], {
      onConflict: 'room_id',
    });
  }

  return {
    room: {
      roomId,
      roomName: newRow.room_name,
      userCount: 1,
      isPrivate,
      inviteCode,
    },
  };
}

export async function directVerifyRoomPassword(
  roomId: string,
  password?: string
): Promise<{ room: RoomSummary }> {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('room_id, room_name, is_private, password_hash, invite_code')
      .eq('room_id', roomId)
      .maybeSingle();

    if (!error && data) {
      if (data.is_private && data.password_hash) {
        const ok = await bcrypt.compare(password || '', data.password_hash);
        if (!ok) throw new Error('방 비밀번호가 일치하지 않습니다.');
      }
      return {
        room: {
          roomId: data.room_id,
          roomName: data.room_name,
          userCount: 1,
          isPrivate: Boolean(data.is_private),
          inviteCode: data.invite_code,
        },
      };
    }
  }

  const localRooms = readLocalRooms();
  const room = localRooms[roomId];
  if (!room) throw new Error('존재하지 않는 방입니다.');
  if (room.is_private && room.password_hash) {
    const ok = await bcrypt.compare(password || '', room.password_hash);
    if (!ok) throw new Error('방 비밀번호가 일치하지 않습니다.');
  }

  return {
    room: {
      roomId: room.room_id,
      roomName: room.room_name,
      userCount: 1,
      isPrivate: room.is_private,
      inviteCode: room.invite_code,
    },
  };
}

export async function directJoinRoomByCode(
  inviteCode: string
): Promise<{ room: RoomSummary }> {
  const code = inviteCode.trim().toUpperCase();

  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('rooms')
      .select('room_id, room_name, is_private, invite_code')
      .eq('invite_code', code)
      .maybeSingle();

    if (!error && data) {
      return {
        room: {
          roomId: data.room_id,
          roomName: data.room_name,
          userCount: 1,
          isPrivate: Boolean(data.is_private),
          inviteCode: data.invite_code,
        },
      };
    }
  }

  const localRooms = readLocalRooms();
  const found = Object.values(localRooms).find(
    (r) => r.invite_code.toUpperCase() === code
  );
  if (!found) {
    throw new Error('해당 초대 코드와 일치하는 방을 찾을 수 없습니다.');
  }

  return {
    room: {
      roomId: found.room_id,
      roomName: found.room_name,
      userCount: 1,
      isPrivate: found.is_private,
      inviteCode: found.invite_code,
    },
  };
}

export async function directSaveMessage(msg: ChatMessage & { roomId: string }) {
  try {
    const raw = localStorage.getItem(LS_MSGS_KEY);
    const map: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
    const list = map[msg.roomId] || [];
    list.push(msg);
    if (list.length > 50) list.shift();
    map[msg.roomId] = list;
    localStorage.setItem(LS_MSGS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }

  if (supabaseClient) {
    await supabaseClient.from('messages').insert([
      {
        id: msg.id,
        room_id: msg.roomId,
        user_id: msg.userId,
        nickname: msg.nickname,
        message: msg.message,
        message_type: msg.messageType || 'chat',
        game_result: msg.gameResult || null,
        created_at: new Date().toISOString(),
      },
    ]);
  }
}

export async function directFetchMessages(
  roomId: string
): Promise<ChatMessage[]> {
  if (supabaseClient) {
    const { data, error } = await supabaseClient
      .from('messages')
      .select(
        'id, room_id, user_id, nickname, message, message_type, game_result, created_at'
      )
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      return data.reverse().map((row) => ({
        id: row.id,
        roomId: row.room_id,
        userId: row.user_id,
        nickname: row.nickname,
        message: row.message,
        messageType: (row.message_type as any) || 'chat',
        gameResult: row.game_result || undefined,
        timestamp: new Date(row.created_at).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      }));
    }
  }

  try {
    const raw = localStorage.getItem(LS_MSGS_KEY);
    const map: Record<string, ChatMessage[]> = raw ? JSON.parse(raw) : {};
    return map[roomId] || [];
  } catch {
    return [];
  }
}
