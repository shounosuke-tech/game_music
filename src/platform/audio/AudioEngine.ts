import type { OutputTimestamp } from '@/core/clock';

/**
 * Web Audio API の薄いラッパー。ゲーム全体で AudioContext を1つだけ持つ。
 * ブラウザの自動再生制限があるため、ユーザー操作の中で resume() を呼ぶ必要がある。
 *
 * 音の経路: 曲 → musicGain ┐
 *           効果音 → effectGain ┴→ master → 出力
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly musicGain: GainNode;
  private readonly effectGain: GainNode;
  private songSource: AudioBufferSourceNode | null = null;
  private paused = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.8;
    this.musicGain.connect(this.master);
    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.6;
    this.effectGain.connect(this.master);
  }

  /** ユーザー操作（クリック・キー入力）の中で呼ぶ */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running' && !this.paused) await this.ctx.resume();
  }

  /** 音声の現在時刻（秒） */
  get now(): number {
    return this.ctx.currentTime;
  }

  get isPaused(): boolean {
    return this.paused;
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

  setVolume(kind: 'music' | 'effect', value: number): void {
    (kind === 'music' ? this.musicGain : this.effectGain).gain.value = value;
  }

  /** 音源を取得してデコードする */
  async load(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`音源を取得できませんでした（${res.status}）: ${url}`);
    return this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  /**
   * 音声時刻 at に曲を再生する（それまでに止めていた曲は止める）。
   * @returns 曲の先頭（0 秒）が鳴る音声時刻
   */
  playSong(buffer: AudioBuffer, at: number): number {
    this.stopSong();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.musicGain);
    source.start(at);
    this.songSource = source;
    return at;
  }

  stopSong(): void {
    if (!this.songSource) return;
    try {
      this.songSource.stop();
    } catch {
      // まだ start していない場合などは無視する
    }
    this.songSource.disconnect();
    this.songSource = null;
  }

  /** 一時停止。音声時刻ごと止まるので、曲時刻も自然に止まる */
  async pause(): Promise<void> {
    if (this.paused) return;
    this.paused = true;
    await this.ctx.suspend();
  }

  async unpause(): Promise<void> {
    if (!this.paused) return;
    this.paused = false;
    await this.ctx.resume();
  }

  /** 指定した音声時刻にクリック音を鳴らす（メトロノーム・タイミング調整用） */
  playClick(at: number, accent = false): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.35, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    osc.connect(gain).connect(this.effectGain);
    osc.start(at);
    osc.stop(at + 0.07);
  }
}
