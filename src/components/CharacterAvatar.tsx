import React, { useEffect, useRef } from 'react';
import {
  Alignment,
  Fit,
  Layout,
  useRive,
  useStateMachineInput,
} from '@rive-app/react-canvas';
import { CharacterType, EmoteType, StatusBadgeType } from '../types';

interface CharacterAvatarProps {
  characterType: CharacterType;
  direction?: 'left' | 'right';
  state?: 'idle' | 'walk';
  activeEmote?: EmoteType | null;
  size?: number;
  /**
   * 커스텀 .riv 파일 경로를 지정하면 @rive-app/react-canvas의 WebAssembly useRive 엔진으로 직접 로드합니다.
   * 미지정 시 내장 60FPS Rive-Canvas 스켈레톤(Bone) 상태 머신 렌더러로 5종 동물을 렌더링합니다.
   */
  riveSrc?: string;
}

export const CHARACTER_OPTIONS: {
  type: CharacterType;
  name: string;
  badge: string;
  description: string;
}[] = [
  {
    type: 'cat',
    name: '치즈 고양이',
    badge: '🐱 Rive Cat',
    description: '쫑긋한 귀와 살랑이는 꼬리로 바탕화면을 산책하는 치즈 고양이',
  },
  {
    type: 'dog',
    name: '크림 강아지',
    badge: '🐶 Rive Dog',
    description: '귀를 펄럭이며 꼬리를 흔드는 활발하고 다정한 크림 강아지',
  },
  {
    type: 'panda',
    name: '대나무 팬더',
    badge: '🐼 Rive Panda',
    description: '동그란 흑백 귀와 통통한 볼살이 매력적인 순둥이 자이언트 팬더',
  },
  {
    type: 'tiger',
    name: '용맹 호랑이',
    badge: '🐯 Rive Tiger',
    description: '이마의 왕(王) 무늬와 호피 줄무늬를 가진 귀여운 아기 호랑이',
  },
  {
    type: 'pig',
    name: '분홍 아기돼지',
    badge: '🐷 Rive Pig',
    description: '납작한 분홍 코를 씰룩이며 통통 튀어 다니는 복스러운 아기돼지',
  },
];

export const EMOTE_OPTIONS: {
  type: EmoteType;
  emoji: string;
  label: string;
  shortcut: string;
}[] = [
  { type: 'wave', emoji: '👋', label: '인사', shortcut: 'Alt+1' },
  { type: 'jump', emoji: '⭐', label: '점프', shortcut: 'Alt+2' },
  { type: 'dance', emoji: '🎵', label: '춤추기', shortcut: 'Alt+3' },
  { type: 'heart', emoji: '❤️', label: '하트', shortcut: 'Alt+4' },
  { type: 'sleep', emoji: '💤', label: '잠자기', shortcut: 'Alt+5' },
];

export const STATUS_BADGE_OPTIONS: {
  type: StatusBadgeType;
  emoji: string;
  label: string;
}[] = [
  { type: 'online', emoji: '🟢', label: '온라인' },
  { type: 'coding', emoji: '🔥', label: '코딩 중' },
  { type: 'resting', emoji: '☕', label: '휴식 중' },
  { type: 'meeting', emoji: '🎧', label: '회의 중' },
  { type: 'focus', emoji: '🍅', label: '집중 중' },
];

export function getStatusBadgeDisplay(statusBadge?: StatusBadgeType) {
  return (
    STATUS_BADGE_OPTIONS.find((s) => s.type === statusBadge) ||
    STATUS_BADGE_OPTIONS[0]
  );
}

/**
 * 1. 외부 .riv 에셋용 @rive-app/react-canvas 상태 머신 플레이어
 */
const RiveExternalFilePlayer: React.FC<{
  src: string;
  state: 'idle' | 'walk';
  activeEmote: EmoteType | null;
  size: number;
}> = ({ src, state, activeEmote, size }) => {
  const STATE_MACHINE_NAME = 'State Machine 1';
  const { rive, RiveComponent } = useRive({
    src,
    stateMachines: STATE_MACHINE_NAME,
    autoplay: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.BottomCenter,
    }),
  });

  const walkInput = useStateMachineInput(
    rive,
    STATE_MACHINE_NAME,
    'isWalking'
  );
  const emoteInput = useStateMachineInput(
    rive,
    STATE_MACHINE_NAME,
    'emoteCode'
  );

  useEffect(() => {
    if (walkInput) {
      walkInput.value = state === 'walk';
    }
  }, [walkInput, state]);

  useEffect(() => {
    if (emoteInput) {
      const codeMap: Record<EmoteType, number> = {
        wave: 1,
        jump: 2,
        dance: 3,
        heart: 4,
        sleep: 5,
      };
      emoteInput.value = activeEmote ? codeMap[activeEmote] : 0;
    }
  }, [emoteInput, activeEmote]);

  return (
    <div style={{ width: size, height: size }}>
      <RiveComponent />
    </div>
  );
};

