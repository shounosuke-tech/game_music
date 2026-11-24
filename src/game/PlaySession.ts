import type { PlayableChart, PlayableNote } from '@/core/chart';
import {
  DEFAULT_JUDGE_WINDOWS,
  isMissedByTime,
  judge,
  judgeRelease,
  type JudgeWindows,
  type Judgment,
} from '@/core/judge';
import { applyJudgment, createScore, type ScoreState } from '@/core/score';

export type NoteState = 'waiting' | 'holding' | 'done';

export interface JudgmentEvent {
  readonly note: PlayableNote;
  /** 通常ノーツと、ロングノーツの始点は head。ロングノーツの終点は tail */
  readonly part: 'head' | 'tail';
  readonly judgment: Judgment;
  /** 入力のずれ（秒）。見逃しや、終点まで押し続けた場合は null */
  readonly delta: number | null;
}

export interface PlaySessionOptions {
  readonly windows?: JudgeWindows;
  readonly onJudgment?: (event: JudgmentEvent) => void;
}

// 状態は Uint8Array に数値で持つ（0 = waiting が初期値）
const HOLDING = 1;
const DONE = 2;
const STATE_NAMES: readonly NoteState[] = ['waiting', 'holding', 'done'];

/**
 * 1回のプレイの進行（詳細設計書 6 章）。
 * 描画やブラウザの機能には依存しない。時刻はすべて判定用の曲時刻（オフセット適用済み）で受け取る。
 */
export class PlaySession {
  private readonly windows: JudgeWindows;
  private readonly onJudgment: ((event: JudgmentEvent) => void) | undefined;
  private readonly states: Uint8Array;
  /** レーンごとのノーツ id（時刻順） */
  private readonly laneNotes: number[][];
  /** レーンごとの「次に判定するノーツ」の laneNotes 上の位置 */
  private readonly cursor: number[];
  /** レーンごとに押し続けているロングノーツの id。なければ -1 */
  private readonly holding: number[];
  private remainingObjects: number;
  private scoreState: ScoreState;

  constructor(
    readonly chart: PlayableChart,
    options: PlaySessionOptions = {},
  ) {
    this.windows = options.windows ?? DEFAULT_JUDGE_WINDOWS;
    this.onJudgment = options.onJudgment;
    this.states = new Uint8Array(chart.notes.length);
    this.laneNotes = Array.from({ length: chart.lanes }, () => []);
    for (const note of chart.notes) this.laneNotes[note.lane]!.push(note.id);
    this.cursor = Array<number>(chart.lanes).fill(0);
    this.holding = Array<number>(chart.lanes).fill(-1);
    this.remainingObjects = chart.totalObjects;
    this.scoreState = createScore(chart.totalObjects);
  }

  get score(): ScoreState {
    return this.scoreState;
  }

  /** すべての判定オブジェクトの判定が済んだか */
  get isComplete(): boolean {
    return this.remainingObjects === 0;
  }

  noteState(id: number): NoteState {
    return STATE_NAMES[this.states[id]!]!;
  }

  isHolding(lane: number): boolean {
    return (this.holding[lane] ?? -1) >= 0;
  }

  /** 毎フレーム呼ぶ。見逃しと、押し続けたロングノーツの終点を処理する。 */
  update(songTime: number): void {
    for (let lane = 0; lane < this.chart.lanes; lane++) {
      const held = this.holding[lane]!;
      if (held >= 0) {
        const note = this.chart.notes[held]!;
        if (songTime >= note.endTime!) this.finishHold(lane, note, 'perfect', null);
      }

      for (;;) {
        const note = this.nextNote(lane);
        if (!note || !isMissedByTime(note.time, songTime, this.windows)) break;
        this.cursor[lane]!++;
        this.emit(note, 'head', 'miss', null);
        if (note.endTime !== null) this.emit(note, 'tail', 'miss', null);
        this.states[note.id] = DONE;
      }
    }
  }

  /** キーを押した */
  press(lane: number, songTime: number): void {
    if (this.isHolding(lane)) return;
    const note = this.nextNote(lane);
    if (!note) return;
    const delta = songTime - note.time;
    const result = judge(delta, this.windows);
    if (result === null) return; // 早すぎる入力は空打ち

    this.cursor[lane]!++;
    this.emit(note, 'head', result, delta);
    if (note.endTime === null) {
      this.states[note.id] = DONE;
    } else if (result === 'miss') {
      this.emit(note, 'tail', 'miss', null);
      this.states[note.id] = DONE;
    } else {
      this.states[note.id] = HOLDING;
      this.holding[lane] = note.id;
    }
  }

  /** キーを離した */
  release(lane: number, songTime: number): void {
    const held = this.holding[lane] ?? -1;
    if (held < 0) return;
    const note = this.chart.notes[held]!;
    const delta = songTime - note.endTime!;
    this.finishHold(lane, note, judgeRelease(delta, this.windows), delta < 0 ? delta : null);
  }

  /** フォーカスが外れたときなど、押しているキーをすべて離したことにする */
  releaseAll(songTime: number): void {
    for (let lane = 0; lane < this.chart.lanes; lane++) this.release(lane, songTime);
  }

  private nextNote(lane: number): PlayableNote | undefined {
    const id = this.laneNotes[lane]![this.cursor[lane]!];
    return id === undefined ? undefined : this.chart.notes[id];
  }

  private finishHold(
    lane: number,
    note: PlayableNote,
    result: Judgment,
    delta: number | null,
  ): void {
    this.holding[lane] = -1;
    this.states[note.id] = DONE;
    this.emit(note, 'tail', result, delta);
  }

  private emit(
    note: PlayableNote,
    part: 'head' | 'tail',
    judgment: Judgment,
    delta: number | null,
  ): void {
    this.remainingObjects--;
    this.scoreState = applyJudgment(this.scoreState, judgment, delta);
    this.onJudgment?.({ note, part, judgment, delta });
  }
}
