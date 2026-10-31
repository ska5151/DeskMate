const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const VALID_CHARACTER_TYPES = ['cat', 'dog', 'panda', 'tiger', 'pig'];

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseKey) &&
  !supabaseUrl.includes('your-project-id.supabase.co');

const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// 인메모리 폴백 저장소 (Supabase 테이블 생성 전에도 100% 정상 동작 보장)
const fallbackUsers = new Map();
const fallbackRooms = new Map();
const fallbackMessages = new Map(); // key: roomId, value: Array<ChatMessage>
let tableMissingWarned = false;

function isTableMissingError(error) {
  if (!error || !error.message) return false;
  return (
    error.message.includes('Could not find the table') ||
    error.message.includes('does not exist')
  );
}

function warnTableMissingOnce(tableName = 'public.users / rooms / messages') {
  if (!tableMissingWarned) {
    tableMissingWarned = true;
    console.warn(
      `[DeskMate 안내] Supabase에 아직 테이블(${tableName})이 생성되지 않아 임시 메모리 저장소를 함께 사용합니다. server/schema.sql을 Supabase SQL Editor에서 실행하면 모든 데이터가 클라우드 DB에 영구 저장됩니다.`
    );
  }
}

function normalizeCharacterType(characterType) {
  if (!characterType || !VALID_CHARACTER_TYPES.includes(characterType)) {
    return null;
  }
  return characterType;
}

// =========================================================
// 1. 사용자 (users) 관련 DB 함수
// =========================================================

async function findUserById(id) {
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('id, password_hash, nickname, character_type, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (isTableMissingError(error)) {
        warnTableMissingOnce('public.users');
        const local = fallbackUsers.get(id) || null;
        if (local) {
          local.character_type = normalizeCharacterType(local.character_type);
        }
        return local;
      }
      throw new Error(`Supabase 조회 오류: ${error.message}`);
    }
    if (data) {
      data.character_type = normalizeCharacterType(data.character_type);
    }
    return data;
  }

  const local = fallbackUsers.get(id) || null;
  if (local) {
    local.character_type = normalizeCharacterType(local.character_type);
  }
  return local;
}

async function createUser({ id, passwordHash, nickname }) {
  const newUser = {
    id,
    password_hash: passwordHash,
    nickname,
    character_type: null,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          id: newUser.id,
          password_hash: newUser.password_hash,
          nickname: newUser.nickname,
          character_type: null,
        },
      ])
      .select('id, nickname, character_type, created_at')
      .single();

    if (error) {
      if (isTableMissingError(error)) {
        warnTableMissingOnce('public.users');
        fallbackUsers.set(id, newUser);
        return {
          id: newUser.id,
          nickname: newUser.nickname,
          character_type: null,
          created_at: newUser.created_at,
        };
      }
      throw new Error(`Supabase 사용자 생성 오류: ${error.message}`);
    }
    return data;
  }

  fallbackUsers.set(id, newUser);
  return {
    id: newUser.id,
    nickname: newUser.nickname,
    character_type: null,
    created_at: newUser.created_at,
  };
}

async function updateUserCharacter(id, characterType) {
  const normalized = normalizeCharacterType(characterType);

  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .update({ character_type: normalized })
      .eq('id', id)
      .select('id, nickname, character_type')
      .single();

    if (error) {
      if (isTableMissingError(error)) {
        warnTableMissingOnce('public.users');
        const existing = fallbackUsers.get(id);
        if (!existing) {
          throw new Error('사용자를 찾을 수 없습니다.');
        }
        existing.character_type = normalized;
        fallbackUsers.set(id, existing);
        return {
          id: existing.id,
          nickname: existing.nickname,
          character_type: existing.character_type,
        };
      }
      throw new Error(`Supabase 캐릭터 업데이트 오류: ${error.message}`);
    }
    return data;
  }

  const existing = fallbackUsers.get(id);
  if (!existing) {
    throw new Error('사용자를 찾을 수 없습니다.');
  }
  existing.character_type = normalized;
  fallbackUsers.set(id, existing);

  return {
    id: existing.id,
    nickname: existing.nickname,
    character_type: existing.character_type,
  };
}