/**
 * 2. 내장 60FPS Rive-Canvas 스켈레톤(Bone) 상태 머신 렌더러
 * 고양이(cat), 강아지(dog), 팬더(panda), 호랑이(tiger), 돼지(pig) 5종 동물의
 * 관절(귀, 꼬리, 팔다리, 몸통 호흡), 눈 깜빡임, 이모트 파티클을 실시간 캔버스에 렌더링합니다.
 */
const RiveProceduralCanvasRig: React.FC<{
  characterType: CharacterType;
  state: 'idle' | 'walk';
  activeEmote: EmoteType | null;
  size: number;
}> = ({ characterType, state, activeEmote, size }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const startOffset = Math.random() * 100;

    const renderFrame = (nowMs: number) => {
      const t = nowMs / 1000 + startOffset;
      const dpr = window.devicePixelRatio || 1;
      const targetW = size * dpr;
      const targetH = size * dpr;

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.save();
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.scale((size * dpr) / 100, (size * dpr) / 100);

      // 상태 머신 파라미터 계산
      const isWalking = state === 'walk';
      const isSleeping = activeEmote === 'sleep';
      const isJumping = activeEmote === 'jump';
      const isDancing = activeEmote === 'dance';
      const isWaving = activeEmote === 'wave';
      const isHeart = activeEmote === 'heart';

      // 몸통 바운스 & 회전
      let bounceY = isWalking
        ? Math.abs(Math.sin(t * 9)) * -6.5
        : Math.sin(t * 3.2) * -1.8;
      let bodyTilt = isWalking ? Math.sin(t * 9) * 0.06 : 0;

      if (isJumping) {
        bounceY = Math.abs(Math.sin(t * 7.5)) * -18;
      } else if (isDancing) {
        bounceY = Math.abs(Math.sin(t * 10)) * -7;
        bodyTilt = Math.sin(t * 10) * 0.16;
      } else if (isSleeping) {
        bounceY = Math.sin(t * 1.6) * -1.2 + 3;
      }

      // 팔다리 스윙 & 귀/꼬리 관절 각도
      const legSwing = isWalking
        ? Math.sin(t * 9) * 6.5
        : isDancing
        ? Math.sin(t * 10) * 5
        : 0;
      const earWiggle = Math.sin(t * 4.2) * 0.09;
      const tailWag = Math.sin(t * (isWalking || isDancing ? 11 : 4.5)) * 0.35;

      // 자동 눈 깜빡임 (3.4초 주기로 0.16초 동안 깜빡임)
      const isBlinking = isSleeping || t % 3.4 < 0.15;

      // 1) 바닥 그림자
      const shadowScale = Math.max(0.65, 1 + bounceY / 45);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.ellipse(50, 91, 26 * shadowScale, 5.5 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // 전체 캐릭터 중심 변환
      ctx.translate(50, 62 + bounceY);
      ctx.rotate(bodyTilt);

      // 캐릭터별 팔레트 설정
      const palette = getAnimalPalette(characterType);

      // 2) 꼬리(Tail) 관절 렌더링
      ctx.save();
      ctx.translate(-17, 10);
      ctx.rotate(tailWag);
      drawTail(ctx, characterType, palette);
      ctx.restore();

      // 3) 뒷다리 / 앞다리 (Walk 스켈레톤)
      drawRoundedLimb(ctx, -11, 20 + legSwing * 0.6, 6.5, 9, palette.limb, palette.stroke);
      drawRoundedLimb(ctx, 11, 20 - legSwing * 0.6, 6.5, 9, palette.limb, palette.stroke);

      // 4) 몸통(Torso) 및 배(Belly)
      ctx.fillStyle = palette.body;
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.roundRect(-21, -8, 42, 32, 16);
      ctx.fill();
      ctx.stroke();

      // 배 패치
      ctx.fillStyle = palette.belly;
      ctx.beginPath();
      ctx.ellipse(0, 9, 13, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // 팬더 검은 어깨 조끼 무늬 / 호랑이 몸통 줄무늬
      if (characterType === 'panda') {
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.roundRect(-21, -7, 42, 11, 8);
        ctx.fill();
      } else if (characterType === 'tiger') {
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2.6;
        [-1, 1].forEach((side) => {
          ctx.beginPath();
          ctx.moveTo(side * 20, 4);
          ctx.lineTo(side * 13, 5);
          ctx.moveTo(side * 20, 11);
          ctx.lineTo(side * 14, 12);
          ctx.stroke();
        });
      }

      // 5) 양팔(Arms) 관절
      ctx.save();
      ctx.translate(-20, 3);
      ctx.rotate(isDancing ? Math.sin(t * 10) * 0.6 : isWalking ? -legSwing * 0.06 : 0.2);
      drawRoundedLimb(ctx, 0, 6, 5.5, 9, palette.arm, palette.stroke);
      ctx.restore();

      ctx.save();
      ctx.translate(20, 3);
      if (isWaving) {
        // 인사 이모트 시 오른팔을 높이 들어 흔들기
        ctx.rotate(-2.3 + Math.sin(t * 15) * 0.45);
      } else if (isHeart) {
        ctx.rotate(-1.2);
      } else {
        ctx.rotate(isDancing ? -Math.sin(t * 10) * 0.6 : isWalking ? legSwing * 0.06 : -0.2);
      }
      drawRoundedLimb(ctx, 0, 6, 5.5, 9, palette.arm, palette.stroke);
      ctx.restore();

      // 6) 머리(Head) & 양쪽 귀(Ears) 관절
      ctx.save();
      ctx.translate(0, -19);
      ctx.rotate(Math.sin(t * 3.5) * 0.03);

      // 왼쪽 귀 & 오른쪽 귀
      drawEars(ctx, characterType, palette, earWiggle);

      // 얼굴 베이스
      ctx.fillStyle = palette.head;
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 25, 20.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 동물별 얼굴 특징 (호랑이 왕 무늬/흰 볼털, 팬더 눈 패치, 고양이 이마 줄무늬)
      drawFaceMarkings(ctx, characterType, palette);

      // 눈(Eyes) & 깜빡임 상태 머신
      drawEyes(ctx, characterType, isBlinking, isWaving, isHeart);

      // 볼터치
      ctx.fillStyle = 'rgba(251, 113, 133, 0.68)';
      ctx.beginPath();
      ctx.ellipse(-15.5, 4.5, 4.2, 2.3, 0, 0, Math.PI * 2);
      ctx.ellipse(15.5, 4.5, 4.2, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // 코 & 입 (돼지는 핑크 돼지코, 강아지는 혀, 고양이/팬더/호랑이는 귀여운 입매)
      drawNoseAndMouth(ctx, characterType, palette, isJumping || isDancing);

      ctx.restore(); // Head 종료

      // 7) 감정 표현(Emote) 실시간 파티클 효과
      drawEmoteParticles(ctx, activeEmote, t);

      ctx.restore();
      animId = requestAnimationFrame(renderFrame);
    };

    animId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animId);
  }, [characterType, state, activeEmote, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
};

export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  characterType,
  direction = 'right',
  state = 'idle',
  activeEmote = null,
  size = 80,
  riveSrc,
}) => {
  const flipTransform = direction === 'left' ? 'scaleX(-1)' : 'scaleX(1)';

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        transform: flipTransform,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {riveSrc ? (
        <RiveExternalFilePlayer
          src={riveSrc}
          state={state}
          activeEmote={activeEmote}
          size={size}
        />
      ) : (
        <RiveProceduralCanvasRig
          characterType={characterType}
          state={state}
          activeEmote={activeEmote}
          size={size}
        />
      )}
    </div>
  );
};

