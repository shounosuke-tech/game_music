import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { keyLabel, laneKeys, laneKind, type LaneKind, type LaneMode } from '@/config/lanes';
import type { PlayableChart } from '@/core/chart';
import { noteY } from '@/core/clock';
import type { PlaySession } from '@/game/PlaySession';
import { Pool } from './Pool';

const NOTE_HEIGHT = 18;
const LONG_BODY_RATIO = 0.62; // ロングノーツの帯の幅（レーン幅に対する比）

/** レーンの種類ごとのノーツの色 */
export const NOTE_COLOR: Record<LaneKind, number> = {
  outer: 0xf5f7fa,
  inner: 0x66b3ff,
  center: 0xffb347,
};

export interface PlayfieldLayout {
  readonly laneWidth: number;
  readonly left: number;
  readonly judgeLineY: number;
  readonly height: number;
}

/** 画面サイズとレーン数から、レーンの幅と位置を決める */
export function computeLayout(width: number, height: number, lanes: number): PlayfieldLayout {
  const laneWidth = Math.max(48, Math.min(96, Math.floor((width * 0.7) / lanes)));
  return {
    laneWidth,
    left: Math.round((width - laneWidth * lanes) / 2),
    judgeLineY: Math.round(height * 0.85),
    height,
  };
}

/**
 * プレイ画面のレーンとノーツの描画（詳細設計書 7 章）。
 * 位置はすべて表示用の曲時刻から毎フレーム計算する。
 */
export class PlayfieldView extends Container {
  private readonly kinds: readonly LaneKind[];
  private readonly keys: readonly string[];
  private readonly background = new Graphics();
  private readonly barLayer = new Container();
  private readonly glow = new Graphics();
  private readonly bodyLayer = new Container();
  private readonly chordLayer = new Container();
  private readonly noteLayer = new Container();
  private readonly foreground = new Graphics();
  private readonly keyTexts: Text[];
  private readonly bars: Pool<Sprite>;
  private readonly bodies: Pool<Sprite>;
  private readonly chords: Pool<Sprite>;
  private readonly notes: Pool<Graphics>;
  private layout: PlayfieldLayout = computeLayout(1280, 720, 4);
  private noteWidth = this.layout.laneWidth - 8;
  /** 描画を始めるノーツの位置（画面の下へ消えたものを飛ばす） */
  private noteCursor = 0;
  private barCursor = 0;

  constructor(
    private readonly chart: PlayableChart,
    private readonly session: PlaySession,
  ) {
    super();
    const mode: LaneMode = chart.lanes;
    this.keys = laneKeys(mode);
    this.kinds = this.keys.map((_, i) => laneKind(mode, i));
    this.keyTexts = this.keys.map((code) => {
      const t = new Text({
        text: keyLabel(code),
        style: {
          fill: 0x9aa4b2,
          fontSize: code === 'Space' ? 14 : 20,
          fontWeight: '600',
          fontFamily: 'system-ui, sans-serif',
        },
      });
      t.anchor.set(0.5);
      return t;
    });

    const sprite = () => new Sprite(Texture.WHITE);
    this.bars = new Pool(this.barLayer, sprite, 16);
    this.bodies = new Pool(this.bodyLayer, sprite, 32);
    this.chords = new Pool(this.chordLayer, sprite, 32);
    this.notes = new Pool(this.noteLayer, () => this.drawNote(new Graphics()), 256);

    this.addChild(
      this.background,
      this.barLayer,
      this.glow,
      this.bodyLayer,
      this.chordLayer,
      this.noteLayer,
      this.foreground,
      ...this.keyTexts,
    );
  }

  get currentLayout(): PlayfieldLayout {
    return this.layout;
  }

  resize(width: number, height: number): void {
    this.layout = computeLayout(width, height, this.chart.lanes);
    const { laneWidth: w, left, judgeLineY } = this.layout;
    const total = w * this.chart.lanes;

    this.background.clear();
    this.background.rect(left, 0, total, height).fill({ color: 0x0f1420 });
    for (let i = 1; i < this.chart.lanes; i++) {
      this.background.rect(left + i * w, 0, 1, height).fill({ color: 0x232b3a });
    }
    this.background.rect(left - 2, 0, 2, height).fill({ color: 0x2e3747 });
    this.background.rect(left + total, 0, 2, height).fill({ color: 0x2e3747 });

    this.foreground.clear();
    this.foreground.rect(left, judgeLineY - 2, total, 4).fill({ color: 0xffffff });

    this.keyTexts.forEach((t, i) => t.position.set(left + (i + 0.5) * w, judgeLineY + 32));

    // ノーツの形はレーン幅で決まるので、作り直す（色は tint で付ける）
    this.noteWidth = w - 8;
    this.notes.begin();
    for (let i = 0; i < this.notes.size; i++) this.drawNote(this.notes.next());
    this.notes.end();
  }