/**
 * 전체(또는 특정) 사용자의 캐릭터 선택을 NULL로 초기화
 */
async function resetAllUsersCharacters(targetUserId = null) {
  if (targetUserId) {
    const existing = fallbackUsers.get(targetUserId);
    if (existing) {
      existing.character_type = null;
      fallbackUsers.set(targetUserId, existing);
    }
  } else {
    for (const [uid, u] of fallbackUsers.entries()) {
      u.character_type = null;
      fallbackUsers.set(uid, u);
    }
  }

  if (supabase) {
    let query = supabase.from('users').update({ character_type: null });
    if (targetUserId) {
      query = query.eq('id', targetUserId);
    } else {
      query = query.not('id', 'is', null);
    }
    const { error } = await query;
    if (error && !isTableMissingError(error)) {
      console.warn('[resetAllUsersCharacters 경고]', error.message);
    }
  }
}

// =========================================================
// 2. 방 (rooms) 및 채팅 기록 (messages) 관련 DB 함수
// =========================================================

async function fetchPersistedRooms() {
  if (supabase) {
    const { data, error } = await supabase
      .from('rooms')
      .select('room_id, room_name, is_private, password_hash, invite_code, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      if (isTableMissingError(error)) {
        warnTableMissingOnce('public.rooms');
        return Array.from(fallbackRooms.values());
      }
      console.warn('[fetchPersistedRooms 오류]', error.message);
      return Array.from(fallbackRooms.values());
    }
    return data || [];
  }
  return Array.from(fallbackRooms.values());
}

async function savePersistedRoom(roomRecord) {
  const row = {
    room_id: roomRecord.roomId,
    room_name: roomRecord.roomName,
    is_private: Boolean(roomRecord.isPrivate),
    password_hash: roomRecord.passwordHash || null,
    invite_code: roomRecord.inviteCode,
    created_at: new Date().toISOString(),
  };

  fallbackRooms.set(row.room_id, row);

  if (supabase) {
    const { error } = await supabase.from('rooms').upsert([row], {
      onConflict: 'room_id',
    });
    if (error && !isTableMissingError(error)) {
      console.warn('[savePersistedRoom 오류]', error.message);
    }
  }
  return row;
}

async function saveRoomMessage(msgRecord) {
  const roomMsgs = fallbackMessages.get(msgRecord.roomId) || [];
  roomMsgs.push(msgRecord);
  if (roomMsgs.length > 100) {
    roomMsgs.shift();
  }
  fallbackMessages.set(msgRecord.roomId, roomMsgs);

  if (supabase) {
    const { error } = await supabase.from('messages').insert([
      {
        id: msgRecord.id,
        room_id: msgRecord.roomId,
        user_id: msgRecord.userId,
        nickname: msgRecord.nickname,
        message: msgRecord.message,
        message_type: msgRecord.messageType || 'chat',
        game_result: msgRecord.gameResult || null,
        created_at: new Date().toISOString(),
      },
    ]);
    if (error && !isTableMissingError(error)) {
      console.warn('[saveRoomMessage 오류]', error.message);
    }
  }
}

async function fetchRoomMessages(roomId, limit = 50) {
  if (supabase) {
    const { data, error } = await supabase
      .from('messages')
      .select(
        'id, room_id, user_id, nickname, message, message_type, game_result, created_at'
      )
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && data) {
      return data.reverse().map((row) => ({
        id: row.id,
        roomId: row.room_id,
        userId: row.user_id,
        nickname: row.nickname,
        message: row.message,
        messageType: row.message_type || 'chat',
        gameResult: row.game_result || undefined,
        timestamp: new Date(row.created_at).toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      }));
    }
  }

  const localList = fallbackMessages.get(roomId) || [];
  return localList.slice(-limit);
}

module.exports = {
  VALID_CHARACTER_TYPES,
  supabase,
  isSupabaseConfigured,
  findUserById,
  createUser,
  updateUserCharacter,
  resetAllUsersCharacters,
  fetchPersistedRooms,
  savePersistedRoom,
  saveRoomMessage,
  fetchRoomMessages,
};
