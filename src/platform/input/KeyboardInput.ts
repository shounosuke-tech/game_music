import { performanceToAudioTime } from '@/core/clock';
import type { AudioEngine } from '@/platform/audio/AudioEngine';

export interface LaneInput {
  readonly lane: number;
  readonly type: 'down' | 'up';
  /** 入力が発生した音声時刻（秒） */
  readonly audioTime: number;
}

/**
 * レーンのキー入力を受け取り、発生時刻を音声時刻に変換して渡す（詳細設計書 5.2）。
 * - 対象外のキーは無視し、対象のキーは preventDefault する
 * - 押しっぱなしによる連続入力（repeat）は無視する
 * - フォーカスが外れたら、押しているキーをすべて離したことにする
 */
export class KeyboardInput {
  private readonly pressed = new Set<number>();
  private attached = false;

  constructor(
    private readonly engine: AudioEngine,
    private readonly keys: readonly string[],
    private readonly onInput: (input: LaneInput) => void,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
  }

  isPressed(lane: number): boolean {
    return this.pressed.has(lane);
  }

  /** 押しているキーをすべて離したことにする（一時停止のときなど） */
  releaseAll(): void {
    const audioTime = this.engine.now;
    for (const lane of this.pressed) this.onInput({ lane, type: 'up', audioTime });
    this.pressed.clear();
  }

  private toAudioTime(e: KeyboardEvent): number {
    return performanceToAudioTime(e.timeStamp, this.engine.outputTimestamp());
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const lane = this.keys.indexOf(e.code);
    if (lane < 0) return;
    e.preventDefault();
    if (e.repeat || this.pressed.has(lane)) return;
    this.pressed.add(lane);
    this.onInput({ lane, type: 'down', audioTime: this.toAudioTime(e) });
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const lane = this.keys.indexOf(e.code);
    if (lane < 0 || !this.pressed.has(lane)) return;
    e.preventDefault();
    this.pressed.delete(lane);
    this.onInput({ lane, type: 'up', audioTime: this.toAudioTime(e) });
  };

  private readonly onBlur = (): void => this.releaseAll();
}
