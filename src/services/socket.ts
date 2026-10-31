import { Socket } from 'socket.io-client';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  directFetchMessages,
  directSaveMessage,
  supabaseClient,
} from './supabaseClient';
import { CharacterState, ChatMessage, EmoteType, PomodoroState } from '../types';

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

function sanitizeCharacterState(
  raw: any,
  fallbackUserId?: string
): CharacterState | null {
  const uid = raw?.userId || fallbackUserId;
  if (!uid || typeof uid !== 'string') return null;
  return {
    userId: uid,
    nickname: raw?.nickname || uid,
    characterType: raw?.characterType || 'cat',
    x: Math.max(3, Math.min(97, Number(raw?.x) || 50)),
    y: Math.max(5, Math.min(95, Number(raw?.y) || 88)),
    direction: raw?.direction === 'left' ? 'left' : 'right',
    state: raw?.state === 'walk' ? 'walk' : 'idle',
    statusBadge: raw?.statusBadge || 'online',
    activeEmote: raw?.activeEmote || null,
  };
}

/**
 * 한 브라우저 탭 내의 MainWindow와 OverlayWindow가 동일한 Supabase Realtime 채널을
 * 중복 구독(충돌)하지 않고 1개의 공유 세션으로 100% 실시간 동기화하도록 관리하는 허브
 */
