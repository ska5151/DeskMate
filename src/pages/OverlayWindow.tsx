import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import {
  CharacterAvatar,
  EMOTE_OPTIONS,
  getStatusBadgeDisplay,
} from '../components/CharacterAvatar';
import { createSocketConnection } from '../services/socket';
import {
  CharacterEmoteEvent,
  CharacterInteractionEvent,
  CharacterState,
  ChatMessage,
  EmoteType,
  InteractionType,
  PomodoroState,
  RoomOverlayInitData,
} from '../types';
import { sound } from '../utils/sound';

const GROUND_Y = 88; // 작업표시줄 바로 위 바닥 기준선 (%)

const EMOTE_BADGE_TEXT: Record<EmoteType, string> = {
  wave: '👋 안녕하세요~!',
  jump: '⭐ 폴짝 점프!',
  dance: '🎵 신나는 댄스!',
  heart: '❤️ 하트 뿅뿅!',
  sleep: '💤 쿨쿨 Zzz...',
};

interface OverlayWindowProps {
  embeddedRoomData?: RoomOverlayInitData | null;
}

export default function OverlayWindow({
  embeddedRoomData = null,
}: OverlayWindowProps) {
  const [myInfo, setMyInfo] = useState<RoomOverlayInitData | null>(
    embeddedRoomData
  );
  const [characters, setCharacters] = useState<Record<string, CharacterState>>(
    {}
  );
  const [bubbles, setBubbles] = useState<
    Record<string, { text: string; isGame?: boolean; gameBadge?: string }>
  >({});
  const [emoteBadges, setEmoteBadges] = useState<Record<string, string>>({});
  const [activeEmotes, setActiveEmotes] = useState<
    Record<string, EmoteType | null>
  >({});

  // 드래그 및 중력 물리 상태
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [fallingUsers, setFallingUsers] = useState<Record<string, boolean>>({});

  // 타 유저 클릭 시 상호작용 팝업 대상 userId
  const [interactionTargetId, setInteractionTargetId] = useState<string | null>(
    null
  );

  // 바탕화면 미니 채팅 입력바 (Quick Chat) 상태
  const [quickChatOpen, setQuickChatOpen] = useState(false);
  const [quickChatText, setQuickChatText] = useState('');

  // 공유 포모도로 타이머 & 방해 금지 모드
  const [pomodoro, setPomodoro] = useState<PomodoroState | null>(null);
  const [isDndMode, setIsDndMode] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const myInfoRef = useRef<RoomOverlayInitData | null>(null);
  const charactersRef = useRef<Record<string, CharacterState>>({});
  const isDndRef = useRef<boolean>(false);

  const bubbleTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const emoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const physicsFrameRef = useRef<number | null>(null);

  useEffect(() => {
    myInfoRef.current = myInfo;
  }, [myInfo]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  useEffect(() => {
    isDndRef.current = isDndMode;
    sound.setDnd(isDndMode);
  }, [isDndMode]);

  // Quick Chat 입력창 열기 헬퍼
  const openQuickChatBar = () => {
    setQuickChatOpen(true);
    window.electronAPI?.setOverlayFocusable(true);
    setTimeout(() => {
      quickInputRef.current?.focus();
    }, 50);
  };

  // Quick Chat 입력창 닫기 헬퍼
  const closeQuickChatBar = () => {
    setQuickChatOpen(false);
    setQuickChatText('');
    window.electronAPI?.setOverlayFocusable(false);
  };

  useEffect(() => {
    const socket = createSocketConnection();
    socketRef.current = socket;

    const activateOverlayWithRoomData = (roomData: RoomOverlayInitData) => {
      if (!roomData || !roomData.roomId || !roomData.userId) return;
      setMyInfo(roomData);

      // 즉시 내 캐릭터를 바탕화면 하단(y: 88%)에 선(先)렌더링하여 빈 화면이 절대 나오지 않도록 보장!
      setCharacters((prev) => ({
        ...prev,
        [roomData.userId]: prev[roomData.userId] || {
          userId: roomData.userId,
          nickname: roomData.nickname,
          characterType: roomData.characterType,
          x: 50,
          y: GROUND_Y,
          direction: 'right',
          state: 'idle',
          statusBadge: roomData.statusBadge || 'online',
          activeEmote: null,
        },
      }));

      socket.emit('joinRoom', {
        ...roomData,
        clientType: 'overlay',
      });
    };

    // 1. 웹 내장 prop이 있는 경우 즉시 활성화
    if (embeddedRoomData) {
      activateOverlayWithRoomData(embeddedRoomData);
    }

    // 2. Electron 메인 프로세스에 이미 활성화된 방 정보가 있는지 능동 조회 + 1초 주기 폴링 (타이밍 누락 0% 보장)
    const checkSavedRoomFromMain = () => {
      if (myInfoRef.current) return;
      window.electronAPI?.getCurrentRoom?.().then((savedRoom) => {
        if (savedRoom && !myInfoRef.current) {
          activateOverlayWithRoomData(savedRoom);
        }
      });
    };

    checkSavedRoomFromMain();
    const roomSyncPollTimer = setInterval(checkSavedRoomFromMain, 1000);

    // 3. 메인 창 또는 로컬 브릿지에서 방 입장 시 전달받은 데이터로 활성화
    const removeInitListener = window.electronAPI?.onInitOverlay((roomData) => {
      activateOverlayWithRoomData(roomData);
    });

    // 2. 방 나가기 시 오버레이 상태 초기화
    const removeClearListener = window.electronAPI?.onClearOverlay(() => {
      setMyInfo(null);
      setCharacters({});
      setBubbles({});
      setEmoteBadges({});
      setActiveEmotes({});
      setInteractionTargetId(null);
      setQuickChatOpen(false);
    });

    // 3. 글로벌 단축키(Alt+Enter)로 Quick Chat 열기
    const removeQuickChatListener = window.electronAPI?.onOpenQuickChat(() => {
      openQuickChatBar();
    });

    // 4. 앱 설정(방해금지 모드 등) 동기화
    const removeSettingsListener = window.electronAPI?.onAppSettingsUpdated(
      (settings) => {
        setIsDndMode(settings.isDndMode);
      }
    );

    // 방 내 캐릭터 전체 목록 갱신
    socket.on('roomStateUpdate', (users: Record<string, CharacterState>) => {
      setCharacters(users);
    });

    // 다른 유저 캐릭터 이동 수신
    socket.on('characterMoved', (updatedUser: CharacterState) => {
      setCharacters((prev) => ({
        ...prev,
        [updatedUser.userId]: updatedUser,
      }));
    });

    // 감정 표현(이모트) 수신
    socket.on('characterEmote', ({ userId, emoteType }: CharacterEmoteEvent) => {
      if (isDndRef.current) return;

      sound.playEmoteSound();
      setActiveEmotes((prev) => ({ ...prev, [userId]: emoteType }));
      setEmoteBadges((prev) => ({
        ...prev,
        [userId]: EMOTE_BADGE_TEXT[emoteType] || '✨',
      }));

      if (emoteTimersRef.current[userId]) {
        clearTimeout(emoteTimersRef.current[userId]);
      }

      if (emoteType !== 'sleep') {
        emoteTimersRef.current[userId] = setTimeout(() => {
          setActiveEmotes((prev) => ({ ...prev, [userId]: null }));
          setEmoteBadges((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
        }, 3500);
      }
    });

    // 캐릭터 간 상호작용(쓰다듬기, 찌르기, 하이파이브) 수신
    socket.on(
      'characterInteraction',
      ({ fromUserId, toUserId, badge }: CharacterInteractionEvent) => {
        if (isDndRef.current) return;

        sound.playEmoteSound();
        setEmoteBadges((prev) => ({
          ...prev,
          [toUserId]: badge,
          [fromUserId]: badge,
        }));
        setActiveEmotes((prev) => ({
          ...prev,
          [toUserId]: 'jump',
          [fromUserId]: 'wave',
        }));

        [toUserId, fromUserId].forEach((uid) => {
          if (emoteTimersRef.current[uid]) {
            clearTimeout(emoteTimersRef.current[uid]);
          }
          emoteTimersRef.current[uid] = setTimeout(() => {
            setActiveEmotes((prev) => ({ ...prev, [uid]: null }));
            setEmoteBadges((prev) => {
              const next = { ...prev };
              delete next[uid];
              return next;
            });
          }, 3200);
        });
      }
    );

    // 포모도로 타이머 동기화
    socket.on('pomodoroUpdate', (pomo: PomodoroState) => {
      setPomodoro(pomo);
    });

    // 채팅 및 미니게임 메시지 수신 -> 머리 위 말풍선 표시 (4.5초 후 제거)
    socket.on('receiveMessage', (msg: ChatMessage) => {
      if (isDndRef.current || msg.userId === 'system') return;

      const senderChar = charactersRef.current[msg.userId];
      if (msg.messageType === 'game') {
        sound.playGameSound();
      } else {
        sound.playBubblePop(senderChar?.characterType);
      }

      setBubbles((prev) => ({
        ...prev,
        [msg.userId]: {
          text: msg.message,
          isGame: msg.messageType === 'game',
          gameBadge: msg.gameResult?.badge,
        },
      }));

      if (bubbleTimersRef.current[msg.userId]) {
        clearTimeout(bubbleTimersRef.current[msg.userId]);
      }

      bubbleTimersRef.current[msg.userId] = setTimeout(() => {
        setBubbles((prev) => {
          const next = { ...prev };
          delete next[msg.userId];
          return next;
        });
      }, 4500);
    });

    return () => {
      clearInterval(roomSyncPollTimer);
      removeInitListener?.();
      removeClearListener?.();
      removeQuickChatListener?.();
      removeSettingsListener?.();
      if (physicsFrameRef.current) {
        cancelAnimationFrame(physicsFrameRef.current);
      }
      Object.values(bubbleTimersRef.current).forEach(clearTimeout);
      Object.values(emoteTimersRef.current).forEach(clearTimeout);
      socket.disconnect();
    };
  }, []);

  // =========================================================
  // 중력 & 작업표시줄 바운스 착지 물리 엔진
  // =========================================================
  const startGravityDrop = (userId: string, startX: number, startY: number) => {
    if (startY >= GROUND_Y) return;

    setFallingUsers((prev) => ({ ...prev, [userId]: true }));
    let currentY = startY;
    let velocityY = 0;
    const gravity = 0.26;
    const bounceFactor = -0.42;
    let bounceCount = 0;

    const stepPhysics = () => {
      velocityY += gravity;
      currentY += velocityY;

      if (currentY >= GROUND_Y) {
        currentY = GROUND_Y;
        if (Math.abs(velocityY) > 1.1 && bounceCount < 2) {
          velocityY = velocityY * bounceFactor;
          bounceCount += 1;
          sound.playBounceSound();
        } else {
          // 바닥 착지 완료
          setFallingUsers((prev) => ({ ...prev, [userId]: false }));
          setCharacters((prev) => {
            const target = prev[userId];
            if (!target) return prev;
            const landed: CharacterState = {
              ...target,
              x: Number(startX.toFixed(2)),
              y: GROUND_Y,
              state: 'idle',
            };
            if (myInfoRef.current) {
              socketRef.current?.emit('moveCharacter', {
                roomId: myInfoRef.current.roomId,
                ...landed,
              });
            }
            return { ...prev, [userId]: landed };
          });
          return;
        }
      }

      setCharacters((prev) => {
        const target = prev[userId];
        if (!target) return prev;
        return {
          ...prev,
          [userId]: {
            ...target,
            y: Number(currentY.toFixed(2)),
          },
        };
      });

      physicsFrameRef.current = requestAnimationFrame(stepPhysics);
    };

    if (physicsFrameRef.current) {
      cancelAnimationFrame(physicsFrameRef.current);
    }
    physicsFrameRef.current = requestAnimationFrame(stepPhysics);
  };

  // 내 캐릭터 자동 배회(Random Walk) 로직
  useEffect(() => {
    if (!myInfo) return;

    const interval = setInterval(() => {
      // 드래그 중이거나 낙하 중이거나 잠자기(sleep) 이모트 중이면 자동 배회 일시 정지
      if (
        draggingUserId === myInfo.userId ||
        fallingUsers[myInfo.userId] ||
        activeEmotes[myInfo.userId] === 'sleep'
      ) {
        return;
      }

      setCharacters((prev) => {
        const me = prev[myInfo.userId];
        if (!me) return prev;

        if (Math.random() < 0.32) {
          const idleMe: CharacterState = { ...me, state: 'idle' };
          socketRef.current?.emit('moveCharacter', {
            roomId: myInfo.roomId,
            ...idleMe,
          });
          return { ...prev, [myInfo.userId]: idleMe };
        }

        const deltaX = (Math.random() - 0.5) * 18;
        const nextX = Math.max(6, Math.min(94, me.x + deltaX));
        const direction = deltaX >= 0 ? 'right' : 'left';

        const updatedMe: CharacterState = {
          ...me,
          x: Number(nextX.toFixed(2)),
          y: GROUND_Y,
          direction,
          state: 'walk',
        };

        socketRef.current?.emit('moveCharacter', {
          roomId: myInfo.roomId,
          ...updatedMe,
        });

        return { ...prev, [myInfo.userId]: updatedMe };
      });
    }, 3300);

    return () => clearInterval(interval);
  }, [myInfo, draggingUserId, fallingUsers, activeEmotes]);

  // 마우스로 내 캐릭터를 드래그하여 옮기고 놓았을 때 중력 착지 실행
  useEffect(() => {
    if (!draggingUserId || !myInfo) return;

    const handleMouseMove = (e: MouseEvent) => {
      const nextX = Math.max(
        5,
        Math.min(95, (e.clientX / window.innerWidth) * 100)
      );
      const nextY = Math.max(
        10,
        Math.min(GROUND_Y, (e.clientY / window.innerHeight) * 100)
      );

      setCharacters((prev) => {
        const target = prev[draggingUserId];
        if (!target) return prev;

        const direction = nextX >= target.x ? 'right' : 'left';
        const updated: CharacterState = {
          ...target,
          x: Number(nextX.toFixed(2)),
          y: Number(nextY.toFixed(2)),
          direction,
          state: 'walk',
        };

        socketRef.current?.emit('moveCharacter', {
          roomId: myInfo.roomId,
          ...updated,
        });

        return { ...prev, [draggingUserId]: updated };
      });
    };

    const handleMouseUp = () => {
      const currentChar = charactersRef.current[draggingUserId];
      setDraggingUserId(null);
      if (!quickChatOpen) {
        window.electronAPI?.setIgnoreMouse(true);
      }

      // 높은 곳에서 놓았다면 중력 낙하 물리 효과 발동!
      if (currentChar && currentChar.y < GROUND_Y) {
        startGravityDrop(draggingUserId, currentChar.x, currentChar.y);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingUserId, myInfo, quickChatOpen]);

  // 오버레이 내 단축키(Alt+1~5 이모트, Esc 닫기)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && quickChatOpen) {
        closeQuickChatBar();
        return;
      }

      if (e.altKey && myInfo) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < EMOTE_OPTIONS.length) {
          e.preventDefault();
          const emoteType = EMOTE_OPTIONS[idx].type;
          socketRef.current?.emit('triggerEmote', {
            roomId: myInfo.roomId,
            userId: myInfo.userId,
            emoteType,
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickChatOpen, myInfo]);

  // 바탕화면 Quick Chat 전송
  const handleQuickChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickChatText.trim() || !myInfo) {
      closeQuickChatBar();
      return;
    }

    socketRef.current?.emit('sendMessage', {
      roomId: myInfo.roomId,
      userId: myInfo.userId,
      nickname: myInfo.nickname,
      message: quickChatText.trim(),
    });

    closeQuickChatBar();
  };

  // Quick Chat에서 즉시 이모트 또는 미니게임 발송
  const handleQuickEmote = (emoteType: EmoteType) => {
    if (!myInfo) return;
    socketRef.current?.emit('triggerEmote', {
      roomId: myInfo.roomId,
      userId: myInfo.userId,
      emoteType,
    });
  };

  const handleQuickCommand = (cmd: string) => {
    if (!myInfo) return;
    socketRef.current?.emit('sendMessage', {
      roomId: myInfo.roomId,
      userId: myInfo.userId,
      nickname: myInfo.nickname,
      message: cmd,
    });
    closeQuickChatBar();
  };

  // 타 유저 상호작용 발송
  const handleSendInteraction = (
    targetChar: CharacterState,
    actionType: InteractionType
  ) => {
    if (!myInfo) return;
    socketRef.current?.emit('interactCharacter', {
      roomId: myInfo.roomId,
      fromUserId: myInfo.userId,
      fromNickname: myInfo.nickname,
      toUserId: targetChar.userId,
      toNickname: targetChar.nickname,
      actionType,
    });
    setInteractionTargetId(null);
    window.electronAPI?.setIgnoreMouse(true);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const myCharacter = myInfo ? characters[myInfo.userId] : null;

  return (
    <div
      style={{
        width: embeddedRoomData ? '100%' : '100vw',
        height: embeddedRoomData ? '100%' : '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {/* 상단 공유 포모도로 타이머 미니 HUD (실행 중일 때 표시) */}
      {pomodoro && pomodoro.isRunning && (
        <div className="overlay-pomodoro-hud">
          <span>{pomodoro.mode === 'focus' ? '🍅 집중 타이머' : '☕ 휴식 타이머'}</span>
          <strong>{formatTimer(pomodoro.remainingSeconds)}</strong>
        </div>
      )}

      {/* 캐릭터 렌더링 */}
      {Object.values(characters).map((char) => {
        const isMe = myInfo?.userId === char.userId;
        const isDragging = draggingUserId === char.userId;
        const isFalling = Boolean(fallingUsers[char.userId]);
        const bubbleData = bubbles[char.userId];
        const emoteBadge = emoteBadges[char.userId];
        const currentEmote = activeEmotes[char.userId] || null;
        const statusInfo = getStatusBadgeDisplay(char.statusBadge);

        return (
          <div
            key={char.userId}
            onMouseEnter={() => window.electronAPI?.setIgnoreMouse(false)}
            onMouseLeave={() => {
              if (!isDragging && !quickChatOpen && !interactionTargetId) {
                window.electronAPI?.setIgnoreMouse(true);
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (isMe) {
                // 잠자기 상태였다면 깨우기
                if (activeEmotes[char.userId] === 'sleep') {
                  setActiveEmotes((prev) => ({ ...prev, [char.userId]: null }));
                  setEmoteBadges((prev) => {
                    const next = { ...prev };
                    delete next[char.userId];
                    return next;
                  });
                }
                setDraggingUserId(char.userId);
              } else {
                // 다른 유저 클릭 시 상호작용 팝업 메뉴 토글
                setInteractionTargetId((prev) =>
                  prev === char.userId ? null : char.userId
                );
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (isMe) {
                openQuickChatBar();
              }
            }}
            style={{
              position: 'absolute',
              left: `${char.x}%`,
              top: `${char.y}%`,
              transform: 'translate(-50%, -100%)',
              transition:
                isDragging || isFalling
                  ? 'none'
                  : 'left 2.4s linear, top 2.4s linear',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: isMe ? 'grab' : 'pointer',
              zIndex: isMe ? 30 : 20,
            }}
          >
            {/* 다른 유저 캐릭터 클릭 시 상호작용 팝업 메뉴 */}
            {!isMe && interactionTargetId === char.userId && (
              <div
                className="overlay-interaction-menu"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => handleSendInteraction(char, 'pet')}
                >
                  🫳 쓰다듬기
                </button>
                <button
                  type="button"
                  onClick={() => handleSendInteraction(char, 'poke')}
                >
                  👉 찌르기
                </button>
                <button
                  type="button"
                  onClick={() => handleSendInteraction(char, 'highfive')}
                >
                  🙌 하이파이브
                </button>
              </div>
            )}

            {/* 이모트 / 상호작용 리액션 배지 */}
            {emoteBadge && (
              <div className="overlay-emote-badge">{emoteBadge}</div>
            )}

            {/* 실시간 채팅 & 미니게임 말풍선 */}
            {bubbleData && (
              <div
                className={
                  bubbleData.isGame
                    ? 'overlay-speech-bubble game-bubble'
                    : 'overlay-speech-bubble'
                }
              >
                {bubbleData.gameBadge && (
                  <div className="game-result-highlight">
                    {bubbleData.gameBadge}
                  </div>
                )}
                <div>{bubbleData.text}</div>
              </div>
            )}

            {/* 캐릭터 아바타 */}
            <CharacterAvatar
              characterType={char.characterType}
              direction={char.direction}
              state={char.state}
              activeEmote={currentEmote}
              size={84}
            />

            {/* 닉네임 태그 & 코워킹 상태 배지 */}
            <div className="overlay-nametag-row">
              <span className={isMe ? 'overlay-nametag me' : 'overlay-nametag'}>
                <span title={statusInfo.label}>{statusInfo.emoji}</span>{' '}
                {char.nickname}
                {isMe ? ' (나)' : ''}
              </span>
            </div>
          </div>
        );
      })}

      {/* 바탕화면 위 미니 채팅 입력바 (Quick Chat: 내 캐릭터 더블클릭 또는 Alt+Enter) */}
      {quickChatOpen && myCharacter && (
        <div
          className="overlay-quickchat-container"
          onMouseEnter={() => window.electronAPI?.setIgnoreMouse(false)}
          style={{
            left: `${Math.max(18, Math.min(82, myCharacter.x))}%`,
            top: `${Math.min(92, myCharacter.y + 2)}%`,
          }}
        >
          <div className="quickchat-action-strip">
            {EMOTE_OPTIONS.map((em) => (
              <button
                key={em.type}
                type="button"
                className="quickchat-mini-btn"
                title={`${em.label} (${em.shortcut})`}
                onClick={() => handleQuickEmote(em.type)}
              >
                {em.emoji}
              </button>
            ))}
            <button
              type="button"
              className="quickchat-mini-btn game"
              title="주사위 굴리기 (/주사위)"
              onClick={() => handleQuickCommand('/주사위')}
            >
              🎲
            </button>
            <button
              type="button"
              className="quickchat-mini-btn game"
              title="가위바위보 (/가위바위보)"
              onClick={() => handleQuickCommand('/가위바위보')}
            >
              ✌️
            </button>
          </div>

          <form onSubmit={handleQuickChatSubmit} className="quickchat-form">
            <input
              ref={quickInputRef}
              type="text"
              className="quickchat-input"
              placeholder="말풍선 입력 (/주사위, /가위바위보 가능, Esc 닫기)"
              value={quickChatText}
              onChange={(e) => setQuickChatText(e.target.value)}
            />
            <button type="submit" className="quickchat-send-btn">
              전송
            </button>
            <button
              type="button"
              className="quickchat-close-btn"
              onClick={closeQuickChatBar}
            >
              ✕
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
