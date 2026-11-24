import { beatToSeconds } from '@/core/clock';
import type { AudioEngine } from './AudioEngine';

/**
 * 先読み方式のメトロノーム。
 * 毎フレーム update() を呼ぶと、少し先（lookahead）までのクリック音を音声の時刻で予約する。
 * setTimeout などで「今鳴らす」方式と違い、メインスレッドが詰まっても音がずれない。
 */
export class Metronome {
  private nextBeat = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly bpm: number,
    /** 拍0を鳴らす音声の時刻（秒） */
    private readonly startAudioTime: number,
    private readonly beatsPerBar = 4,
    private readonly lookahead = 0.12,
  ) {}

  update(): void {
    const horizon = this.engine.now + this.lookahead;
    for (;;) {
      const at = this.startAudioTime + beatToSeconds(this.nextBeat, this.bpm);
      if (at > horizon) break;
      if (at >= this.engine.now) {
        this.engine.playClick(at, this.nextBeat % this.beatsPerBar === 0);
      }
      this.nextBeat += 1;
    }
  }
}
