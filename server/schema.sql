-- =========================================================
-- DeskMate v2 - Supabase PostgreSQL 스키마 (server/schema.sql)
-- Supabase SQL Editor에서 실행하여 테이블 및 RLS 정책을 생성하세요.
-- =========================================================

-- 1. 사용자 테이블 (users)
CREATE TABLE IF NOT EXISTS public.users (
    id VARCHAR(50) PRIMARY KEY,                  -- 사용자 로그인 아이디
    password_hash VARCHAR(255) NOT NULL,         -- 암호화된 비밀번호 (bcryptjs)
    nickname VARCHAR(50) NOT NULL,               -- 표시될 닉네임
    character_type VARCHAR(30) DEFAULT NULL,     -- 선택한 캐릭터 종류 ('cat' | 'dog' | 'panda' | 'tiger' | 'pig' | NULL)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 캐릭터 선택값 전체 초기화 (신규 5종 Rive 캐릭터 재선택용)
UPDATE public.users SET character_type = NULL;

CREATE INDEX IF NOT EXISTS idx_users_nickname ON public.users (nickname);

-- 2. 멀티플레이어 방 테이블 (rooms) - 비밀방 & 초대 코드 지원
CREATE TABLE IF NOT EXISTS public.rooms (
    room_id VARCHAR(64) PRIMARY KEY,             -- 방 고유 ID
    room_name VARCHAR(100) NOT NULL,             -- 방 이름
    is_private BOOLEAN DEFAULT FALSE,            -- 비밀방 여부
    password_hash VARCHAR(255) DEFAULT NULL,     -- 비밀방 암호화 비밀번호
    invite_code VARCHAR(16) UNIQUE NOT NULL,     -- 6자리 초대 코드 (예: DM7X9K)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON public.rooms (invite_code);

-- 3. 채팅 기록 테이블 (messages) - 방 입장 시 이전 대화 불러오기 지원
CREATE TABLE IF NOT EXISTS public.messages (
    id VARCHAR(64) PRIMARY KEY,                  -- 메시지 고유 ID
    room_id VARCHAR(64) NOT NULL,                -- 방 ID
    user_id VARCHAR(50) NOT NULL,                -- 작성자 ID
    nickname VARCHAR(50) NOT NULL,               -- 작성자 닉네임
    message TEXT NOT NULL,                       -- 메시지 본문
    message_type VARCHAR(20) DEFAULT 'chat',     -- 'chat' | 'system' | 'game'
    game_result JSONB DEFAULT NULL,              -- 미니게임 결과 메타데이터 (주사위/가위바위보 등)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON public.messages (room_id, created_at DESC);

-- =========================================================
-- Row Level Security (RLS) 설정
-- =========================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow backend access to users" ON public.users;
CREATE POLICY "Allow backend access to users"
    ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend access to rooms" ON public.rooms;
CREATE POLICY "Allow backend access to rooms"
    ON public.rooms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow backend access to messages" ON public.messages;
CREATE POLICY "Allow backend access to messages"
    ON public.messages FOR ALL USING (true) WITH CHECK (true);
