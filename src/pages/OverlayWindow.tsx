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
    Record<string, { text: string }>
  >({});
  const [gameBubbles, setGameBubbles] = useState<
    Record<string, { text: string; gameBadge?: string }>
  >({});
  const [emoteBadges, setEmoteBadges] = useState<Record<string, string>>({});
  const [activeEmotes, setActiveEmotes] = useState<
    Record<string, EmoteType | null>
  >({});

  // 캐릭터 월드 창 선택(포커스) 여부
  const [isWorldFocused, setIsWorldFocused] = useState<boolean>(false);

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

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
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
    setTimeout(() => {
      stageContainerRef.current?.focus();
    }, 30);
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
      setGameBubbles({});
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

    // 방 입장 시 최근 히스토리에서 각 유저의 마지막 직접 입력 채팅 말풍선만 복원 (미니게임 결과는 제외)
    socket.on('roomHistory', (history: ChatMessage[]) => {
      if (!Array.isArray(history)) return;
      const latestByUser: Record<string, { text: string }> = {};
      history.forEach((m) => {
        if (
          m.userId &&
          m.userId !== 'system' &&
          m.messageType !== 'system' &&
          m.messageType !== 'game'
        ) {
          latestByUser[m.userId] = {
            text: m.message,
          };
        }
      });
      setBubbles((prev) => ({ ...latestByUser, ...prev }));
    });

    // 채팅 및 미니게임 메시지 수신 -> 주사위/가위바위보(game)는 3초 뒤 소멸, 직접 입력 채팅은 계속 유지!
    socket.on('receiveMessage', (msg: ChatMessage) => {
      if (isDndRef.current || msg.userId === 'system' || msg.messageType === 'system') return;

      const senderChar = charactersRef.current[msg.userId];
      if (msg.messageType === 'game') {
        sound.playGameSound();
        setGameBubbles((prev) => ({
          ...prev,
          [msg.userId]: {
            text: msg.message,
            gameBadge: msg.gameResult?.badge,
          },
        }));

        if (bubbleTimersRef.current[msg.userId]) {
          clearTimeout(bubbleTimersRef.current[msg.userId]);
        }
        bubbleTimersRef.current[msg.userId] = setTimeout(() => {
          setGameBubbles((prev) => {
            const next = { ...prev };
            delete next[msg.userId];
            return next;
          });
        }, 3000);
      } else {
        sound.playBubblePop(senderChar?.characterType);
        setBubbles((prev) => ({
          ...prev,
          [msg.userId]: {
            text: msg.message,
          },
        }));
      }
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

  const stopWalkingToIdle = () => {
    if (!myInfo) return;
    const uid = myInfo.userId;
    setCharacters((prev) => {
      const me = prev[uid];
      if (!me || me.state === 'idle') return prev;
      const stoppedMe: CharacterState = {
        ...me,
        state: 'idle',
      };
      socketRef.current?.emit('moveCharacter', {
        roomId: myInfo.roomId,
        ...stoppedMe,
      });
      return { ...prev, [uid]: stoppedMe };
    });
  };

  const handleDirectionPressStart = (
    dirKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
    e: React.TouchEvent | React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!myInfo || quickChatOpen) return;

    stageContainerRef.current?.focus();
    setIsWorldFocused(true);

    if (activeEmotes[myInfo.userId] === 'sleep') {
      setActiveEmotes((prev) => ({ ...prev, [myInfo.userId]: null }));
      setEmoteBadges((prev) => {
        const next = { ...prev };
        delete next[myInfo.userId];
        return next;
      });
    }

    pressedKeysRef.current.add(dirKey);
  };

  const handleDirectionPressEnd = (
    dirKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
    e?: React.TouchEvent | React.MouseEvent
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    pressedKeysRef.current.delete(dirKey);
    if (pressedKeysRef.current.size === 0) {
      stopWalkingToIdle();
    }
  };

  // 캐릭터 월드 창 선택(포커스) 또는 모바일 터치 방향키(↑, ↓, ←, →)로 이동 및 걷기 모션(walk) 적용
  useEffect(() => {
    if (!myInfo || quickChatOpen) {
      pressedKeysRef.current.clear();
      return;
    }

    const ARROW_KEYS = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]);
    const STEP_SPEED = 1.35; // 틱당 이동량 (%)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isWorldFocused) return;
      // 입력창(input/textarea) 포커스 중에는 방향키 캐릭터 이동 무시
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (!ARROW_KEYS.has(e.key)) return;
      e.preventDefault();

      // 잠자기(sleep) 상태였다면 깨우기
      if (activeEmotes[myInfo.userId] === 'sleep') {
        setActiveEmotes((prev) => ({ ...prev, [myInfo.userId]: null }));
        setEmoteBadges((prev) => {
          const next = { ...prev };
          delete next[myInfo.userId];
          return next;
        });
      }

      pressedKeysRef.current.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!ARROW_KEYS.has(e.key)) return;
      e.preventDefault();
      pressedKeysRef.current.delete(e.key);

      if (pressedKeysRef.current.size === 0) {
        stopWalkingToIdle();
      }
    };

    const moveInterval = setInterval(() => {
      if (pressedKeysRef.current.size === 0) return;

      let dx = 0;
      let dy = 0;
      if (pressedKeysRef.current.has('ArrowLeft')) dx -= STEP_SPEED;
      if (pressedKeysRef.current.has('ArrowRight')) dx += STEP_SPEED;
      if (pressedKeysRef.current.has('ArrowUp')) dy -= STEP_SPEED;
      if (pressedKeysRef.current.has('ArrowDown')) dy += STEP_SPEED;

      if (dx === 0 && dy === 0) return;

      // 대각선 이동 시 속도 정규화
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      setCharacters((prev) => {
        const me = prev[myInfo.userId];
        if (!me) return prev;

        const nextX = Math.max(6, Math.min(94, me.x + dx));
        const nextY = Math.max(18, Math.min(95, me.y + dy));
        const direction =
          dx < 0 ? 'left' : dx > 0 ? 'right' : me.direction;

        const walkingMe: CharacterState = {
          ...me,
          x: Number(nextX.toFixed(2)),
          y: Number(nextY.toFixed(2)),
          direction,
          state: 'walk', // 방향키 이동 중 움직이는 걷기 모션!
        };

        socketRef.current?.emit('moveCharacter', {
          roomId: myInfo.roomId,
          ...walkingMe,
        });

        return { ...prev, [myInfo.userId]: walkingMe };
      });
    }, 36);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      clearInterval(moveInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      pressedKeysRef.current.clear();
      stopWalkingToIdle();
    };
  }, [myInfo, isWorldFocused, quickChatOpen, activeEmotes]);

  // 상단 바 버튼 클릭 시 또는 방 입장 시 자동으로 캐릭터 월드 포커스하여 방향키 이동 가능하도록 처리
  useEffect(() => {
    const focusStage = () => {
      setQuickChatOpen(false);
      setQuickChatText('');
      setTimeout(() => {
        stageContainerRef.current?.focus();
        setIsWorldFocused(true);
      }, 10);
    };

    if (embeddedRoomData) {
      focusStage();
    }

    window.addEventListener('deskmate:focus-world', focusStage);
    return () => window.removeEventListener('deskmate:focus-world', focusStage);
  }, [embeddedRoomData]);

  // 오버레이 내 단축키(스페이스바 채팅 입력란 열기, Alt+1~5 이모트, Esc 닫기)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && quickChatOpen) {
        closeQuickChatBar();
        return;
      }

      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isTypingInInput =
        activeTag === 'input' || activeTag === 'textarea';

      // 스페이스바 입력 시 채팅 입력란(Quick Chat) 열기
      if (
        (e.code === 'Space' || e.key === ' ') &&
        !quickChatOpen &&
        !isTypingInInput &&
        myInfo
      ) {
        e.preventDefault();
        openQuickChatBar();
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
      ref={stageContainerRef}
      className="overlay-stage-container"
      tabIndex={0}
      onFocus={() => setIsWorldFocused(true)}
      onBlur={() => setIsWorldFocused(false)}
      onMouseDown={() => {
        stageContainerRef.current?.focus();
      }}
      style={{
        width: embeddedRoomData ? '100%' : '100vw',
        height: embeddedRoomData ? '100%' : '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
        outline: isWorldFocused ? '3px solid #4f46e5' : 'none',
        outlineOffset: '-3px',
        borderRadius: embeddedRoomData ? '12px' : '0px',
        cursor: 'pointer',
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
        const gameBubbleData = gameBubbles[char.userId];
        const chatBubbleData = bubbles[char.userId];
        const emoteBadge = emoteBadges[char.userId];
        const currentEmote = activeEmotes[char.userId] || null;
        const statusInfo = getStatusBadgeDisplay(char.statusBadge);

        return (
          <div
            key={char.userId}
            onMouseEnter={() => window.electronAPI?.setIgnoreMouse(false)}
            onMouseLeave={() => {
              if (!quickChatOpen && !interactionTargetId) {
                window.electronAPI?.setIgnoreMouse(true);
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              stageContainerRef.current?.focus();
              if (!isMe) {
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
              transition: isMe ? 'none' : 'left 0.08s linear, top 0.08s linear',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
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

            {/* 주사위·가위바위보 미니게임 결과 말풍선 (3초 뒤 자동 소멸) */}
            {gameBubbleData && (
              <div className="overlay-speech-bubble game-bubble">
                {gameBubbleData.gameBadge && (
                  <div className="game-result-highlight">
                    {gameBubbleData.gameBadge}
                  </div>
                )}
                <div>{gameBubbleData.text}</div>
              </div>
            )}

            {/* 직접 입력한 실시간 채팅 말풍선 (지속 유지) */}
            {!gameBubbleData && chatBubbleData && (
              <div className="overlay-speech-bubble">
                <div>{chatBubbleData.text}</div>
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

            {/* 내 캐릭터 닉네임 하단 [💬 스페이스바] 버튼 (스페이스바 키 또는 클릭 시 빠른 채팅 항목 표시) */}
            {isMe && (
              <button
                type="button"
                className="character-chat-open-btn"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  openQuickChatBar();
                }}
              >
                💬 스페이스바
              </button>
            )}
          </div>
        );
      })}

      {/* 바탕화면 위 미니 채팅 입력바 (Quick Chat: 내 캐릭터 하단 [채팅 입력] 버튼, 더블클릭 또는 Alt+Enter) */}
      {quickChatOpen && myCharacter && (
        <div
          className="overlay-quickchat-container"
          onMouseEnter={() => window.electronAPI?.setIgnoreMouse(false)}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            left: `${Math.max(20, Math.min(80, myCharacter.x))}%`,
            top: `${Math.max(15, Math.min(76, myCharacter.y + 2))}%`,
          }}
        >
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

      {/* 모바일 버전 전용: 좌측 하단 투명 방향키 & 우측 하단 투명 채팅 버튼 */}
      {myInfo && (
        <div
          className="mobile-world-controls"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mobile-dpad-container">
            <div className="mobile-dpad-row">
              <button
                type="button"
                className="mobile-dpad-btn"
                aria-label="위로 이동"
                onTouchStart={(e) => handleDirectionPressStart('ArrowUp', e)}
                onTouchEnd={(e) => handleDirectionPressEnd('ArrowUp', e)}
                onTouchCancel={(e) => handleDirectionPressEnd('ArrowUp', e)}
                onMouseDown={(e) => handleDirectionPressStart('ArrowUp', e)}
                onMouseUp={(e) => handleDirectionPressEnd('ArrowUp', e)}
                onMouseLeave={() => handleDirectionPressEnd('ArrowUp')}
              >
                ▲
              </button>
            </div>
            <div className="mobile-dpad-row">
              <button
                type="button"
                className="mobile-dpad-btn"
                aria-label="왼쪽으로 이동"
                onTouchStart={(e) => handleDirectionPressStart('ArrowLeft', e)}
                onTouchEnd={(e) => handleDirectionPressEnd('ArrowLeft', e)}
                onTouchCancel={(e) => handleDirectionPressEnd('ArrowLeft', e)}
                onMouseDown={(e) => handleDirectionPressStart('ArrowLeft', e)}
                onMouseUp={(e) => handleDirectionPressEnd('ArrowLeft', e)}
                onMouseLeave={() => handleDirectionPressEnd('ArrowLeft')}
              >
                ◀
              </button>
              <button
                type="button"
                className="mobile-dpad-btn"
                aria-label="아래로 이동"
                onTouchStart={(e) => handleDirectionPressStart('ArrowDown', e)}
                onTouchEnd={(e) => handleDirectionPressEnd('ArrowDown', e)}
                onTouchCancel={(e) => handleDirectionPressEnd('ArrowDown', e)}
                onMouseDown={(e) => handleDirectionPressStart('ArrowDown', e)}
                onMouseUp={(e) => handleDirectionPressEnd('ArrowDown', e)}
                onMouseLeave={() => handleDirectionPressEnd('ArrowDown')}
              >
                ▼
              </button>
              <button
                type="button"
                className="mobile-dpad-btn"
                aria-label="오른쪽으로 이동"
                onTouchStart={(e) => handleDirectionPressStart('ArrowRight', e)}
                onTouchEnd={(e) => handleDirectionPressEnd('ArrowRight', e)}
                onTouchCancel={(e) => handleDirectionPressEnd('ArrowRight', e)}
                onMouseDown={(e) => handleDirectionPressStart('ArrowRight', e)}
                onMouseUp={(e) => handleDirectionPressEnd('ArrowRight', e)}
                onMouseLeave={() => handleDirectionPressEnd('ArrowRight')}
              >
                ▶
              </button>
            </div>
          </div>

          <button
            type="button"
            className="mobile-chat-btn"
            onClick={(e) => {
              e.stopPropagation();
              openQuickChatBar();
            }}
          >
            💬 채팅
          </button>
        </div>
      )}
    </div>
  );
}
