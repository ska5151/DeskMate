import { io, Socket } from 'socket.io-client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { api, isLocalEnvironment } from './api';
import {
  directFetchMessages,
  directSaveMessage,
  supabaseClient,
} from './supabaseClient';
import { CharacterState, ChatMessage, PomodoroState } from '../types';

function parseMiniGameCommandClient(rawText: string) {
  const trimmed = String(rawText).trim();

  if (trimmed === '/주사위' || trimmed.toLowerCase() === '/dice') {
    const roll = Math.floor(Math.random() * 6) + 1;
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return {
      isGame: true,
      message: `🎲 주사위를 굴려 [${roll}] ${diceEmojis[roll - 1]} 이(가) 나왔습니다!`,
      gameResult: {
        gameType: 'dice' as const,
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
        gameType: 'rps' as const,
        value: picked.key,
        badge: `${picked.emoji} ${picked.key}!`,
      },
    };
  }

  return { isGame: false };
}

/**
 * Vercel 등 Serverless 클라우드 환경에서 로컬 Socket.io 서버(4000) 없이도
 * Supabase Realtime (Presence + Broadcast) 및 BroadcastChannel로 실시간 멀티플레이를 완벽히 구동하는 어댑터
 */
class SupabaseRealtimeSocketAdapter {
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private channel: RealtimeChannel | null = null;
  private localBus: BroadcastChannel | null = null;
  private roomUsers: Record<string, CharacterState> = {};
  private currentRoomId: string | null = null;
  private myUserId: string | null = null;
  private pomodoro: PomodoroState = {
    mode: 'focus',
    remainingSeconds: 25 * 60,
    isRunning: false,
    updatedBy: null,
  };
  private pomoTimer: ReturnType<typeof setInterval> | null = null;

  public on(event: string, cb: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return this;
  }