  private drawNote(g: Graphics): Graphics {
    return g
      .clear()
      .roundRect(0, -NOTE_HEIGHT / 2, this.noteWidth, NOTE_HEIGHT, 6)
      .fill(0xffffff);
  }

  /**
   * @param displayTime 表示用の曲時刻（表示オフセット適用済み）
   * @param pxPerSec ノーツが1秒に動く量
   * @param isPressed レーンのキーを押しているか
   */
  render(displayTime: number, pxPerSec: number, isPressed: (lane: number) => boolean): void {
    const { laneWidth: w, left, judgeLineY, height } = this.layout;
    const topTime = displayTime + (judgeLineY + NOTE_HEIGHT) / pxPerSec;
    const bottomTime = displayTime - (height - judgeLineY + NOTE_HEIGHT) / pxPerSec;
    const y = (t: number) => noteY(t, displayTime, judgeLineY, pxPerSec);
    const laneX = (lane: number) => left + lane * w;

    // 押しているレーンの光
    this.glow.clear();
    for (let lane = 0; lane < this.chart.lanes; lane++) {
      if (isPressed(lane)) {
        this.glow.rect(laneX(lane), 0, w, judgeLineY).fill({ color: 0x66b3ff, alpha: 0.12 });
      }
    }

    // 小節線
    const barTimes = this.chart.barLines;
    while (this.barCursor < barTimes.length && barTimes[this.barCursor]! < bottomTime) {
      this.barCursor++;
    }
    this.bars.begin();
    for (let i = this.barCursor; i < barTimes.length && barTimes[i]! <= topTime; i++) {
      const bar = this.bars.next();
      bar.tint = 0x3a4458;
      bar.position.set(left, y(barTimes[i]!));
      bar.width = w * this.chart.lanes;
      bar.height = 1;
    }
    this.bars.end();

    // ノーツ
    const notes = this.chart.notes;
    while (
      this.noteCursor < notes.length &&
      (notes[this.noteCursor]!.endTime ?? notes[this.noteCursor]!.time) < bottomTime
    ) {
      this.noteCursor++;
    }

    this.bodies.begin();
    this.chords.begin();
    this.notes.begin();
    for (let i = this.noteCursor; i < notes.length; i++) {
      const note = notes[i]!;
      if (note.time > topTime) break;
      const state = this.session.noteState(note.id);
      if (state === 'done') continue;

      const color = NOTE_COLOR[this.kinds[note.lane]!];
      const x = laneX(note.lane);
      // 押している間、始点は判定ラインに留める
      const headY = state === 'holding' ? judgeLineY : y(note.time);

      if (note.endTime !== null) {
        const tailY = y(note.endTime);
        const body = this.bodies.next();
        const bodyWidth = w * LONG_BODY_RATIO;
        body.tint = color;
        body.alpha = state === 'holding' ? 0.75 : 0.45;
        body.position.set(x + (w - bodyWidth) / 2, Math.max(tailY, -NOTE_HEIGHT));
        body.width = bodyWidth;
        body.height = Math.max(0, headY - Math.max(tailY, -NOTE_HEIGHT));
        // 終点の目印
        if (tailY > -NOTE_HEIGHT) {
          const tail = this.notes.next();
          tail.tint = color;
          tail.alpha = 0.8;
          tail.position.set(x + 4, tailY);
          tail.scale.y = 0.5;
        }
      }

      // 同時押しの線（グループの先頭のノーツで、右端のノーツまで引く）
      if (note.chordId !== null && state === 'waiting' && notes[i - 1]?.chordId !== note.chordId) {
        let last = i;
        while (notes[last + 1]?.chordId === note.chordId) last++;
        const right = notes[last]!;
        if (last > i && this.session.noteState(right.id) === 'waiting') {
          const line = this.chords.next();
          line.tint = 0xffe066;
          line.alpha = 0.9;
          line.position.set(laneX(note.lane) + w / 2, headY - 2);
          line.width = laneX(right.lane) - laneX(note.lane);
          line.height = 4;
        }
      }

      const head = this.notes.next();
      head.tint = color;
      head.alpha = 1;
      head.scale.y = 1;
      head.position.set(x + 4, headY);
    }
    this.bodies.end();
    this.chords.end();
    this.notes.end();
  }
}
