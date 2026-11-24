import type { LaneMode } from '@/config/lanes';
import { createTimingMap, TICKS_PER_BEAT } from '@/core/timing';
import type { ChartFile } from './schema';

/** ゲームで使う形のノーツ。時刻はすべて曲時刻（秒）。 */
export interface PlayableNote {
  /** notes 配列での位置と同じ */
  readonly id: number;
  readonly lane: number;
  readonly time: number;
  /** ロングノーツの終点。通常ノーツは null */
  readonly endTime: number | null;
  /** 同時押しのグループ。単独なら null */
  readonly chordId: number | null;
}

export interface PlayableChart {
  readonly lanes: LaneMode;
  /** time の昇順。同時刻はレーン番号の昇順 */
  readonly notes: readonly PlayableNote[];
  /** スコア計算の分母（通常ノーツ1、ロングノーツ2） */
  readonly totalObjects: number;
  /** 最後のノーツ（終点を含む）の時刻 */
  readonly endTime: number;
  /** 小節線の時刻（表示用） */
  readonly barLines: readonly number[];
}

/**
 * 譜面ファイルを、ゲームで使う形に変換する。
 * @param extraOffsetSec 音源ごとのずれなど、譜面の外から足すオフセット（秒）
 */
export function buildPlayableChart(chart: ChartFile, extraOffsetSec = 0): PlayableChart {
  const map = createTimingMap(chart.bpm);
  const shift = chart.offsetMs / 1000 + extraOffsetSec;

  const sorted = [...chart.notes].sort((a, b) => a.tick - b.tick || a.lane - b.lane);

  // 同じ tick に2個以上あれば同時押しのグループにする
  const countByTick = new Map<number, number>();
  for (const n of sorted) countByTick.set(n.tick, (countByTick.get(n.tick) ?? 0) + 1);
  const chordIdByTick = new Map<number, number>();
  let nextChordId = 0;

  let endTime = 0;
  let totalObjects = 0;
  const notes = sorted.map((n, id): PlayableNote => {
    let chordId: number | null = null;
    if ((countByTick.get(n.tick) ?? 0) > 1) {
      chordId = chordIdByTick.get(n.tick) ?? nextChordId++;
      chordIdByTick.set(n.tick, chordId);
    }
    const time = map.tickToSeconds(n.tick) + shift;
    const end = n.endTick === undefined ? null : map.tickToSeconds(n.endTick) + shift;
    endTime = Math.max(endTime, end ?? time);
    totalObjects += end === null ? 1 : 2;
    return { id, lane: n.lane, time, endTime: end, chordId };
  });

  return {
    lanes: chart.lanes,
    notes,
    totalObjects,
    endTime,
    barLines: barLines(chart, map.tickToSeconds, shift, endTime),
  };
}

function barLines(
  chart: ChartFile,
  tickToSeconds: (tick: number) => number,
  shift: number,
  endTime: number,
): number[] {
  const meters = chart.meter.length > 0 ? chart.meter : [{ tick: 0, numerator: 4, denominator: 4 }];
  const lines: number[] = [];
  let m = 0;
  let tick = 0;
  // 安全のため本数に上限を設ける
  for (let guard = 0; guard < 10_000; guard++) {
    while (m + 1 < meters.length && meters[m + 1]!.tick <= tick) m++;
    const t = tickToSeconds(tick) + shift;
    if (t > endTime) break;
    lines.push(t);
    const meter = meters[m]!;
    tick += (meter.numerator * 4 * TICKS_PER_BEAT) / meter.denominator;
  }
  return lines;
}
