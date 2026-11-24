import { isLaneMode, type LaneMode } from '@/config/lanes';
import type { BpmEvent } from '@/core/timing';

/** 対応している譜面ファイルの版 */
export const CHART_VERSION = 1;

export interface MeterEvent {
  readonly tick: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface ChartNote {
  readonly tick: number;
  readonly lane: number;
  /** ロングノーツの終点。通常ノーツは省略 */
  readonly endTick?: number;
}

/** 譜面ファイル（JSON）の形。詳細設計書 4.3 */
export interface ChartFile {
  readonly version: number;
  readonly lanes: LaneMode;
  /** 曲の先頭から tick 0 までの時間（ミリ秒） */
  readonly offsetMs: number;
  readonly bpm: readonly BpmEvent[];
  readonly meter: readonly MeterEvent[];
  readonly notes: readonly ChartNote[];
}

export class ChartError extends Error {
  override name = 'ChartError';
  constructor(
    /** 問題のある場所（例: notes[12].lane） */
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTick = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function field<T>(
  obj: Json,
  key: string,
  path: string,
  check: (v: unknown) => v is T,
  rule: string,
): T {
  const v = obj[key];
  if (!check(v)) throw new ChartError(`${path}.${key}`.replace(/^\./, ''), rule);
  return v;
}

function array(obj: Json, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) throw new ChartError(key, '配列にしてください');
  return v;
}

/**
 * 譜面ファイルの JSON を検証して ChartFile にする。
 * 不正な場合は、どこがどのルールに違反しているかを含む ChartError を投げる。
 */
export function parseChart(json: unknown): ChartFile {
  if (!isObject(json)) throw new ChartError('(root)', 'オブジェクトにしてください');

  const version = field(
    json,
    'version',
    '',
    (v): v is number => Number.isInteger(v),
    '整数にしてください',
  );
  if (version !== CHART_VERSION) {
    throw new ChartError('version', `対応していない版です（対応: ${CHART_VERSION}）`);
  }
  const lanes = field(
    json,
    'lanes',
    '',
    (v): v is LaneMode => typeof v === 'number' && isLaneMode(v),
    '4〜7 にしてください',
  );
  const offsetMs = field(
    json,
    'offsetMs',
    '',
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
    '数値にしてください',
  );

  const bpm = array(json, 'bpm').map((raw, i): BpmEvent => {
    const p = `bpm[${i}]`;
    if (!isObject(raw)) throw new ChartError(p, 'オブジェクトにしてください');
    return {
      tick: field(raw, 'tick', p, isTick, '0 以上の整数にしてください'),
      bpm: field(
        raw,
        'bpm',
        p,
        (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
        '0 より大きい数にしてください',
      ),
    };
  });
  if (bpm.length === 0) throw new ChartError('bpm', '1つ以上必要です');
  if (bpm[0]!.tick !== 0) throw new ChartError('bpm[0].tick', '0 にしてください');
  bpm.forEach((ev, i) => {
    if (i > 0 && ev.tick <= bpm[i - 1]!.tick) {
      throw new ChartError(`bpm[${i}].tick`, '昇順にし、同じ位置に複数置かないでください');
    }
  });

  const meter = (json.meter === undefined ? [] : array(json, 'meter')).map((raw, i): MeterEvent => {
    const p = `meter[${i}]`;
    if (!isObject(raw)) throw new ChartError(p, 'オブジェクトにしてください');
    const positive = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
    return {
      tick: field(raw, 'tick', p, isTick, '0 以上の整数にしてください'),
      numerator: field(raw, 'numerator', p, positive, '1 以上の整数にしてください'),
      denominator: field(raw, 'denominator', p, positive, '1 以上の整数にしてください'),
    };
  });

  const notes = array(json, 'notes').map((raw, i): ChartNote => {
    const p = `notes[${i}]`;
    if (!isObject(raw)) throw new ChartError(p, 'オブジェクトにしてください');
    const tick = field(raw, 'tick', p, isTick, '0 以上の整数にしてください');
    const lane = field(
      raw,
      'lane',
      p,
      (v): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < lanes,
      `0 以上 ${lanes} 未満の整数にしてください`,
    );
    if (raw.endTick === undefined) return { tick, lane };
    const endTick = field(raw, 'endTick', p, isTick, '0 以上の整数にしてください');
    if (endTick <= tick) throw new ChartError(`${p}.endTick`, 'tick より後にしてください');
    return { tick, lane, endTick };
  });

  checkOverlaps(notes);
  return { version, lanes, offsetMs, bpm, meter, notes };
}

/** 同じレーンでノーツが重ならないこと（ロングノーツの区間の中に別のノーツがない） */
function checkOverlaps(notes: readonly ChartNote[]): void {
  const byLane = new Map<number, { note: ChartNote; index: number }[]>();
  notes.forEach((note, index) => {
    const list = byLane.get(note.lane) ?? [];
    list.push({ note, index });
    byLane.set(note.lane, list);
  });
  for (const list of byLane.values()) {
    list.sort((a, b) => a.note.tick - b.note.tick);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      const prevEnd = prev.note.endTick ?? prev.note.tick;
      if (cur.note.tick <= prevEnd) {
        throw new ChartError(
          `notes[${cur.index}]`,
          `同じレーンの notes[${prev.index}] と重なっています`,
        );
      }
    }
  }
}
