import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import {
  CHARACTER_OPTIONS,
  CharacterAvatar,
  EMOTE_OPTIONS,
  STATUS_BADGE_OPTIONS,
} from '../components/CharacterAvatar';
import OverlayWindow from './OverlayWindow';
import { api } from '../services/api';
import { createSocketConnection } from '../services/socket';
import {
  CharacterState,
  CharacterType,
  ChatMessage,
  DisplayInfo,
  EmoteType,
  PomodoroState,
  RoomSummary,
  StatusBadgeType,
  User,
} from '../types';
import { sound } from '../utils/sound';

type Step = 'LOGIN' | 'SELECT_CHAR' | 'LOBBY' | 'CHAT_ROOM';

export default function MainWindow() {
  const [step, setStep] = useState<Step>('LOGIN');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [dbMode, setDbMode] = useState<string>('확인 중...');

  // 인증 입력 상태
  const [userIdInput, setUserIdInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');

  // 로그인된 사용자 정보
  const [user, setUser] = useState<User | null>(null);
  const [selectedChar, setSelectedChar] = useState<CharacterType>('cat');
  const [myStatusBadge, setMyStatusBadge] = useState<StatusBadgeType>('online');

  // 로비 & 방 상태 (비밀방 비밀번호, 초대 코드 포함)
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPassword, setNewRoomPassword] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [currentRoom, setCurrentRoom] = useState<RoomSummary | null>(null);

  // 비밀방 입장 시 비밀번호 입력 모달 상태
  const [passwordModalRoom, setPasswordModalRoom] =
    useState<RoomSummary | null>(null);
  const [roomPasswordAttempt, setRoomPasswordAttempt] = useState('');

  // 채팅창 & 포모도로 상태
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomUsers, setRoomUsers] = useState<Record<string, CharacterState>>({});
  const [pomodoro, setPomodoro] = useState<PomodoroState>({
    mode: 'focus',
    remainingSeconds: 25 * 60,
    isRunning: false,
    updatedBy: null,
  });

  // 데스크톱 편의성 설정
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number>(0);
  const [isOverlayHidden, setIsOverlayHidden] = useState<boolean>(false);
  const [isDndMode, setIsDndMode] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(sound.isMuted());
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // 에러 / 로딩 표시
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .checkHealth()
      .then((res) => {
        setDbMode(
          res.dbMode === 'supabase' ? 'Supabase DB' : '로컬 메모리 폴백'
        );
      })
      .catch(() => {
        setDbMode('서버 대기 중');
      });

    window.electronAPI?.getDisplays().then((info) => {
      setDisplays(info.displays);
      setSelectedDisplayId(info.selectedDisplayId);
      setIsOverlayHidden(info.isOverlayHidden);
      setIsDndMode(info.isDndMode);
      sound.setDnd(info.isDndMode);
    });

    const removeSettingsListener = window.electronAPI?.onAppSettingsUpdated(
      (settings) => {
        setIsOverlayHidden(settings.isOverlayHidden);
        setIsDndMode(settings.isDndMode);
        setSelectedDisplayId(settings.selectedDisplayId);
        sound.setDnd(settings.isDndMode);
      }
    );

    return () => {
      removeSettingsListener?.();
    };
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sound.setMuted(next);
  };

  const handleSelectDisplay = (displayId: number) => {
    setSelectedDisplayId(displayId);
    window.electronAPI?.moveOverlayDisplay(displayId);
  };

  // 1. 로그인 또는 회원가입 처리
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      const response =
        authMode === 'login'
          ? await api.login({ id: userIdInput, password: passwordInput })
          : await api.register({
              id: userIdInput,
              password: passwordInput,
              nickname: nicknameInput,
            });

      setUser(response.user);
      setDbMode(
        response.dbMode === 'supabase' ? 'Supabase DB' : '로컬 메모리 폴백'
      );

      if (response.user.characterType === null) {
        setStep('SELECT_CHAR');
      } else {
        await fetchRoomList();
        setStep('LOBBY');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 2. 5종 Rive 캐릭터 선택 및 DB 저장
  const handleSaveCharacter = async () => {
    if (!user) return;
    setErrorMsg(null);
    setLoading(true);

    try {
      const res = await api.selectCharacter({
        userId: user.userId,
        characterType: selectedChar,
      });
      setUser(res.user);
      sound.playBubblePop(selectedChar);
      await fetchRoomList();
      setStep('LOBBY');
    } catch (err: any) {
      setErrorMsg(err.message || '캐릭터 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 캐릭터 초기화 후 재선택 화면으로 이동
  const handleResetCharacter = async () => {
    if (!user) return;
    setErrorMsg(null);
    try {
      await api.resetCharacters(user.userId);
      setUser({ ...user, characterType: null });
      setSelectedChar('cat');
      setStep('SELECT_CHAR');
    } catch (err: any) {
      setErrorMsg(err.message || '캐릭터 초기화에 실패했습니다.');
    }
  };

  // 3. 로비 방 목록 조회
  const fetchRoomList = async () => {
    try {
      const res = await api.getRooms();
      setRooms(res.rooms);
    } catch (err: any) {
      setErrorMsg(err.message || '방 목록을 불러오지 못했습니다.');
    }
  };

  // 새 방 생성
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setErrorMsg(null);

    try {
      const res = await api.createRoom(
        newRoomName.trim(),
        newRoomPassword.trim() || undefined
      );
      setNewRoomName('');
      setNewRoomPassword('');
      await fetchRoomList();
      connectAndEnterRoom(res.room);
    } catch (err: any) {
      setErrorMsg(err.message || '방 생성에 실패했습니다.');
    }
  };

  // 초대 코드로 방 입장
  const handleJoinByInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;
    setErrorMsg(null);

    try {
      const res = await api.joinRoomByCode(inviteCodeInput.trim());
      setInviteCodeInput('');
      handleRequestEnterRoom(res.room);
    } catch (err: any) {
      setErrorMsg(err.message || '유효하지 않은 초대 코드입니다.');
    }
  };

  const handleRequestEnterRoom = (room: RoomSummary) => {
    setErrorMsg(null);
    if (room.isPrivate) {
      setPasswordModalRoom(room);
      setRoomPasswordAttempt('');
      return;
    }
    connectAndEnterRoom(room);
  };

  const handleConfirmSecretRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalRoom) return;
    setErrorMsg(null);

    try {
      const res = await api.verifyRoomPassword(
        passwordModalRoom.roomId,
        roomPasswordAttempt
      );
      setPasswordModalRoom(null);
      setRoomPasswordAttempt('');
      connectAndEnterRoom(res.room);
    } catch (err: any) {
      setErrorMsg(err.message || '비밀번호가 일치하지 않습니다.');
    }
  };

  // 4. 실제 방 입장 및 바탕화면 오버레이 활성화
  const connectAndEnterRoom = (room: RoomSummary) => {
    if (!user || !user.characterType) return;

    setCurrentRoom(room);
    setMessages([]);
    setStep('CHAT_ROOM');

    const overlayPayload = {
      roomId: room.roomId,
      roomName: room.roomName,
      userId: user.userId,
      nickname: user.nickname,
      characterType: user.characterType,
      statusBadge: myStatusBadge,
    };

    // Electron IPC로 바탕화면 오버레이 창 활성화
    window.electronAPI?.enterRoom(overlayPayload);

    // 만약 일반 웹 브라우저(Vercel URL)에서 접속한 경우에도 로컬 PC에서 실행 중인 Electron 바탕화면 오버레이 브릿지(127.0.0.1:45678)를 깨움!
    if (!window.electronAPI) {
      fetch('http://127.0.0.1:45678/enter-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlayPayload),
      }).catch(() => {
        // 로컬 Electron 앱이 아직 안 켜져 있으면 아래 deskmate:// 버튼으로 실행 가능
      });
    }

    socketRef.current?.disconnect();
    const socket = createSocketConnection();
    socketRef.current = socket;

    socket.emit('joinRoom', {
      ...overlayPayload,
      clientType: 'main',
    });

    socket.on('roomStateUpdate', (users: Record<string, CharacterState>) => {
      setRoomUsers(users);
    });

    socket.on('roomHistory', (history: ChatMessage[]) => {
      setMessages(history);
    });

    socket.on('receiveMessage', (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('pomodoroUpdate', (pomo: PomodoroState) => {
      setPomodoro(pomo);
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !user || !currentRoom || !socketRef.current) return;

    socketRef.current.emit('sendMessage', {
      roomId: currentRoom.roomId,
      userId: user.userId,
      nickname: user.nickname,
      message: chatInput.trim(),
    });
    setChatInput('');
  };

  const handleSendGameCommand = (cmd: string) => {
    if (!user || !currentRoom || !socketRef.current) return;
    socketRef.current.emit('sendMessage', {
      roomId: currentRoom.roomId,
      userId: user.userId,
      nickname: user.nickname,
      message: cmd,
    });
  };

  const handleTriggerEmote = (emoteType: EmoteType) => {
    if (!user || !currentRoom || !socketRef.current) return;
    socketRef.current.emit('triggerEmote', {
      roomId: currentRoom.roomId,
      userId: user.userId,
      emoteType,
    });
  };

  const handleChangeStatusBadge = (nextStatus: StatusBadgeType) => {
    setMyStatusBadge(nextStatus);
    if (user && currentRoom && socketRef.current) {
      socketRef.current.emit('updateStatus', {
        roomId: currentRoom.roomId,
        userId: user.userId,
        statusBadge: nextStatus,
      });
    }
  };

  const handlePomodoroControl = (
    action: 'start' | 'pause' | 'reset' | 'switchMode'
  ) => {
    if (!user || !currentRoom || !socketRef.current) return;
    socketRef.current.emit('pomodoroControl', {
      roomId: currentRoom.roomId,
      action,
      nickname: user.nickname,
    });
  };

  const handleCopyInviteCode = () => {
    if (!currentRoom?.inviteCode) return;
    navigator.clipboard?.writeText(currentRoom.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleLeaveRoom = async () => {
    if (user && currentRoom && socketRef.current) {
      socketRef.current.emit('leaveRoom', {
        roomId: currentRoom.roomId,
        userId: user.userId,
      });
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    window.electronAPI?.leaveRoom();
    if (!window.electronAPI) {
      fetch('http://127.0.0.1:45678/leave-room', { method: 'POST' }).catch(
        () => {}
      );
    }
    setCurrentRoom(null);
    setRoomUsers({});
    await fetchRoomList();
    setStep('LOBBY');
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="main-window-shell">
      {/* 상단 헤더 & 글로벌 유틸리티 바 */}
      <header className="main-header">
        <div>
          <h1 className="brand-title">DeskMate</h1>
          <p className="brand-subtitle">바탕화면 멀티플레이어 Rive 캐릭터 채팅</p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className={isMuted ? 'icon-pill-btn off' : 'icon-pill-btn'}
            title="효과음 켜기/끄기"
            onClick={handleToggleMute}
          >
            {isMuted ? '🔇 음소거' : '🔊 효과음'}
          </button>
          <button
            type="button"
            className={isDndMode ? 'icon-pill-btn dnd-on' : 'icon-pill-btn'}
            title="방해 금지 모드 (말풍선/알림음 차단)"
            onClick={() => window.electronAPI?.toggleDndMode()}
          >
            {isDndMode ? '🌙 방해금지 ON' : '🌙 방해금지'}
          </button>
          <span className="db-badge">{dbMode}</span>
        </div>
      </header>

      {/* 다중 모니터 선택 및 오버레이 토글 바 */}
      {displays.length > 0 && (
        <div className="desktop-toolbar">
          <div className="monitor-select-wrap">
            <span className="toolbar-label">🖥️ 모니터:</span>
            <select
              className="monitor-select"
              value={selectedDisplayId}
              onChange={(e) => handleSelectDisplay(Number(e.target.value))}
            >
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="ghost-btn small"
            title="단축키: Alt + H"
            onClick={() => window.electronAPI?.toggleOverlayVisibility()}
          >
            {isOverlayHidden ? '👁️ 오버레이 보이기' : '🙈 오버레이 숨기기'}
          </button>
        </div>
      )}

      {errorMsg && <div className="error-banner">{errorMsg}</div>}

      {/* STEP 1: 로그인 / 회원가입 */}
      {step === 'LOGIN' && (
        <section className="card-panel">
          <div className="tab-group">
            <button
              type="button"
              className={authMode === 'login' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => {
                setAuthMode('login');
                setErrorMsg(null);
              }}
            >
              로그인
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => {
                setAuthMode('register');
                setErrorMsg(null);
              }}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="form-stack">
            <label className="field-label">
              아이디
              <input
                type="text"
                className="text-input"
                placeholder="사용할 아이디 입력"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                required
              />
            </label>

            <label className="field-label">
              비밀번호
              <input
                type="password"
                className="text-input"
                placeholder="비밀번호 입력"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
              />
            </label>

            {authMode === 'register' && (
              <label className="field-label">
                닉네임
                <input
                  type="text"
                  className="text-input"
                  placeholder="바탕화면에 표시될 닉네임"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  required
                />
              </label>
            )}

            <button type="submit" className="primary-btn" disabled={loading}>
              {loading
                ? '처리 중...'
                : authMode === 'login'
                ? '로그인하고 시작하기'
                : '계정 생성하기'}
            </button>
          </form>
        </section>
      )}

      {/* STEP 2: 5종 Rive 동물 캐릭터 선택 */}
      {step === 'SELECT_CHAR' && user && (
        <section className="card-panel">
          <h2 className="section-title">
            {user.nickname}님, Rive 동물 캐릭터를 선택해 주세요!
          </h2>
          <p className="section-desc">
            고양이 · 강아지 · 팬더 · 호랑이 · 돼지 중 나만의 바탕화면 메이트를 골라보세요.
          </p>

          <div className="char-grid">
            {CHARACTER_OPTIONS.map((item) => {
              const isSelected = selectedChar === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  className={isSelected ? 'char-card selected' : 'char-card'}
                  onClick={() => {
                    setSelectedChar(item.type);
                    sound.playBubblePop(item.type);
                  }}
                >
                  <CharacterAvatar
                    characterType={item.type}
                    size={68}
                    state={isSelected ? 'walk' : 'idle'}
                    activeEmote={isSelected ? 'wave' : null}
                  />
                  <div className="char-card-info">
                    <div className="char-title-row">
                      <strong>{item.name}</strong>
                      <span className="rive-tag">{item.badge}</span>
                    </div>
                    <span>{item.description}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="primary-btn"
            onClick={handleSaveCharacter}
            disabled={loading}
          >
            {loading ? '저장 중...' : '이 캐릭터로 결정하기'}
          </button>
        </section>
      )}

      {/* STEP 3: 방 목록 및 생성 로비 */}
      {step === 'LOBBY' && user && (
        <section className="card-panel lobby-panel">
          <div className="user-summary-bar">
            <div className="user-summary-left">
              <CharacterAvatar
                characterType={user.characterType || 'cat'}
                size={48}
                state="idle"
              />
              <div>
                <strong>{user.nickname}</strong>
                <span className="sub-id">
                  @{user.userId} ·{' '}
                  {
                    CHARACTER_OPTIONS.find((c) => c.type === user.characterType)
                      ?.name
                  }
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setSelectedChar(user.characterType || 'cat');
                  setStep('SELECT_CHAR');
                }}
              >
                캐릭터 변경
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={handleResetCharacter}
                title="캐릭터 선택 정보를 초기화하고 다시 고릅니다"
              >
                초기화
              </button>
            </div>
          </div>

          {/* 새 방 생성 */}
          <form onSubmit={handleCreateRoom} className="room-create-stack">
            <div className="room-create-row">
              <input
                type="text"
                className="text-input"
                placeholder="새 방 이름 (예: 개발팀 코워킹방)"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
              <input
                type="password"
                className="text-input pw-input"
                placeholder="비밀번호 (선택)"
                value={newRoomPassword}
                onChange={(e) => setNewRoomPassword(e.target.value)}
              />
              <button type="submit" className="secondary-btn">
                방 만들기
              </button>
            </div>
          </form>

          {/* 초대 코드로 입장 */}
          <form onSubmit={handleJoinByInviteCode} className="room-create-row">
            <input
              type="text"
              className="text-input"
              placeholder="초대 코드 6자리로 바로 입장 (예: PLAZA1)"
              value={inviteCodeInput}
              onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
              maxLength={10}
            />
            <button type="submit" className="ghost-btn">
              코드로 입장
            </button>
          </form>

          {/* 비밀방 비밀번호 입력 모달 */}
          {passwordModalRoom && (
            <form
              onSubmit={handleConfirmSecretRoom}
              className="secret-room-box"
            >
              <div className="secret-room-title">
                🔒 <strong>{passwordModalRoom.roomName}</strong> 비밀번호 입력
              </div>
              <div className="room-create-row">
                <input
                  type="password"
                  className="text-input"
                  placeholder="방 비밀번호 입력"
                  value={roomPasswordAttempt}
                  onChange={(e) => setRoomPasswordAttempt(e.target.value)}
                  autoFocus
                  required
                />
                <button type="submit" className="primary-btn small">
                  확인
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setPasswordModalRoom(null)}
                >
                  취소
                </button>
              </div>
            </form>
          )}

          <div className="room-list-header">
            <h3>참여 가능한 방 목록</h3>
            <button type="button" className="ghost-btn" onClick={fetchRoomList}>
              새로고침
            </button>
          </div>

          <div className="room-list">
            {rooms.map((room) => (
              <div key={room.roomId} className="room-item">
                <div>
                  <strong>
                    {room.isPrivate ? '🔒 ' : '🌐 '}
                    {room.roomName}
                  </strong>
                  <span className="room-count">
                    현재 {room.userCount}명 접속 중 · 코드:{' '}
                    <code>{room.inviteCode}</code>
                  </span>
                </div>
                <button
                  type="button"
                  className="primary-btn small"
                  onClick={() => handleRequestEnterRoom(room)}
                >
                  입장하기
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* STEP 4: 채팅 & 코워킹 컨트롤러 */}
      {step === 'CHAT_ROOM' && user && currentRoom && (
        <section className="card-panel chat-panel">
          <div className="chat-room-header">
            <div>
              <div className="room-title-line">
                <strong>
                  {currentRoom.isPrivate ? '🔒 ' : ''}
                  {currentRoom.roomName}
                </strong>
                {currentRoom.inviteCode && (
                  <button
                    type="button"
                    className="invite-code-chip"
                    onClick={handleCopyInviteCode}
                    title="클릭하여 초대 코드 복사"
                  >
                    {copiedCode
                      ? '✅ 복사됨!'
                      : `코드: ${currentRoom.inviteCode}`}
                  </button>
                )}
              </div>
              <span className="online-count">
                접속 캐릭터 {Object.keys(roomUsers).length}명 · 내 캐릭터 더블클릭
                또는 Alt+Enter로 바탕화면 빠른 채팅!
              </span>
            </div>
            <button
              type="button"
              className="danger-btn"
              onClick={handleLeaveRoom}
            >
              방 나가기
            </button>
          </div>

          {/* 코워킹 상태 배지 선택 & 공유 포모도로 타이머 */}
          <div className="cowork-panel">
            <div className="status-selector-row">
              <span className="cowork-label">내 상태:</span>
              <div className="status-pill-list">
                {STATUS_BADGE_OPTIONS.map((st) => (
                  <button
                    key={st.type}
                    type="button"
                    className={
                      myStatusBadge === st.type
                        ? 'status-pill active'
                        : 'status-pill'
                    }
                    onClick={() => handleChangeStatusBadge(st.type)}
                  >
                    {st.emoji} {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pomodoro-bar">
              <div className="pomodoro-info">
                <span className="pomodoro-mode-tag">
                  {pomodoro.mode === 'focus' ? '🍅 25분 집중' : '☕ 5분 휴식'}
                </span>
                <strong className="pomodoro-clock">
                  {formatTimer(pomodoro.remainingSeconds)}
                </strong>
              </div>
              <div className="pomodoro-btns">
                {pomodoro.isRunning ? (
                  <button
                    type="button"
                    className="ghost-btn small"
                    onClick={() => handlePomodoroControl('pause')}
                  >
                    ⏸ 일시정지
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-btn small"
                    onClick={() => handlePomodoroControl('start')}
                  >
                    ▶ 함께 시작
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-btn small"
                  onClick={() => handlePomodoroControl('switchMode')}
                >
                  🔄 전환
                </button>
                <button
                  type="button"
                  className="ghost-btn small"
                  onClick={() => handlePomodoroControl('reset')}
                >
                  ↺ 리셋
                </button>
              </div>
            </div>
          </div>

          {/* 감정 표현(이모트) & 미니게임 퀵 액션 바 */}
          <div className="action-bar-row">
            <div className="emote-btn-group">
              {EMOTE_OPTIONS.map((em) => (
                <button
                  key={em.type}
                  type="button"
                  className="emote-chip-btn"
                  title={`${em.label} (${em.shortcut})`}
                  onClick={() => handleTriggerEmote(em.type)}
                >
                  {em.emoji} {em.label}
                </button>
              ))}
            </div>
            <div className="minigame-btn-group">
              <button
                type="button"
                className="game-chip-btn"
                onClick={() => handleSendGameCommand('/주사위')}
              >
                🎲 주사위
              </button>
              <button
                type="button"
                className="game-chip-btn"
                onClick={() => handleSendGameCommand('/가위바위보')}
              >
                ✌️ 가위바위보
              </button>
            </div>
          </div>

          {/* 웹 브라우저(Vercel 등 Electron이 없는 환경)에서 접속 시 내장 Rive 캐릭터 오버레이 스테이지 및 Windows 바탕화면 실행 버튼 표시 */}
          {!window.electronAPI && user.characterType && (
            <div className="web-embedded-overlay-stage">
              <div className="web-stage-top-bar">
                <span className="web-stage-badge">
                  🖥️ 웹 미리보기 스테이지 (캐릭터 드래그 가능)
                </span>
                <a
                  className="launch-desktop-overlay-btn"
                  href={`deskmate://enter-room?roomId=${encodeURIComponent(
                    currentRoom.roomId
                  )}&roomName=${encodeURIComponent(
                    currentRoom.roomName
                  )}&userId=${encodeURIComponent(
                    user.userId
                  )}&nickname=${encodeURIComponent(
                    user.nickname
                  )}&characterType=${encodeURIComponent(
                    user.characterType
                  )}&statusBadge=${encodeURIComponent(myStatusBadge)}`}
                  onClick={() => {
                    fetch('http://127.0.0.1:45678/enter-room', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        roomId: currentRoom.roomId,
                        roomName: currentRoom.roomName,
                        userId: user.userId,
                        nickname: user.nickname,
                        characterType: user.characterType,
                        statusBadge: myStatusBadge,
                      }),
                    }).catch(() => {});
                  }}
                >
                  🚀 Windows 바탕화면에 캐릭터 띄우기
                </a>
              </div>
              <OverlayWindow
                embeddedRoomData={{
                  roomId: currentRoom.roomId,
                  roomName: currentRoom.roomName,
                  userId: user.userId,
                  nickname: user.nickname,
                  characterType: user.characterType,
                  statusBadge: myStatusBadge,
                }}
              />
            </div>
          )}

          {/* 실시간 채팅 메시지 영역 */}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <p className="empty-chat">
                아직 대화가 없습니다. 첫 메시지나 🎲 주사위를 굴려보세요!
              </p>
            ) : (
              messages.map((m) => {
                if (m.messageType === 'system') {
                  return (
                    <div key={m.id} className="chat-system-notice">
                      {m.message}
                    </div>
                  );
                }

                const isMine = m.userId === user.userId;
                const isGame = m.messageType === 'game';
                return (
                  <div
                    key={m.id}
                    className={isMine ? 'chat-item mine' : 'chat-item'}
                  >
                    <div className="chat-meta">
                      <strong>{m.nickname}</strong>
                      <span>{m.timestamp}</span>
                    </div>
                    <div
                      className={
                        isGame ? 'chat-bubble-box game' : 'chat-bubble-box'
                      }
                    >
                      {m.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* 채팅 입력 바 */}
          <form onSubmit={handleSendMessage} className="chat-input-row">
            <input
              type="text"
              className="text-input"
              placeholder="메시지 또는 /주사위, /가위바위보 입력..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit" className="primary-btn small">
              전송
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
