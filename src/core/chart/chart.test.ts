import { describe, expect, it } from 'vitest';
import { TICKS_PER_BEAT as T } from '@/core/timing';
import { buildPlayableChart, ChartError, parseChart } from './index';

const base = {
  version: 1,
  lanes: 4,
  offsetMs: 0,
  bpm: [{ tick: 0, bpm: 120 }],
  meter: [{ tick: 0, numerator: 4, denominator: 4 }],
  notes: [] as unknown[],
};

const withNotes = (notes: unknown[], extra: Record<string, unknown> = {}) => ({
  ...base,
  ...extra,
  notes,
});

function expectChartError(json: unknown, path: string): void {
  try {
    parseChart(json);
  } catch (e) {
    expect(e).toBeInstanceOf(ChartError);
    expect((e as ChartError).path).toBe(path);
    return;
  }
  throw new Error('ChartError が投げられませんでした');
}

describe('parseChart', () => {
  it('正しい譜面を読み込める', () => {
    const chart = parseChart(
      withNotes([
        { tick: 0, lane: 0 },
        { tick: T, lane: 3, endTick: T * 2 },
      ]),
    );
    expect(chart.lanes).toBe(4);
    expect(chart.notes).toHaveLength(2);
    expect(chart.notes[1]).toEqual({ tick: T, lane: 3, endTick: T * 2 });
  });

  it('meter は省略できる', () => {
    const noMeter: Record<string, unknown> = { ...base };
    delete noMeter.meter;
    expect(parseChart(noMeter).meter).toEqual([]);
  });

  it.each([
    ['(root)', null],
    ['version', { ...base, version: 2 }],
    ['lanes', { ...base, lanes: 8 }],
    ['offsetMs', { ...base, offsetMs: 'x' }],
    ['bpm', { ...base, bpm: [] }],
    ['bpm[0].tick', { ...base, bpm: [{ tick: 10, bpm: 120 }] }],
    ['bpm[0].bpm', { ...base, bpm: [{ tick: 0, bpm: 0 }] }],
    [
      'bpm[1].tick',
      {
        ...base,
        bpm: [
          { tick: 0, bpm: 120 },
          { tick: 0, bpm: 150 },
        ],
      },
    ],
    ['notes[0].tick', withNotes([{ tick: -1, lane: 0 }])],
    ['notes[0].tick', withNotes([{ tick: 1.5, lane: 0 }])],
    ['notes[0].lane', withNotes([{ tick: 0, lane: 4 }])],
    ['notes[0].endTick', withNotes([{ tick: T, lane: 0, endTick: T }])],
    ['meter[0].denominator', { ...base, meter: [{ tick: 0, numerator: 4, denominator: 0 }] }],
  ])('違反の場所 %s を報告する', (path, json) => {
    expectChartError(json, path);
  });

  it('同じレーン・同じ位置のノーツを検出する', () => {
    expectChartError(
      withNotes([
        { tick: T, lane: 1 },
        { tick: T, lane: 1 },
      ]),
      'notes[1]',
    );
  });

  it('ロングノーツの区間に入り込んだノーツを検出する', () => {
    expectChartError(
      withNotes([
        { tick: T, lane: 2, endTick: T * 3 },
        { tick: T * 2, lane: 2 },
      ]),
      'notes[1]',
    );
  });

  it('ロングノーツの終点ちょうどのノーツも重なりとして扱う', () => {
    expectChartError(
      withNotes([
        { tick: 0, lane: 0, endTick: T },
        { tick: T, lane: 0 },
      ]),
      'notes[1]',
    );
  });

  it('違うレーンなら同じ位置に置ける', () => {
    expect(() =>
      parseChart(
        withNotes([
          { tick: T, lane: 0, endTick: T * 2 },
          { tick: T, lane: 1 },
        ]),
      ),
    ).not.toThrow();
  });
});

describe('buildPlayableChart', () => {
  const chart = parseChart(
    withNotes(
      [
        { tick: T * 2, lane: 3 },
        { tick: T, lane: 2, endTick: T * 3 },
        { tick: T * 2, lane: 0 },
        { tick: 0, lane: 1 },
      ],
      { offsetMs: 100 },
    ),
  );
  const playable = buildPlayableChart(chart, 0.05);

  it('時刻順・同時刻はレーン順に並べ、id を振り直す', () => {
    expect(playable.notes.map((n) => [n.id, n.lane])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 3],
    ]);
  });

  it('時刻に譜面のオフセットと外部のオフセットを足す', () => {
    // tick 0 = 0 秒 + 0.1 + 0.05
    expect(playable.notes[0]!.time).toBeCloseTo(0.15, 12);
    // ロングノーツ: 0.5 秒〜1.5 秒
    expect(playable.notes[1]!.time).toBeCloseTo(0.65, 12);
    expect(playable.notes[1]!.endTime).toBeCloseTo(1.65, 12);
    expect(playable.notes[0]!.endTime).toBeNull();
  });

  it('同じ時刻のノーツを同時押しのグループにする', () => {
    expect(playable.notes[2]!.chordId).not.toBeNull();
    expect(playable.notes[2]!.chordId).toBe(playable.notes[3]!.chordId);
    expect(playable.notes[0]!.chordId).toBeNull();
    expect(playable.notes[1]!.chordId).toBeNull();
  });

  it('判定オブジェクト数はロングノーツを2個と数える', () => {
    expect(playable.totalObjects).toBe(5);
  });

  it('終了時刻はロングノーツの終点を含めた最後の時刻', () => {
    expect(playable.endTime).toBeCloseTo(1.65, 12);
  });

  it('小節線を終了時刻まで並べる', () => {
    // 4/4・120BPM で 1 小節 2 秒。0.15 秒の1本だけ
    expect(playable.barLines).toHaveLength(1);
    expect(playable.barLines[0]).toBeCloseTo(0.15, 12);
  });
});