  private triggerLocal(event: string, payload: any) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => cb(payload));
    }
  }

  private broadcastBoth(event: string, payload: any) {
    this.triggerLocal(event, payload);
    this.localBus?.postMessage({ event, payload });
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event,
        payload,
      });
    }
  }

  public emit(event: string, data: any) {
    if (event === 'joinRoom') {
      this.handleJoinRoom(data);
      return this;
    }

    if (event === 'moveCharacter') {
      const user = this.roomUsers[data.userId];
      if (user) {
        user.x = Math.max(3, Math.min(97, Number(data.x) || user.x));
        user.y = Math.max(5, Math.min(95, Number(data.y) || user.y));
        user.direction = data.direction === 'left' ? 'left' : 'right';
        user.state = data.state || 'walk';
        this.broadcastBoth('characterMoved', user);
      }
      return this;
    }

    if (event === 'sendMessage') {
      const rawText = String(data.message || '').trim();
      if (!rawText || !this.currentRoomId) return this;

      const gameParsed = parseMiniGameCommandClient(rawText);
      const msgPayload: ChatMessage & { roomId: string } = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        roomId: this.currentRoomId,
        userId: data.userId,
        nickname: data.nickname,
        message: gameParsed.isGame ? gameParsed.message! : rawText,
        messageType: gameParsed.isGame ? 'game' : 'chat',
        gameResult: gameParsed.isGame ? gameParsed.gameResult : undefined,
        timestamp: new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };

      directSaveMessage(msgPayload);
      this.broadcastBoth('receiveMessage', msgPayload);
      return this;
    }

    if (event === 'triggerEmote') {
      const user = this.roomUsers[data.userId];
      this.broadcastBoth('characterEmote', {
        userId: data.userId,
        nickname: user?.nickname || data.userId,
        emoteType: data.emoteType,
      });
      return this;
    }

    if (event === 'interactCharacter') {
      const actionLabels: Record<string, { emoji: string; text: string }> = {
        pet: { emoji: '🫳💕', text: '쓰다듬었습니다' },
        poke: { emoji: '👉⚡', text: '콕 찔렀습니다' },
        highfive: { emoji: '🙌✨', text: '신나게 하이파이브했습니다' },
      };
      const info = actionLabels[data.actionType] || actionLabels.pet;

      this.broadcastBoth('characterInteraction', {
        ...data,
        badge: `${info.emoji} ${data.fromNickname}님과 ${
          data.actionType === 'highfive'
            ? '하이파이브!'
            : data.actionType === 'poke'
            ? '콕!'
            : '쓰담쓰담!'
        }`,
      });

      if (this.currentRoomId) {
        const sysMsg: ChatMessage & { roomId: string } = {
          id: `${Date.now()}_inter`,
          roomId: this.currentRoomId,
          userId: data.fromUserId,
          nickname: data.fromNickname,
          message: `${info.emoji} ${data.fromNickname}님이 ${data.toNickname}님의 캐릭터를 ${info.text}!`,
          messageType: 'system',
          timestamp: new Date().toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        };
        directSaveMessage(sysMsg);
        this.broadcastBoth('receiveMessage', sysMsg);
      }
      return this;
    }

    if (event === 'updateStatus') {
      const user = this.roomUsers[data.userId];
      if (user) {
        user.statusBadge = data.statusBadge || 'online';
        this.broadcastBoth('roomStateUpdate', { ...this.roomUsers });
      }
      return this;
    }

    if (event === 'pomodoroControl') {
      const action = data.action;
      if (action === 'start') {
        this.pomodoro.isRunning = true;
      } else if (action === 'pause') {
        this.pomodoro.isRunning = false;
      } else if (action === 'reset') {
        this.pomodoro.isRunning = false;
        this.pomodoro.remainingSeconds =
          this.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
      } else if (action === 'switchMode') {
        this.pomodoro.isRunning = false;
        this.pomodoro.mode =
          this.pomodoro.mode === 'focus' ? 'break' : 'focus';
        this.pomodoro.remainingSeconds =
          this.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
      }
      this.pomodoro.updatedBy = data.nickname || null;
      this.broadcastBoth('pomodoroUpdate', { ...this.pomodoro });
      return this;
    }

    if (event === 'leaveRoom') {
      if (data?.userId && this.roomUsers[data.userId]) {
        delete this.roomUsers[data.userId];
        this.broadcastBoth('roomStateUpdate', { ...this.roomUsers });
      }
      return this;
    }

    return this;
  }

  private async handleJoinRoom(data: any) {
    const { roomId, userId, nickname, characterType, statusBadge } = data;
    this.currentRoomId = roomId;
    this.myUserId = userId;

    const myChar: CharacterState = {
      userId,
      nickname,
      characterType: characterType || 'cat',
      x: Math.floor(Math.random() * 65) + 18,
      y: 88,
      direction: 'right',
      state: 'idle',
      statusBadge: statusBadge || 'online',
      activeEmote: null,
    };

    this.roomUsers[userId] = myChar;

    // 1) 같은 브라우저 창/탭 간 즉시 연동용 BroadcastChannel
    try {
      this.localBus?.close();
      this.localBus = new BroadcastChannel(`deskmate_bus_${roomId}`);
      this.localBus.onmessage = (ev) => {
        const { event, payload } = ev.data || {};
        if (!event) return;
        if (event === 'roomStateUpdate') {
          this.roomUsers = { ...this.roomUsers, ...payload };
        } else if (event === 'characterMoved' && payload?.userId) {
          this.roomUsers[payload.userId] = payload;
        }
        this.triggerLocal(event, payload);
      };
    } catch {
      // ignore if BroadcastChannel unsupported
    }

    // 2) Supabase Realtime 채널 연결 (전 세계 다른 접속자와 실시간 동기화)
    if (supabaseClient) {
      if (this.channel) {
        supabaseClient.removeChannel(this.channel);
      }

      const ch = supabaseClient.channel(`deskmate_room_${roomId}`, {
        config: {
          presence: { key: userId },
          broadcast: { self: false },
        },
      });

      const syncPresenceToUsers = () => {
        const state = ch.presenceState<CharacterState>();
        const merged: Record<string, CharacterState> = { ...this.roomUsers };
        Object.entries(state).forEach(([uid, list]) => {
          if (list && list[0]) {
            merged[uid] = {
              ...list[0],
              ...(merged[uid] || {}),
            };
          }
        });
        this.roomUsers = merged;
        this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
      };

      ch.on('presence', { event: 'sync' }, syncPresenceToUsers)
        .on('broadcast', { event: 'characterMoved' }, ({ payload }) => {
          if (payload?.userId) {
            this.roomUsers[payload.userId] = payload;
            this.triggerLocal('characterMoved', payload);
          }
        })
        .on('broadcast', { event: 'receiveMessage' }, ({ payload }) => {
          this.triggerLocal('receiveMessage', payload);
        })
        .on('broadcast', { event: 'characterEmote' }, ({ payload }) => {
          this.triggerLocal('characterEmote', payload);
        })
        .on('broadcast', { event: 'characterInteraction' }, ({ payload }) => {
          this.triggerLocal('characterInteraction', payload);
        })
        .on('broadcast', { event: 'roomStateUpdate' }, ({ payload }) => {
          this.roomUsers = { ...this.roomUsers, ...payload };
          this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
        })
        .on('broadcast', { event: 'pomodoroUpdate' }, ({ payload }) => {
          if (payload) {
            this.pomodoro = payload;
            this.triggerLocal('pomodoroUpdate', payload);
          }
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await ch.track(myChar);
          }
        });

      this.channel = ch;
    }

    // 3) 초기 상태 및 최근 채팅 히스토리 전달
    this.broadcastBoth('roomStateUpdate', { ...this.roomUsers });
    this.triggerLocal('pomodoroUpdate', { ...this.pomodoro });

    const history = await directFetchMessages(roomId);
    this.triggerLocal('roomHistory', history);

    // 4) 포모도로 로컬 1초 틱
    if (this.pomoTimer) clearInterval(this.pomoTimer);
    this.pomoTimer = setInterval(() => {
      if (!this.pomodoro.isRunning) return;
      if (this.pomodoro.remainingSeconds > 0) {
        this.pomodoro.remainingSeconds -= 1;
        this.triggerLocal('pomodoroUpdate', { ...this.pomodoro });
      } else {
        this.pomodoro.isRunning = false;
        this.pomodoro.mode =
          this.pomodoro.mode === 'focus' ? 'break' : 'focus';
        this.pomodoro.remainingSeconds =
          this.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
        this.broadcastBoth('pomodoroUpdate', { ...this.pomodoro });
      }
    }, 1000);
  }

  public disconnect() {
    if (this.pomoTimer) {
      clearInterval(this.pomoTimer);
      this.pomoTimer = null;
    }
    this.localBus?.close();
    this.localBus = null;
    if (this.channel && supabaseClient) {
      supabaseClient.removeChannel(this.channel);
      this.channel = null;
    }
    this.listeners.clear();
  }
}

export function createSocketConnection(): Socket {
  // Vercel 등 웹 배포 환경에서는 즉시 Supabase Realtime 어댑터 반환
  if (!isLocalEnvironment()) {
    return new SupabaseRealtimeSocketAdapter() as unknown as Socket;
  }

  return io(api.getServerUrl(), {
    transports: ['websocket', 'polling'],
    reconnection: true,
  });
}
