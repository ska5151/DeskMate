import { CharacterType } from '../types';

const MUTE_STORAGE_KEY = 'deskmate_sound_muted';

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private dnd: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch {
      this.muted = false;
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || this.dnd) return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(mute));
    } catch {
      // ignore storage errors
    }
  }

  public setDnd(dndMode: boolean): void {
    this.dnd = dndMode;
  }

  /**
   * 5종 동물 캐릭터별(고양이, 강아지, 팬더, 호랑이, 돼지) 맞춤 말풍선 효과음 재생
   */
  public playBubblePop(characterType?: CharacterType): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    let startFreq = 520;
    let endFreq = 780;
    let duration = 0.13;

    if (characterType === 'cat') {
      // 고양이: 높고 부드러운 야옹 톤
      startFreq = 600;
      endFreq = 920;
      osc.type = 'triangle';
    } else if (characterType === 'dog') {
      // 강아지: 경쾌한 바크 톤
      startFreq = 440;
      endFreq = 680;
      osc.type = 'sine';
    } else if (characterType === 'panda') {
      // 팬더: 포근하고 둥근 대나무 마림바 톤
      startFreq = 380;
      endFreq = 540;
      osc.type = 'sine';
    } else if (characterType === 'tiger') {
      // 호랑이: 묵직하고 힘찬 어흥 톤
      startFreq = 260;
      endFreq = 430;
      duration = 0.15;
      osc.type = 'sawtooth';
    } else if (characterType === 'pig') {
      // 돼지: 통통 튀는 귀여운 꿀꿀 톤
      startFreq = 480;
      endFreq = 760;
      osc.type = 'triangle';
    }

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration * 0.85);

    gain.gain.setValueAtTime(characterType === 'tiger' ? 0.08 : 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  public playEmoteSound(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0.09, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.12);
    });
  }

  public playGameSound(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);

      gain.gain.setValueAtTime(0.11, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.15);
    });
  }

  public playBounceSound(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.09);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }
}

export const sound = new SoundManager();
