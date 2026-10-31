const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const {
  VALID_CHARACTER_TYPES,
  isSupabaseConfigured,
  findUserById,
  findUserByNickname,
  createUser,
  updateUserNickname,
  updateUserCharacter,
  resetAllUsersCharacters,
  fetchPersistedRooms,
  savePersistedRoom,
  saveRoomMessage,
  fetchRoomMessages,
} = require('./supabase');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

/**
 * 6자리 초대 코드 생성기 (예: DM7X9K)
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 기본 포모도로 상태 생성
 */
function createDefaultPomodoro() {
  return {
    mode: 'focus', // 'focus' (25분) | 'break' (5분)
    remainingSeconds: 25 * 60,
    isRunning: false,
    updatedBy: null,
  };
}

/**
 * 메모리 내 실시간 방 저장소
 */
const rooms = {
  plaza: {
    roomId: 'plaza',
    roomName: '광장 (기본 방)',
    isPrivate: false,
    passwordHash: null,
    inviteCode: 'PLAZA1',
    users: {},
    pomodoro: createDefaultPomodoro(),
  },
};

// 서버 기동 시 기존 캐릭터 데이터 초기화 및 Supabase 방 목록 불러오기
(async () => {
  try {
    await resetAllUsersCharacters();
    await savePersistedRoom(rooms.plaza);
    const savedRooms = await fetchPersistedRooms();
    for (const r of savedRooms) {
      if (!rooms[r.room_id]) {
        rooms[r.room_id] = {
          roomId: r.room_id,
          roomName: r.room_name,
          isPrivate: Boolean(r.is_private),
          passwordHash: r.password_hash || null,
          inviteCode: r.invite_code || generateInviteCode(),
          users: {},
          pomodoro: createDefaultPomodoro(),
        };
      }
    }
  } catch (e) {
    console.warn('[초기화 경고]', e.message);
  }
})();

// =========================================================
// 공유 포모도로 타이머 1초 틱 루프
// =========================================================
setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room.pomodoro || !room.pomodoro.isRunning) continue;

    if (room.pomodoro.remainingSeconds > 0) {
      room.pomodoro.remainingSeconds -= 1;
      io.to(roomId).emit('pomodoroUpdate', room.pomodoro);
    } else {
      const nextMode = room.pomodoro.mode === 'focus' ? 'break' : 'focus';
      room.pomodoro.mode = nextMode;
      room.pomodoro.remainingSeconds = nextMode === 'focus' ? 25 * 60 : 5 * 60;
      room.pomodoro.isRunning = false;

      io.to(roomId).emit('pomodoroUpdate', room.pomodoro);

      const sysMsg = {
        id: `${Date.now()}_pomo`,
        roomId,
        userId: 'system',
        nickname: '🍅 포모도로 타이머',
        message:
          nextMode === 'break'
            ? '25분 집중 시간이 끝났습니다! 5분간 커피/스트레칭 휴식을 시작하세요 ☕'
            : '휴식 시간이 끝났습니다! 다시 집중 세션을 시작해 보세요 🔥',
        messageType: 'system',
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };
      io.to(roomId).emit('receiveMessage', sysMsg);
    }
  }
}, 1000);

// =========================================================
// 1. REST API 엔드포인트 (인증 / 캐릭터 선택 & 초기화 / 방 & 비밀방 & 초대코드)
// =========================================================

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    dbMode: isSupabaseConfigured ? 'supabase' : 'in-memory-fallback',
    supportedCharacters: VALID_CHARACTER_TYPES,
  });
});

