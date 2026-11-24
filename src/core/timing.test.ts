import { describe, expect, it } from 'vitest';
import { createTimingMap, TICKS_PER_BEAT as T, TimingError } from './timing';

describe('createTimingMap', () => {
  it('BPM 一定（120）では1拍 0.5 秒', () => {
    const map = createTimingMap([{ tick: 0, bpm: 120 }]);
    expect(map.tickToSeconds(0)).toBe(0);
    expect(map.tickToSeconds(T)).toBe(0.5);
    expect(map.tickToSeconds(T * 8)).toBe(4);
    expect(map.secondsToTick(4)).toBeCloseTo(T * 8, 9);
  });

  it('1/32 拍と3連符も正しく変換できる', () => {
    const map = createTimingMap([{ tick: 0, bpm: 120 }]);
    expect(map.tickToSeconds(T / 8)).toBeCloseTo(0.0625, 12); // 1/32 音符
    expect(map.tickToSeconds(T / 3)).toBeCloseTo(0.5 / 3, 12); // 3連符
  });

  describe('BPM の変化あり（120 → 4拍後に 240 → さらに 4拍後に 60）', () => {
    const map = createTimingMap([
      { tick: 0, bpm: 120 },
      { tick: T * 4, bpm: 240 },
      { tick: T * 8, bpm: 60 },
    ]);

    it.each([
      [0, 0],
      [T * 4, 2], // 120BPM で 4 拍 = 2 秒
      [T * 6, 2.5], // 240BPM で 2 拍 = 0.5 秒
      [T * 8, 3],
      [T * 9, 4], // 60BPM で 1 拍 = 1 秒
    ])('tick %i は %f 秒', (tick, sec) => {
      expect(map.tickToSeconds(tick)).toBeCloseTo(sec, 12);
    });

    it('秒 → tick → 秒 の往復で値が変わらない', () => {
      for (const sec of [0, 0.3, 1.99, 2, 2.01, 2.7, 3, 3.5, 10]) {
        expect(map.tickToSeconds(map.secondsToTick(sec))).toBeCloseTo(sec, 9);
      }
    });

    it('境界の tick ちょうどは新しい BPM の区間に属する', () => {
      expect(map.secondsToTick(2)).toBeCloseTo(T * 4, 9);
      expect(map.secondsToTick(3)).toBeCloseTo(T * 8, 9);
    });
  });

  it('負の時刻は最初の BPM で外挿する', () => {
    const map = createTimingMap([{ tick: 0, bpm: 120 }]);
    expect(map.tickToSeconds(-T)).toBe(-0.5);
    expect(map.secondsToTick(-0.5)).toBeCloseTo(-T, 9);
  });

  it.each([
    ['空', []],
    ['先頭が tick 0 でない', [{ tick: 10, bpm: 120 }]],
    ['BPM が 0', [{ tick: 0, bpm: 0 }]],
    ['BPM が負', [{ tick: 0, bpm: -120 }]],
    [
      '昇順でない',
      [
        { tick: 0, bpm: 120 },
        { tick: 0, bpm: 140 },
      ],
    ],
    ['tick が小数', [{ tick: 0.5, bpm: 120 }]],
  ])('不正な入力（%s）は例外', (_, events) => {
    expect(() => createTimingMap(events)).toThrow(TimingError);
  });
});