// =========================================================
// 동물별 컬러 팔레트 및 Rive 파츠 드로잉 헬퍼
// =========================================================

interface AnimalPalette {
  head: string;
  body: string;
  belly: string;
  earOuter: string;
  earInner: string;
  limb: string;
  arm: string;
  stroke: string;
  nose: string;
}

function getAnimalPalette(type: CharacterType): AnimalPalette {
  switch (type) {
    case 'cat':
      return {
        head: '#FCD34D',
        body: '#FBBF24',
        belly: '#FEF3C7',
        earOuter: '#F59E0B',
        earInner: '#FB7185',
        limb: '#FEF3C7',
        arm: '#FBBF24',
        stroke: '#78350F',
        nose: '#F43F5E',
      };
    case 'dog':
      return {
        head: '#FEF3C7',
        body: '#FDE68A',
        belly: '#FFFBEB',
        earOuter: '#B45309',
        earInner: '#92400E',
        limb: '#FDE68A',
        arm: '#FDE68A',
        stroke: '#451A03',
        nose: '#451A03',
      };
    case 'panda':
      return {
        head: '#FFFFFF',
        body: '#F8FAFC',
        belly: '#FFFFFF',
        earOuter: '#1E293B',
        earInner: '#334155',
        limb: '#1E293B',
        arm: '#1E293B',
        stroke: '#0F172A',
        nose: '#0F172A',
      };
    case 'tiger':
      return {
        head: '#FB923C',
        body: '#F97316',
        belly: '#FFEDD5',
        earOuter: '#EA580C',
        earInner: '#FDE047',
        limb: '#FFEDD5',
        arm: '#FB923C',
        stroke: '#431407',
        nose: '#F43F5E',
      };
    case 'pig':
      return {
        head: '#FBCFE8',
        body: '#F9A8D4',
        belly: '#FCE7F3',
        earOuter: '#F472B6',
        earInner: '#EC4899',
        limb: '#F472B6',
        arm: '#F9A8D4',
        stroke: '#831843',
        nose: '#F472B6',
      };
  }
}

