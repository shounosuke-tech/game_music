import { Container, Graphics, Text } from 'pixi.js';
import type { AudioEngine } from '@/audio/AudioEngine';
import { Metronome } from '@/audio/Metronome';
import {
  keyLabel,
  laneIndexOf,
  laneKeys,
  laneKind,
  type LaneKind,
  type LaneMode,
} from '@/config/lanes';
import { beatToSeconds, noteY, performanceToAudioTime, toSongTime } from '@/core/clock';
import { isMissedByTime, judge, type Judgment } from '@/core/judge';

const BPM = 120;
const LEAD_IN = 1.5; // 開始から拍0までの待ち時間（秒）
const SCROLL_SPEED = 700; // px/秒
const LANE_WIDTH = 96;
const NOTE_HEIGHT = 18;

const JUDGMENT_COLOR: Record<Judgment, number> = {
  perfect: 0x7df9ff,
  great: 0x8cff8c,
  good: 0xffe066,
  miss: 0xff6b6b,
};

/** レーンの種類ごとのノーツの色 */
const NOTE_COLOR: Record<LaneKind, number> = {
  outer: 0xf5f7fa,
  inner: 0x66b3ff,
  center: 0xffb347,
};

interface DemoNote {
  readonly beat: number;
  readonly lane: number;
  readonly time: number;
  done: boolean;
  sprite: Graphics | null;
}

/**
 * Phase 1 の動作確認用シーン。
 * メトロノームの拍ごとにノーツを流し、レーン数（4〜7）に応じたキーで叩くと判定を表示する。
 * 描画と判定はすべて音声の時計から計算している（土台の正しさの確認用）。
 */
export class TimingDemoScene extends Container {
  private readonly keys: readonly string[];
  private readonly lanes = new Graphics();
  private readonly lanePress = new Graphics();
  private readonly notesLayer = new Container();
  private readonly judgmentText = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 40, fontWeight: '700', fontFamily: 'system-ui, sans-serif' },
  });
  private readonly infoText = new Text({
    text: '',
    style: { fill: 0x9aa4b2, fontSize: 14, fontFamily: 'Consolas, Menlo, monospace' },
  });
  private readonly keyTexts: Text[];
  private readonly notes: DemoNote[] = [];
  private readonly pressed = new Set<number>();
  private readonly metronome: Metronome;
  private readonly songStart: number;
  private nextBeatToSpawn = 0;
  private viewWidth = 0;
  private viewHeight = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly mode: LaneMode,
  ) {
    super();
    this.keys = laneKeys(mode);
    this.keyTexts = this.keys.map(
      (code) =>
        new Text({
          text: keyLabel(code),
          style: {
            fill: 0x9aa4b2,
            fontSize: code === 'Space' ? 15 : 20,
            fontWeight: '600',
            fontFamily: 'system-ui, sans-serif',
          },
        }),
    );
    this.songStart = engine.now + LEAD_IN;
    this.metronome = new Metronome(engine, BPM, this.songStart);
    this.judgmentText.anchor.set(0.5);
    for (const t of this.keyTexts) t.anchor.set(0.5);
    this.addChild(this.lanes, this.lanePress, this.notesLayer, this.judgmentText, this.infoText);
    this.addChild(...this.keyTexts);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private get judgeLineY(): number {
    return this.viewHeight * 0.82;
  }

  private get laneLeft(): number {
    return (this.viewWidth - LANE_WIDTH * this.keys.length) / 2;
  }

  resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    const left = this.laneLeft;
    const total = LANE_WIDTH * this.keys.length;
    this.lanes.clear();
    this.lanes.rect(left, 0, total, height).fill({ color: 0x0f1420 });
    for (let i = 1; i < this.keys.length; i++) {
      this.lanes.rect(left + i * LANE_WIDTH, 0, 1, height).fill({ color: 0x232b3a });
    }
    this.lanes.rect(left, this.judgeLineY - 2, total, 4).fill({ color: 0xffffff });
    this.keyTexts.forEach((t, i) =>
      t.position.set(left + (i + 0.5) * LANE_WIDTH, this.judgeLineY + 32),
    );
    this.judgmentText.position.set(width / 2, this.judgeLineY - 160);
    this.infoText.position.set(16, 16);
  }

  update(): void {
    this.metronome.update();
    const songTime = toSongTime(this.engine.now, this.songStart);

    // 画面上端に入る少し前のノーツを生成する
    const visibleAhead = this.judgeLineY / SCROLL_SPEED + 0.2;
    while (beatToSeconds(this.nextBeatToSpawn, BPM) < songTime + visibleAhead) {
      const beat = this.nextBeatToSpawn++;
      this.notes.push({
        beat,
        lane: beat % this.keys.length,
        time: beatToSeconds(beat, BPM),
        done: false,
        sprite: null,
      });
    }

    for (const note of this.notes) {
      if (!note.done && isMissedByTime(note.time, songTime)) {
        note.done = true;
        this.showJudgment('miss', null);
      }
      if (note.done) {
        note.sprite?.destroy();
        note.sprite = null;
        continue;
      }
      if (!note.sprite) {
        note.sprite = new Graphics()
          .roundRect(4, -NOTE_HEIGHT / 2, LANE_WIDTH - 8, NOTE_HEIGHT, 6)
          .fill({ color: NOTE_COLOR[laneKind(this.mode, note.lane)] });
        note.sprite.x = this.laneLeft + note.lane * LANE_WIDTH;
        this.notesLayer.addChild(note.sprite);
      }
      note.sprite.y = noteY(note.time, songTime, this.judgeLineY, SCROLL_SPEED);
    }
    // 処理済みのノーツを配列から取り除く
    for (let i = this.notes.length - 1; i >= 0; i--) {
      if (this.notes[i]?.done) this.notes.splice(i, 1);
    }

    this.drawPressedLanes();
    this.infoText.text = `${this.mode}K  BPM ${BPM}  song ${songTime.toFixed(3)}s  audio ${this.engine.now.toFixed(3)}s`;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const lane = laneIndexOf(this.mode, e.code);
    if (lane < 0) return;
    e.preventDefault(); // Space でのページスクロールなどを止める
    if (e.repeat) return;
    this.pressed.add(lane);

    // 入力イベントの発生時刻を音声の時刻 → 曲の時刻へ変換して判定する
    const audioTime = performanceToAudioTime(e.timeStamp, this.engine.outputTimestamp());
    const songTime = toSongTime(audioTime, this.songStart);
    const target = this.notes.find((n) => !n.done && n.lane === lane);
    if (!target) return;
    const delta = songTime - target.time;
    const result = judge(delta);
    if (!result) return;
    target.done = true;
    this.showJudgment(result, delta);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const lane = laneIndexOf(this.mode, e.code);
    if (lane >= 0) this.pressed.delete(lane);
  };

  private drawPressedLanes(): void {
    this.lanePress.clear();
    for (const lane of this.pressed) {
      this.lanePress
        .rect(this.laneLeft + lane * LANE_WIDTH, 0, LANE_WIDTH, this.judgeLineY)
        .fill({ color: 0x66b3ff, alpha: 0.12 });
    }
  }

  private showJudgment(result: Judgment, delta: number | null): void {
    const ms = delta === null ? '' : ` ${delta >= 0 ? '+' : ''}${Math.round(delta * 1000)}ms`;
    this.judgmentText.text = `${result.toUpperCase()}${ms}`;
    this.judgmentText.style.fill = JUDGMENT_COLOR[result];
  }

  override destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    super.destroy({ children: true });
  }
}