class RoomRealtimeHub {
  private handles: Set<SupabaseRealtimeSocketAdapter> = new Set();
  private channel: RealtimeChannel | null = null;
  private localBus: BroadcastChannel | null = null;
  private roomUsers: Record<string, CharacterState> = {};
  private currentRoomId: string | null = null;
  private myUserId: string | null = null;
  private cachedHistory: ChatMessage[] = [];
  private seenMessageIds: Set<string> = new Set();
  private syncTimers: Array<ReturnType<typeof setTimeout>> = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pomodoro: PomodoroState = {
    mode: 'focus',
    remainingSeconds: 25 * 60,
    isRunning: false,
    updatedBy: null,
  };
  private pomoTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (
      typeof window !== 'undefined' &&
      window.electronAPI?.onRoomEventRelayed
    ) {
      window.electronAPI.onRoomEventRelayed(({ event, payload }) => {
        if (!event) return;
        this.handleIncomingEvent(event, payload);
      });
    }
  }

  public registerHandle(handle: SupabaseRealtimeSocketAdapter) {
    this.handles.add(handle);
  }

  public unregisterHandle(handle: SupabaseRealtimeSocketAdapter) {
    this.handles.delete(handle);
  }

  public hasActiveRoom(): boolean {
    return Boolean(this.currentRoomId && this.myUserId);
  }

  public getRoomUsers(): Record<string, CharacterState> {
    return { ...this.roomUsers };
  }

  public getPomodoro(): PomodoroState {
    return { ...this.pomodoro };
  }

  public getCachedHistory(): ChatMessage[] {
    return this.cachedHistory;
  }

  public triggerLocal(event: string, payload: any) {
    this.handles.forEach((h) => h.dispatchToListeners(event, payload));
  }

  private sendRemote(event: string, payload: any) {
    try {
      this.localBus?.postMessage({
        senderId: this.myUserId,
        event,
        payload,
      });
    } catch {
      // ignore
    }
    window.electronAPI?.relayRoomEvent?.({ event, payload });
    if (this.channel) {
      this.channel
        .send({
          type: 'broadcast',
          event,
          payload,
        })
        .catch(() => {
          // ignore transient broadcast error
        });
    }
  }

  public broadcastAll(event: string, payload: any) {
    this.triggerLocal(event, payload);
    this.sendRemote(event, payload);
  }

  private handleIncomingEvent(event: string, payload: any) {
    if (!event) return;

    if (event === 'requestRoomSync') {
      const incomingChar = sanitizeCharacterState(payload?.character);
      if (incomingChar) {
        this.roomUsers[incomingChar.userId] = incomingChar;
        this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
      }
      // 이미 방에 있던 내 캐릭터 상태와 방 전체 상태를 즉시 응답
      if (this.myUserId && this.roomUsers[this.myUserId]) {
        this.sendRemote('roomStateUpdate', {
          [this.myUserId]: this.roomUsers[this.myUserId],
        });
      }
      if (this.pomodoro.isRunning || this.pomodoro.updatedBy) {
        this.sendRemote('pomodoroUpdate', { ...this.pomodoro });
      }
      return;
    }

    if (event === 'roomStateUpdate' && payload && typeof payload === 'object') {
      Object.entries(payload).forEach(([uid, rawChar]) => {
        const clean = sanitizeCharacterState(rawChar, uid);
        if (clean) {
          this.roomUsers[uid] = clean;
        }
      });
      this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
      return;
    }

    if (event === 'characterMoved' && payload?.userId) {
      const clean = sanitizeCharacterState(payload, payload.userId);
      if (clean) {
        this.roomUsers[clean.userId] = clean;
        this.triggerLocal('characterMoved', clean);
      }
      return;
    }

    if (event === 'userLeftRoom' && payload?.userId) {
      if (this.roomUsers[payload.userId]) {
        delete this.roomUsers[payload.userId];
        this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
      }
      return;
    }

    if (event === 'receiveMessage' && payload) {
      if (payload.id) {
        if (this.seenMessageIds.has(payload.id)) return;
        this.seenMessageIds.add(payload.id);
      }
      this.triggerLocal('receiveMessage', payload);
      return;
    }

    if (event === 'characterEmote' && payload) {
      this.triggerLocal('characterEmote', payload);
      return;
    }

    if (event === 'characterInteraction' && payload) {
      this.triggerLocal('characterInteraction', payload);
      return;
    }

    if (event === 'pomodoroUpdate' && payload) {
      this.pomodoro = payload;
      this.triggerLocal('pomodoroUpdate', payload);
      return;
    }
  }

  public async joinRoom(data: any) {
    const { roomId, userId, nickname, characterType, statusBadge } = data;
    if (!roomId || !userId) return;

    const isSameRoom =
      this.currentRoomId === roomId &&
      this.myUserId === userId &&
      this.channel !== null;

    this.currentRoomId = roomId;
    this.myUserId = userId;

    const existing = this.roomUsers[userId];
    const myChar: CharacterState = {
      userId,
      nickname: nickname || existing?.nickname || userId,
      characterType: characterType || existing?.characterType || 'cat',
      x: existing ? existing.x : 50,
      y: existing ? existing.y : 88,
      direction: existing ? existing.direction : 'right',
      state: existing ? existing.state : 'idle',
      statusBadge: statusBadge || existing?.statusBadge || 'online',
      activeEmote: existing?.activeEmote || null,
    };

    this.roomUsers[userId] = myChar;

    // 로컬 모든 핸들(MainWindow + OverlayWindow)에 즉시 현재 캐릭터 목록 및 타이머 상태 전달
    this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
    this.triggerLocal('pomodoroUpdate', { ...this.pomodoro });

    if (isSameRoom) {
      // 이미 동일 방에 채널이 연결되어 있는 경우(OverlayWindow 마운트 시점 등)
      if (this.cachedHistory.length > 0) {
        this.triggerLocal('roomHistory', this.cachedHistory);
      } else {
        directFetchMessages(roomId).then((history) => {
          this.cachedHistory = history;
          this.triggerLocal('roomHistory', history);
        });
      }
      this.sendRemote('requestRoomSync', {
        requesterId: userId,
        character: myChar,
      });
      this.sendRemote('roomStateUpdate', { [userId]: myChar });
      return;
    }

    // 새 방 진입 시 기존 리소스 정리
    this.cleanupChannelResources();
    this.roomUsers = { [userId]: myChar };
    this.triggerLocal('roomStateUpdate', { ...this.roomUsers });

    // 1) 같은 브라우저 탭 간 BroadcastChannel 연결
    try {
      this.localBus = new BroadcastChannel(`deskmate_bus_${roomId}`);
      this.localBus.onmessage = (ev) => {
        const { event, payload } = ev.data || {};
        if (!event) return;
        this.handleIncomingEvent(event, payload);
      };
      this.localBus.postMessage({
        senderId: userId,
        event: 'requestRoomSync',
        payload: { requesterId: userId, character: myChar },
      });
      this.localBus.postMessage({
        senderId: userId,
        event: 'roomStateUpdate',
        payload: { [userId]: myChar },
      });
    } catch {
      // ignore
    }

    // 2) Supabase Realtime 단일 채널 연결 (타 계정/타 브라우저/모바일 실시간 연동)
    if (supabaseClient) {
      const ch = supabaseClient.channel(`deskmate_room_${roomId}`, {
        config: {
          presence: { key: userId },
          broadcast: { self: false, ack: false },
        },
      });

      const syncPresenceToUsers = () => {
        const state = ch.presenceState<CharacterState>();

        Object.entries(state).forEach(([uid, list]) => {
          if (Array.isArray(list) && list.length > 0) {
            const latestPresence = list[list.length - 1];
            const clean = sanitizeCharacterState(latestPresence, uid);
            if (clean) {
              const prev = this.roomUsers[clean.userId];
              this.roomUsers[clean.userId] = prev
                ? {
                    ...clean,
                    x: prev.x,
                    y: prev.y,
                    direction: prev.direction,
                    state: prev.state,
                    activeEmote: prev.activeEmote,
                  }
                : clean;
            }
          }
        });

        this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
      };

      ch.on('presence', { event: 'sync' }, syncPresenceToUsers)
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          if (Array.isArray(newPresences)) {
            newPresences.forEach((p: any) => {
              const clean = sanitizeCharacterState(p);
              if (clean) {
                this.roomUsers[clean.userId] =
                  this.roomUsers[clean.userId] || clean;
              }
            });
            this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
          }
          // 새로 들어온 유저에게 내 현재 캐릭터 위치·상태 즉시 전송
          if (this.myUserId && this.roomUsers[this.myUserId]) {
            this.sendRemote('roomStateUpdate', {
              [this.myUserId]: this.roomUsers[this.myUserId],
            });
          }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          if (Array.isArray(leftPresences)) {
            leftPresences.forEach((p: any) => {
              const uid = p?.userId;
              if (uid && uid !== this.myUserId && this.roomUsers[uid]) {
                delete this.roomUsers[uid];
              }
            });
            this.triggerLocal('roomStateUpdate', { ...this.roomUsers });
          }
        })
        .on('broadcast', { event: 'requestRoomSync' }, ({ payload }) => {
          this.handleIncomingEvent('requestRoomSync', payload);
        })
        .on('broadcast', { event: 'roomStateUpdate' }, ({ payload }) => {
          this.handleIncomingEvent('roomStateUpdate', payload);
        })
        .on('broadcast', { event: 'characterMoved' }, ({ payload }) => {
          this.handleIncomingEvent('characterMoved', payload);
        })
        .on('broadcast', { event: 'userLeftRoom' }, ({ payload }) => {
          this.handleIncomingEvent('userLeftRoom', payload);
        })
        .on('broadcast', { event: 'receiveMessage' }, ({ payload }) => {
          this.handleIncomingEvent('receiveMessage', payload);
        })
        .on('broadcast', { event: 'characterEmote' }, ({ payload }) => {
          this.handleIncomingEvent('characterEmote', payload);
        })
        .on('broadcast', { event: 'characterInteraction' }, ({ payload }) => {
          this.handleIncomingEvent('characterInteraction', payload);
        })
        .on('broadcast', { event: 'pomodoroUpdate' }, ({ payload }) => {
          this.handleIncomingEvent('pomodoroUpdate', payload);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const latestMe = this.roomUsers[userId] || myChar;
            await ch.track(latestMe);
            this.sendRemote('requestRoomSync', {
              requesterId: userId,
              character: latestMe,
            });
            this.sendRemote('roomStateUpdate', { [userId]: latestMe });

            // 네트워크 지연 대비 500ms, 1500ms 후 동기화 확인 패킷 추가 발송
            const t1 = setTimeout(() => {
              const meNow = this.roomUsers[userId];
              if (meNow) {
                this.sendRemote('requestRoomSync', {
                  requesterId: userId,
                  character: meNow,
                });
              }
            }, 500);
            const t2 = setTimeout(() => {
              const meNow = this.roomUsers[userId];
              if (meNow) {
                this.sendRemote('requestRoomSync', {
                  requesterId: userId,
                  character: meNow,
                });
              }
            }, 1500);
            this.syncTimers.push(t1, t2);
          }
        });

      this.channel = ch;
    }

    // 3) 최근 채팅 히스토리 로드
    const history = await directFetchMessages(roomId);
    this.cachedHistory = history;
    history.forEach((m) => {
      if (m.id) this.seenMessageIds.add(m.id);
    });
    this.triggerLocal('roomHistory', history);

    // 4) 3초 주기 내 캐릭터 상태 하트비트 브로드캐스트 (네트워크 지연/재접속 시에도 상대방 표시 100% 보장)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.myUserId && this.roomUsers[this.myUserId]) {
        this.sendRemote('roomStateUpdate', {
          [this.myUserId]: this.roomUsers[this.myUserId],
        });
      }
    }, 3000);

    // 5) 포모도로 1초 틱
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
        this.broadcastAll('pomodoroUpdate', { ...this.pomodoro });
      }
    }, 1000);
  }

  public moveCharacter(data: any) {
    if (!data?.userId) return;
    const existing = this.roomUsers[data.userId];
    const updatedUser: CharacterState = {
      userId: data.userId,
      nickname: data.nickname || existing?.nickname || data.userId,
      characterType: data.characterType || existing?.characterType || 'cat',
      x: Math.max(3, Math.min(97, Number(data.x) || existing?.x || 50)),
      y: Math.max(5, Math.min(95, Number(data.y) || existing?.y || 88)),
      direction: data.direction === 'left' ? 'left' : 'right',
      state: data.state || 'walk',
      statusBadge: data.statusBadge || existing?.statusBadge || 'online',
      activeEmote: existing?.activeEmote || null,
    };
    this.roomUsers[data.userId] = updatedUser;
    this.broadcastAll('characterMoved', updatedUser);

    // 이동을 멈추고 대기 상태(idle)가 되었을 때 Presence 좌표도 최신화
    if (updatedUser.state === 'idle' && this.channel) {
      this.channel.track(updatedUser).catch(() => {});
    }
  }

  public sendMessage(data: any) {
    const rawText = String(data?.message || '').trim();
    const roomId = data?.roomId || this.currentRoomId;
    if (!rawText || !roomId) return;

    const gameParsed = parseMiniGameCommandClient(rawText);
    const msgPayload: ChatMessage & { roomId: string } = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
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

    this.seenMessageIds.add(msgPayload.id);
    this.cachedHistory = [...this.cachedHistory.slice(-49), msgPayload];
    directSaveMessage(msgPayload);
    this.broadcastAll('receiveMessage', msgPayload);
  }

  public triggerEmote(data: any) {
    if (!data?.userId || !data?.emoteType) return;
    const user = this.roomUsers[data.userId];
    if (user) {
      user.activeEmote = data.emoteType as EmoteType;
    }
    this.broadcastAll('characterEmote', {
      userId: data.userId,
      nickname: user?.nickname || data.userId,
      emoteType: data.emoteType,
    });
  }

  public interactCharacter(data: any) {
    const actionLabels: Record<string, { emoji: string; text: string }> = {
      pet: { emoji: '🫳💕', text: '쓰다듬었습니다' },
      poke: { emoji: '👉⚡', text: '콕 찔렀습니다' },
      highfive: { emoji: '🙌✨', text: '신나게 하이파이브했습니다' },
    };
    const info = actionLabels[data.actionType] || actionLabels.pet;

    this.broadcastAll('characterInteraction', {
      ...data,
      badge: `${info.emoji} ${data.fromNickname}님과 ${
        data.actionType === 'highfive'
          ? '하이파이브!'
          : data.actionType === 'poke'
          ? '콕!'
          : '쓰담쓰담!'
      }`,
    });

    const roomId = data?.roomId || this.currentRoomId;
    if (roomId) {
      const sysMsg: ChatMessage & { roomId: string } = {
        id: `${Date.now()}_inter`,
        roomId,
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
      this.seenMessageIds.add(sysMsg.id);
      directSaveMessage(sysMsg);
      this.broadcastAll('receiveMessage', sysMsg);
    }
  }

  public updateStatus(data: any) {
    const user = this.roomUsers[data?.userId];
    if (user) {
      user.statusBadge = data.statusBadge || 'online';
      this.broadcastAll('roomStateUpdate', { ...this.roomUsers });
      if (this.channel) {
        this.channel.track(user).catch(() => {});
      }
    }
  }

  public pomodoroControl(data: any) {
    const action = data?.action;
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
    this.pomodoro.updatedBy = data?.nickname || null;
    this.broadcastAll('pomodoroUpdate', { ...this.pomodoro });
  }

  public leaveRoom(data: any) {
    const leavingUid = data?.userId || this.myUserId;
    if (leavingUid) {
      this.sendRemote('userLeftRoom', { userId: leavingUid });
    }
    this.cleanupChannelResources();
    this.roomUsers = {};
    this.currentRoomId = null;
    this.myUserId = null;
    this.cachedHistory = [];
  }

  private cleanupChannelResources() {
    this.syncTimers.forEach(clearTimeout);
    this.syncTimers = [];
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pomoTimer) {
      clearInterval(this.pomoTimer);
      this.pomoTimer = null;
    }
    try {
      this.localBus?.close();
    } catch {
      // ignore
    }
    this.localBus = null;
    if (this.channel && supabaseClient) {
      this.channel.untrack().catch(() => {});
      supabaseClient.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

const sharedRoomHub = new RoomRealtimeHub();

class SupabaseRealtimeSocketAdapter {
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  constructor() {
    sharedRoomHub.registerHandle(this);
  }

  public on(event: string, cb: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);

    // joinRoom 호출 이후에 리스너가 등록되더라도 즉시 현재 상태를 전달
    if (sharedRoomHub.hasActiveRoom()) {
      if (event === 'roomStateUpdate') {
        cb(sharedRoomHub.getRoomUsers());
      } else if (event === 'pomodoroUpdate') {
        cb(sharedRoomHub.getPomodoro());
      } else if (
        event === 'roomHistory' &&
        sharedRoomHub.getCachedHistory().length > 0
      ) {
        cb(sharedRoomHub.getCachedHistory());
      }
    }

    return this;
  }

  public dispatchToListeners(event: string, payload: any) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => cb(payload));
    }
  }

  public emit(event: string, data: any) {
    switch (event) {
      case 'joinRoom':
        sharedRoomHub.joinRoom(data);
        break;
      case 'moveCharacter':
        sharedRoomHub.moveCharacter(data);
        break;
      case 'sendMessage':
        sharedRoomHub.sendMessage(data);
        break;
      case 'triggerEmote':
        sharedRoomHub.triggerEmote(data);
        break;
      case 'interactCharacter':
        sharedRoomHub.interactCharacter(data);
        break;
      case 'updateStatus':
        sharedRoomHub.updateStatus(data);
        break;
      case 'pomodoroControl':
        sharedRoomHub.pomodoroControl(data);
        break;
      case 'leaveRoom':
        sharedRoomHub.leaveRoom(data);
        break;
      default:
        break;
    }
    return this;
  }

  public disconnect() {
    sharedRoomHub.unregisterHandle(this);
    this.listeners.clear();
  }
}

export function createSocketConnection(): Socket {
  return new SupabaseRealtimeSocketAdapter() as unknown as Socket;
}