function drawRoundedLimb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  stroke: string
) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawTail(
  ctx: CanvasRenderingContext2D,
  type: CharacterType,
  palette: AnimalPalette
) {
  ctx.strokeStyle = palette.stroke;
  ctx.lineCap = 'round';

  if (type === 'panda') {
    // 팬더 동그란 폼폼 꼬리
    ctx.fillStyle = '#1E293B';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(-5, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }

  if (type === 'pig') {
    // 돼지 말린 꼬리
    ctx.strokeStyle = '#EC4899';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.bezierCurveTo(-12, -4, -14, -14, -6, -12);
    ctx.bezierCurveTo(-2, -11, -5, -4, -11, -7);
    ctx.stroke();
    return;
  }

  // 고양이, 강아지, 호랑이 긴 꼬리
  ctx.strokeStyle = palette.earOuter;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.quadraticCurveTo(-14, -2, -11, -15);
  ctx.stroke();

  if (type === 'tiger') {
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-11, -15);
    ctx.lineTo(-9, -11);
    ctx.stroke();
  }
}

function drawEars(
  ctx: CanvasRenderingContext2D,
  type: CharacterType,
  palette: AnimalPalette,
  earWiggle: number
) {
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = palette.stroke;

  if (type === 'cat') {
    // 고양이 뾰족한 삼각 귀
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 15, -13);
      ctx.rotate(side * earWiggle);
      ctx.fillStyle = palette.earOuter;
      ctx.beginPath();
      ctx.moveTo(-7, 4);
      ctx.lineTo(side * -2, -12);
      ctx.lineTo(7, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = palette.earInner;
      ctx.beginPath();
      ctx.moveTo(-4, 2);
      ctx.lineTo(side * -1.5, -7);
      ctx.lineTo(4, 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
    return;
  }

  if (type === 'dog') {
    // 강아지 귀엽게 처진 귀
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 21, -5);
      ctx.rotate(side * (0.32 + earWiggle));
      ctx.fillStyle = palette.earOuter;
      ctx.beginPath();
      ctx.ellipse(0, 7, 6.5, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    return;
  }

  if (type === 'pig') {
    // 돼지 통통한 접힌 분홍 귀
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.translate(side * 16, -14);
      ctx.rotate(side * (0.25 + earWiggle));
      ctx.fillStyle = palette.earOuter;
      ctx.beginPath();
      ctx.ellipse(0, -3, 7, 9, side * -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    return;
  }

  // 팬더 & 호랑이 동그란 귀
  [-1, 1].forEach((side) => {
    ctx.save();
    ctx.translate(side * 17, -15);
    ctx.rotate(side * earWiggle);
    ctx.fillStyle = palette.earOuter;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.earInner;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawFaceMarkings(
  ctx: CanvasRenderingContext2D,
  type: CharacterType,
  palette: AnimalPalette
) {
  if (type === 'cat') {
    // 고양이 이마 줄무늬 & 수염
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -12);
    ctx.moveTo(-5, -17);
    ctx.lineTo(-4, -13);
    ctx.moveTo(5, -17);
    ctx.lineTo(4, -13);
    ctx.stroke();
  } else if (type === 'panda') {
    // 팬더 검은 눈가 패치
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.ellipse(-9.5, -1, 6.5, 5.2, -0.25, 0, Math.PI * 2);
    ctx.ellipse(9.5, -1, 6.5, 5.2, 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'tiger') {
    // 호랑이 흰색 양볼 패치 & 이마 왕(王) 무늬
    ctx.fillStyle = '#FFF7ED';
    ctx.beginPath();
    ctx.ellipse(-15, 5, 7.5, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(15, 5, 7.5, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 6, 9, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, -15);
    ctx.lineTo(6, -15);
    ctx.moveTo(-4.5, -11.5);
    ctx.lineTo(4.5, -11.5);
    ctx.moveTo(-6, -8);
    ctx.lineTo(6, -8);
    ctx.moveTo(0, -15);
    ctx.lineTo(0, -8);
    ctx.stroke();

    // 볼 호피 줄무늬
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * 23, 0);
      ctx.lineTo(side * 18, 1);
      ctx.moveTo(side * 22, 4);
      ctx.lineTo(side * 18, 4.5);
      ctx.stroke();
    });
  } else {
    void palette;
  }
}

function drawEyes(
  ctx: CanvasRenderingContext2D,
  type: CharacterType,
  isBlinking: boolean,
  isWaving: boolean,
  isHeart: boolean
) {
  const eyeLocations = [-9.5, 9.5];

  eyeLocations.forEach((ex, idx) => {
    // 인사할 때 오른쪽 눈 윙크
    if (isBlinking || (isWaving && idx === 1)) {
      ctx.strokeStyle = type === 'panda' ? '#FFFFFF' : '#1E293B';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, -1, 3.5, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      return;
    }

    if (isHeart) {
      // 하트 이모트일 때 반짝이는 눈
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(ex, -1.5, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FB7185';
      ctx.beginPath();
      ctx.arc(ex, -1.5, 2.1, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(ex, -1.5, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // 눈동자 하이라이트
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(ex + 1.2, -2.8, 1.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawNoseAndMouth(
  ctx: CanvasRenderingContext2D,
  type: CharacterType,
  palette: AnimalPalette,
  isOpenMouth: boolean
) {
  if (type === 'pig') {
    // 돼지 특유의 타원형 분홍 코 + 콧구멍 2개
    ctx.fillStyle = '#F472B6';
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 4, 7.5, 5.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#831843';
    ctx.beginPath();
    ctx.ellipse(-2.6, 4, 1.4, 2.1, 0, 0, Math.PI * 2);
    ctx.ellipse(2.6, 4, 1.4, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 10, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    return;
  }

  // 코
  ctx.fillStyle = palette.nose;
  ctx.beginPath();
  ctx.ellipse(0, 3.2, 3.4, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 강아지 혀 또는 열린 입
  if (type === 'dog' || isOpenMouth) {
    ctx.fillStyle = '#FB7185';
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 6.5, 3.4, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  // 귀여운 W 모양 입매
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4.5, 6.2);
  ctx.quadraticCurveTo(-2.2, 9, 0, 6);
  ctx.quadraticCurveTo(2.2, 9, 4.5, 6.2);
  ctx.stroke();
}

function drawEmoteParticles(
  ctx: CanvasRenderingContext2D,
  activeEmote: EmoteType | null,
  t: number
) {
  if (!activeEmote) return;

  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';

  if (activeEmote === 'heart') {
    const floatY = -44 - ((t * 22) % 14);
    ctx.fillText('❤️', -16, floatY);
    ctx.fillText('💖', 16, floatY - 5);
  } else if (activeEmote === 'dance') {
    const floatY = -44 - Math.abs(Math.sin(t * 6)) * 8;
    ctx.fillText('🎵', -20, floatY);
    ctx.fillText('🎶', 20, floatY - 4);
  } else if (activeEmote === 'jump') {
    ctx.fillText('⭐', -22, -38);
    ctx.fillText('✨', 22, -42);
  } else if (activeEmote === 'sleep') {
    const zOffset = (t * 14) % 16;
    ctx.fillStyle = '#4F46E5';
    ctx.fillText('Z', 16, -36 - zOffset * 0.6);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('z', 24, -44 - zOffset * 0.8);
  }
  ctx.restore();
}
