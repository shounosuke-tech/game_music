import type { Judgment } from './judge';

export const MAX_SCORE = 1_000_000;

/** 配点の重み（整数で持ち、最後に一度だけ割る。初期案） */
const WEIGHT: Record<Judgment, number> = { perfect: 10, great: 7, good: 3, miss: 0 };
const MAX_WEIGHT = WEIGHT.perfect;

/** クリアゲージ（初期案） */
export const GAUGE = {
  clearThreshold: 70,
  /** Perfect / Great で全体として増える量（% 。ノーツ数で割って配る） */
  totalGain: 160,
  missPenalty: 4,
} as const;

export type ClearType = 'failed' | 'cleared' | 'fullCombo' | 'allPerfect';

export interface ScoreState {
  readonly totalObjects: number;
  readonly counts: Readonly<Record<Judgment, number>>;
  /** 早い側にずれた Great / Good の数 */
  readonly fast: number;
  /** 遅い側にずれた Great / Good の数 */
  readonly slow: number;
  readonly combo: number;
  readonly maxCombo: number;
  /** 0〜100 */
  readonly gauge: number;
  /** 重みの合計（スコア計算用） */
  readonly weightSum: number;
}

export function createScore(totalObjects: number): ScoreState {
  return {
    totalObjects,
    counts: { perfect: 0, great: 0, good: 0, miss: 0 },
    fast: 0,
    slow: 0,
    combo: 0,
    maxCombo: 0,
    gauge: 0,
    weightSum: 0,
  };
}

/**
 * 判定を1つ反映した新しい状態を返す。
 * @param delta 入力のずれ（秒）。見逃しなど入力がない場合は null。
 */
export function applyJudgment(state: ScoreState, j: Judgment, delta: number | null): ScoreState {
  const n = Math.max(state.totalObjects, 1);
  const combo = j === 'miss' ? 0 : state.combo + 1;
  const gain =
    j === 'miss'
      ? -GAUGE.missPenalty
      : j === 'good'
        ? GAUGE.totalGain / n / 2
        : GAUGE.totalGain / n;
  const offBeat = (j === 'great' || j === 'good') && delta !== null && delta !== 0;

  return {
    ...state,
    counts: { ...state.counts, [j]: state.counts[j] + 1 },
    fast: state.fast + (offBeat && delta < 0 ? 1 : 0),
    slow: state.slow + (offBeat && delta > 0 ? 1 : 0),
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
    gauge: Math.min(100, Math.max(0, state.gauge + gain)),
    weightSum: state.weightSum + WEIGHT[j],
  };
}

/** 現在のスコア（0〜1,000,000）。切り捨ては最後に1回だけ。 */
export function scoreValue(state: ScoreState): number {
  if (state.totalObjects === 0) return 0;
  return Math.floor((MAX_SCORE * state.weightSum) / (MAX_WEIGHT * state.totalObjects));
}

/** 曲の終了時のクリア種別 */
export function clearType(state: ScoreState): ClearType {
  const { counts, totalObjects } = state;
  if (totalObjects > 0 && counts.perfect === totalObjects) return 'allPerfect';
  if (totalObjects > 0 && counts.miss === 0 && judgedCount(state) === totalObjects) {
    return 'fullCombo';
  }
  return state.gauge >= GAUGE.clearThreshold ? 'cleared' : 'failed';
}

export function judgedCount(state: ScoreState): number {
  const c = state.counts;
  return c.perfect + c.great + c.good + c.miss;
}
