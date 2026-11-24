/** 判定の種類 */
export type Judgment = 'perfect' | 'great' | 'good' | 'miss';

/** 判定幅（秒）。値は「ノーツの時刻からのずれの絶対値」の上限。 */
export interface JudgeWindows {
  readonly perfect: number;
  readonly great: number;
  readonly good: number;
}

/** 初期値。Phase 2 で試しながら調整する。 */
export const DEFAULT_JUDGE_WINDOWS: JudgeWindows = {
  perfect: 0.033,
  great: 0.066,
  good: 0.1,
};

/**
 * 入力のずれから判定を返す。
 *
 * @param delta 入力時刻 − ノーツ時刻（秒）。負なら早押し、正なら遅押し。
 * @returns 判定。good の幅より早い入力は「まだ叩く対象ではない」ため null を返す。
 */
export function judge(
  delta: number,
  windows: JudgeWindows = DEFAULT_JUDGE_WINDOWS,
): Judgment | null {
  if (delta < -windows.good) return null;
  const abs = Math.abs(delta);
  if (abs <= windows.perfect) return 'perfect';
  if (abs <= windows.great) return 'great';
  if (abs <= windows.good) return 'good';
  return 'miss';
}

/** 叩かれないまま good の幅を過ぎたノーツは見逃し（miss）になる。 */
export function isMissedByTime(
  noteTime: number,
  songTime: number,
  windows: JudgeWindows = DEFAULT_JUDGE_WINDOWS,
): boolean {
  return songTime - noteTime > windows.good;
}