// 회원가입 API
app.post('/api/auth/register', async (req, res) => {
  try {
    const { id, password, nickname } = req.body;
    if (!id || !password || !nickname) {
      return res
        .status(400)
        .json({ message: '아이디, 비밀번호, 닉네임을 모두 입력해 주세요.' });
    }

    const existing = await findUserById(id.trim());
    if (existing) {
      return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
    }

    const dupNick = await findUserByNickname(nickname.trim());
    if (dupNick) {
      return res.status(409).json({ message: '이미 사용 중인 닉네임입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await createUser({
      id: id.trim(),
      passwordHash,
      nickname: nickname.trim(),
    });

    return res.status(201).json({
      user: {
        userId: created.id,
        nickname: created.nickname,
        characterType: created.character_type,
      },
      dbMode: isSupabaseConfigured ? 'supabase' : 'in-memory-fallback',
    });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    return res
      .status(500)
      .json({ message: err.message || '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// 로그인 API
app.post('/api/auth/login', async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) {
      return res
        .status(400)
        .json({ message: '아이디와 비밀번호를 모두 입력해 주세요.' });
    }

    const user = await findUserById(id.trim());
    if (!user) {
      return res
        .status(401)
        .json({ message: '존재하지 않는 아이디이거나 비밀번호가 틀렸습니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: '존재하지 않는 아이디이거나 비밀번호가 틀렸습니다.' });
    }

    return res.json({
      user: {
        userId: user.id,
        nickname: user.nickname,
        characterType: user.character_type,
      },
      dbMode: isSupabaseConfigured ? 'supabase' : 'in-memory-fallback',
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return res
      .status(500)
      .json({ message: err.message || '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// 캐릭터 선택 및 DB 저장 API (5종: cat, dog, panda, tiger, pig)
app.post('/api/user/character', async (req, res) => {
  try {
    const { userId, characterType } = req.body;
    if (!userId || !VALID_CHARACTER_TYPES.includes(characterType)) {
      return res.status(400).json({
        message: `유효하지 않은 캐릭터입니다. (${VALID_CHARACTER_TYPES.join(
          ', '
        )} 중 선택)`,
      });
    }

    const updated = await updateUserCharacter(userId, characterType);
    return res.json({
      user: {
        userId: updated.id,
        nickname: updated.nickname,
        characterType: updated.character_type,
      },
    });
  } catch (err) {
    console.error('[POST /api/user/character]', err);
    return res
      .status(500)
      .json({ message: err.message || '캐릭터 저장 중 오류가 발생했습니다.' });
  }
});

// 닉네임 변경 API (중복 불가)
app.post('/api/user/nickname', async (req, res) => {
  try {
    const { userId, nickname } = req.body || {};
    if (!userId || !nickname || !String(nickname).trim()) {
      return res.status(400).json({ message: '변경할 닉네임을 입력해 주세요.' });
    }

    const updated = await updateUserNickname(userId, String(nickname).trim());
    return res.json({
      user: {
        userId: updated.id,
        nickname: updated.nickname,
        characterType: updated.character_type,
      },
    });
  } catch (err) {
    console.error('[POST /api/user/nickname]', err);
    const status = err.statusCode || 500;
    return res
      .status(status)
      .json({ message: err.message || '닉네임 변경 중 오류가 발생했습니다.' });
  }
});

// 캐릭터 초기화 API (특정 유저 또는 전체 유저)
app.post('/api/user/reset-characters', async (req, res) => {
  try {
    const { userId } = req.body || {};
    await resetAllUsersCharacters(userId || null);
    return res.json({
      ok: true,
      message: '캐릭터 선택 정보가 초기화되었습니다.',
    });
  } catch (err) {
    console.error('[POST /api/user/reset-characters]', err);
    return res
      .status(500)
      .json({ message: err.message || '캐릭터 초기화 중 오류가 발생했습니다.' });
  }
});

function serializeRoomSummary(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    userCount: Object.keys(room.users).length,
    isPrivate: Boolean(room.isPrivate),
    inviteCode: room.inviteCode,
  };
}

// 실시간 방 목록 조회 API
app.get('/api/rooms', (_req, res) => {
  const roomList = Object.values(rooms).map(serializeRoomSummary);
  res.json({ rooms: roomList });
});

// 새 방 생성 API (비밀방 비밀번호 및 초대코드 지원)
app.post('/api/rooms', async (req, res) => {
  try {
    const { roomName, password } = req.body;
    if (!roomName || !roomName.trim()) {
      return res.status(400).json({ message: '방 이름을 입력해 주세요.' });
    }

    const roomId = `room_${Date.now()}`;
    const isPrivate = Boolean(password && String(password).trim());
    const passwordHash = isPrivate
      ? await bcrypt.hash(String(password).trim(), 10)
      : null;

    let inviteCode = generateInviteCode();
    while (Object.values(rooms).some((r) => r.inviteCode === inviteCode)) {
      inviteCode = generateInviteCode();
    }

    rooms[roomId] = {
      roomId,
      roomName: roomName.trim(),
      isPrivate,
      passwordHash,
      inviteCode,
      users: {},
      pomodoro: createDefaultPomodoro(),
    };

    await savePersistedRoom(rooms[roomId]);

    return res.status(201).json({
      room: serializeRoomSummary(rooms[roomId]),
    });
  } catch (err) {
    console.error('[POST /api/rooms]', err);
    return res
      .status(500)
      .json({ message: err.message || '방 생성 중 오류가 발생했습니다.' });
  }
});

// 방 입장 검증 API (비밀방 비밀번호 확인)
app.post('/api/rooms/verify', async (req, res) => {
  try {
    const { roomId, password } = req.body;
    const room = rooms[roomId];
    if (!room) {
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    if (room.isPrivate && room.passwordHash) {
      if (!password) {
        return res
          .status(401)
          .json({ message: '비밀방입니다. 비밀번호를 입력해 주세요.' });
      }
      const ok = await bcrypt.compare(String(password).trim(), room.passwordHash);
      if (!ok) {
        return res.status(401).json({ message: '방 비밀번호가 일치하지 않습니다.' });
      }
    }

    return res.json({ room: serializeRoomSummary(room) });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || '방 비밀번호 확인 중 오류가 발생했습니다.' });
  }
});

// 초대 코드로 방 찾기 및 입장 API
app.post('/api/rooms/join-by-code', (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode || !String(inviteCode).trim()) {
    return res.status(400).json({ message: '초대 코드를 입력해 주세요.' });
  }

  const normalized = String(inviteCode).trim().toUpperCase();
  const targetRoom = Object.values(rooms).find(
    (r) => r.inviteCode.toUpperCase() === normalized
  );

  if (!targetRoom) {
    return res
      .status(404)
      .json({ message: '해당 초대 코드와 일치하는 방을 찾을 수 없습니다.' });
  }

  return res.json({ room: serializeRoomSummary(targetRoom) });
});

// =========================================================
// 미니게임 명령어 파서 (/주사위, /가위바위보)
// =========================================================
function parseMiniGameCommand(rawText) {
  const trimmed = String(rawText).trim();

  if (trimmed === '/주사위' || trimmed.toLowerCase() === '/dice') {
    const roll = Math.floor(Math.random() * 6) + 1;
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return {
      isGame: true,
      message: `🎲 주사위를 굴려 [${roll}] ${diceEmojis[roll - 1]} 이(가) 나왔습니다!`,
      gameResult: {
        gameType: 'dice',
        value: roll,
        badge: `🎲 ${roll}`,
      },
    };
  }

  const rpsChoices = [
    { key: '가위', emoji: '✌️' },
    { key: '바위', emoji: '✊' },
    { key: '보', emoji: '🖐️' },
  ];

  if (
    trimmed === '/가위바위보' ||
    trimmed.toLowerCase() === '/rps' ||
    trimmed === '/가위' ||
    trimmed === '/바위' ||
    trimmed === '/보'
  ) {
    let picked = rpsChoices[Math.floor(Math.random() * rpsChoices.length)];
    if (trimmed === '/가위') picked = rpsChoices[0];
    if (trimmed === '/바위') picked = rpsChoices[1];
    if (trimmed === '/보') picked = rpsChoices[2];

    return {
      isGame: true,
      message: `${picked.emoji} 가위바위보! [${picked.key}]를 냈습니다!`,
      gameResult: {
        gameType: 'rps',
        value: picked.key,
        badge: `${picked.emoji} ${picked.key}!`,
      },
    };
  }

  return { isGame: false };
}

// =========================================================
// 2. Socket.io 실시간 방 입장 / 캐릭터 이동 / 이모트 / 상호작용 / 코워킹 / 채팅
// =========================================================

io.on('connection', (socket) => {
  console.log('클라이언트 접속:', socket.id);

  socket.on(
    'joinRoom',
    async ({
      roomId,
      roomName,
      userId,
      nickname,
      characterType,
      statusBadge,
      clientType,
    }) => {
      if (!roomId || !userId) return;

      socket.join(roomId);

      if (!rooms[roomId]) {
        rooms[roomId] = {
          roomId,
          roomName: roomName || roomId,
          isPrivate: false,
          passwordHash: null,
          inviteCode: generateInviteCode(),
          users: {},
          pomodoro: createDefaultPomodoro(),
        };
      }

      const existingUser = rooms[roomId].users[userId];
      const safeCharType = VALID_CHARACTER_TYPES.includes(characterType)
        ? characterType
        : existingUser?.characterType || 'cat';

      rooms[roomId].users[userId] = {
        socketId:
          clientType === 'overlay' || !existingUser
            ? socket.id
            : existingUser.socketId,
        userId,
        nickname,
        characterType: safeCharType,
        x: existingUser ? existingUser.x : Math.floor(Math.random() * 70) + 15,
        y: existingUser ? existingUser.y : 88,
        direction: existingUser ? existingUser.direction : 'right',
        state: existingUser ? existingUser.state : 'idle',
        statusBadge: statusBadge || existingUser?.statusBadge || 'online',
        activeEmote: existingUser?.activeEmote || null,
      };

      io.to(roomId).emit('roomStateUpdate', rooms[roomId].users);
      socket.emit('pomodoroUpdate', rooms[roomId].pomodoro);

      try {
        const history = await fetchRoomMessages(roomId, 50);
        socket.emit('roomHistory', history);
      } catch (e) {
        console.warn('[roomHistory 로드 오류]', e.message);
      }
    }
  );

  socket.on('moveCharacter', ({ roomId, userId, x, y, direction, state }) => {
    const user = rooms[roomId]?.users[userId];
    if (user) {
      user.x = Math.max(3, Math.min(97, Number(x) || user.x));
      user.y = Math.max(5, Math.min(95, Number(y) || user.y));
      user.direction = direction === 'left' ? 'left' : 'right';
      user.state = state || 'walk';
      socket.to(roomId).emit('characterMoved', user);
    }
  });

  socket.on('triggerEmote', ({ roomId, userId, emoteType }) => {
    const user = rooms[roomId]?.users[userId];
    if (!user || !emoteType) return;

    user.activeEmote = emoteType;
    io.to(roomId).emit('characterEmote', {
      userId,
      nickname: user.nickname,
      emoteType,
    });
  });

  socket.on(
    'interactCharacter',
    async ({ roomId, fromUserId, fromNickname, toUserId, toNickname, actionType }) => {
      if (!roomId || !fromUserId || !toUserId) return;

      const actionLabels = {
        pet: { emoji: '🫳💕', text: '쓰다듬었습니다' },
        poke: { emoji: '👉⚡', text: '콕 찔렀습니다' },
        highfive: { emoji: '🙌✨', text: '신나게 하이파이브했습니다' },
      };
      const info = actionLabels[actionType] || actionLabels.pet;

      io.to(roomId).emit('characterInteraction', {
        fromUserId,
        fromNickname,
        toUserId,
        toNickname,
        actionType,
        badge: `${info.emoji} ${fromNickname}님과 ${
          actionType === 'highfive'
            ? '하이파이브!'
            : actionType === 'poke'
            ? '콕!'
            : '쓰담쓰담!'
        }`,
      });

      const sysMsg = {
        id: `${Date.now()}_inter_${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        userId: fromUserId,
        nickname: fromNickname,
        message: `${info.emoji} ${fromNickname}님이 ${toNickname}님의 캐릭터를 ${info.text}!`,
        messageType: 'system',
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };

      await saveRoomMessage(sysMsg);
      io.to(roomId).emit('receiveMessage', sysMsg);
    }
  );

  socket.on('updateStatus', ({ roomId, userId, statusBadge }) => {
    const user = rooms[roomId]?.users[userId];
    if (!user) return;

    user.statusBadge = statusBadge || 'online';
    io.to(roomId).emit('roomStateUpdate', rooms[roomId].users);
  });

  socket.on('pomodoroControl', ({ roomId, action, nickname }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.pomodoro) {
      room.pomodoro = createDefaultPomodoro();
    }

    if (action === 'start') {
      room.pomodoro.isRunning = true;
      room.pomodoro.updatedBy = nickname || null;
    } else if (action === 'pause') {
      room.pomodoro.isRunning = false;
      room.pomodoro.updatedBy = nickname || null;
    } else if (action === 'reset') {
      room.pomodoro.isRunning = false;
      room.pomodoro.remainingSeconds =
        room.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
      room.pomodoro.updatedBy = nickname || null;
    } else if (action === 'switchMode') {
      room.pomodoro.isRunning = false;
      room.pomodoro.mode = room.pomodoro.mode === 'focus' ? 'break' : 'focus';
      room.pomodoro.remainingSeconds =
        room.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
      room.pomodoro.updatedBy = nickname || null;
    }

    io.to(roomId).emit('pomodoroUpdate', room.pomodoro);
  });

  socket.on('sendMessage', async ({ roomId, userId, nickname, message }) => {
    if (!roomId || !message || !String(message).trim()) return;

    const rawText = String(message).trim();
    const gameParsed = parseMiniGameCommand(rawText);

    const chatPayload = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      userId,
      nickname,
      message: gameParsed.isGame ? gameParsed.message : rawText,
      messageType: gameParsed.isGame ? 'game' : 'chat',
      gameResult: gameParsed.isGame ? gameParsed.gameResult : undefined,
      timestamp: new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    await saveRoomMessage(chatPayload);
    io.to(roomId).emit('receiveMessage', chatPayload);
  });

  socket.on('leaveRoom', ({ roomId, userId }) => {
    socket.leave(roomId);
    if (rooms[roomId]?.users[userId]) {
      delete rooms[roomId].users[userId];
      io.to(roomId).emit('roomStateUpdate', rooms[roomId].users);
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const users = rooms[roomId].users;
      for (const userId in users) {
        if (users[userId].socketId === socket.id) {
          delete users[userId];
          io.to(roomId).emit('roomStateUpdate', users);
          break;
        }
      }
    }
  });
});

const PORT = Number(process.env.PORT) || 4000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(
      `[DeskMate Server v2] Socket.io 및 REST 서버 실행 중 (Port: ${PORT}, DB 모드: ${
        isSupabaseConfigured ? 'Supabase PostgreSQL' : 'In-Memory Fallback'
      })`
    );
  });
}

module.exports = { app, server, io };
