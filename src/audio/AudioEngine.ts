import type { OutputTimestamp } from '@/core/clock';

/**
 * Web Audio API の薄いラッパー。ゲーム全体で AudioContext を1つだけ持つ。
 * ブラウザの自動再生制限があるため、ユーザー操作の中で resume() を呼ぶ必要がある。
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
  }

  /** ユーザー操作（クリック・キー入力）の中で呼ぶ */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  /** 音声の現在時刻（秒） */
  get now(): number {
    return this.ctx.currentTime;
  }

  /**
   * 音声の時刻と performance.now() の対応を返す。
   * getOutputTimestamp は出力遅延も考慮した「実際に耳に届いている音」の時刻を返す。
   * 未対応・未再生の環境では currentTime で代用する。
   */
  outputTimestamp(): OutputTimestamp {
    const ts = this.ctx.getOutputTimestamp?.();
    if (
      ts?.contextTime !== undefined &&
      ts.performanceTime !== undefined &&
      ts.performanceTime > 0
    ) {
      return { contextTime: ts.contextTime, performanceTime: ts.performanceTime };
    }
    return { contextTime: this.ctx.currentTime, performanceTime: performance.now() };
  }

  /** 指定した音声の時刻にクリック音を鳴らす（メトロノーム・ヒット音用） */
  playClick(at: number, accent = false): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + 0.07);
  }
}
