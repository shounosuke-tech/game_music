/**
 * 時間の扱いをまとめたモジュール。
 *
 * 音楽ゲームでは「音声の時計（AudioContext.currentTime）」を唯一の基準にする。
 * requestAnimationFrame や Date.now() の時刻はフレーム落ちや精度の違いでずれるため、
 * 描画も判定も、すべてこのモジュールの関数で曲の時刻に換算してから扱う。
 */

/** AudioContext.getOutputTimestamp() が返す、音声の時刻と performance.now() の対応 */
export interface OutputTimestamp {
  /** 音声の時刻（秒） */
  readonly contextTime: number;
  /** 上と同じ瞬間の performance.now()（ミリ秒） */
  readonly performanceTime: number;
}

/**
 * performance.now() の時刻（入力イベントの timeStamp など）を音声の時刻に変換する。
 */
export function performanceToAudioTime(performanceMs: number, stamp: OutputTimestamp): number {
  return stamp.contextTime + (performanceMs - stamp.performanceTime) / 1000;
}

/**
 * 音声の時刻から曲の時刻を求める。
 *
 * @param audioTime 音声の時刻（秒）
 * @param songStartAudioTime 曲の 0 秒を再生した音声の時刻（秒）
 * @param offset ユーザーが設定するオフセット（秒）。正の値で判定・表示を遅らせる。
 */
export function toSongTime(audioTime: number, songStartAudioTime: number, offset = 0): number {
  return audioTime - songStartAudioTime - offset;
}

/** BPM 一定のときの、拍番号から秒への変換 */
export function beatToSeconds(beat: number, bpm: number): number {
  return (beat * 60) / bpm;
}

/** BPM 一定のときの、秒から拍番号への変換 */
export function secondsToBeat(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

/**
 * ノーツの画面上の Y 座標を求める。フレームごとに座標を足すのではなく、
 * 曲の現在時刻から毎回計算することで、フレーム落ちしても位置がずれない。
 *
 * @param noteTime ノーツの時刻（秒）
 * @param songTime 曲の現在時刻（秒）
 * @param judgeLineY 判定ラインの Y 座標（px）
 * @param pixelsPerSecond スクロール速度（px/秒）
 */
export function noteY(
  noteTime: number,
  songTime: number,
  judgeLineY: number,
  pixelsPerSecond: number,
): number {
  return judgeLineY - (noteTime - songTime) * pixelsPerSecond;
}
