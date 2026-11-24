import { describe, expect, it } from 'vitest';
import { DEFAULT_JUDGE_WINDOWS, isMissedByTime, judge, judgeRelease } from './judge';

describe('judge', () => {
  it.each([
    [0, 'perfect'],
    [0.033, 'perfect'],
    [-0.033, 'perfect'],
    [0.05, 'great'],
    [-0.066, 'great'],
    [0.08, 'good'],
    [-0.1, 'good'],
    [0.15, 'miss'],
  ] as const)('ずれ %s 秒は %s', (delta, expected) => {
    expect(judge(delta)).toBe(expected);
  });

  it('good の幅より早い入力は判定しない', () => {
    expect(judge(-0.101)).toBeNull();
    expect(judge(-1)).toBeNull();
  });

  it('判定幅を差し替えられる', () => {
    const strict = { perfect: 0.016, great: 0.033, good: 0.05 };
    expect(judge(0.02, strict)).toBe('great');
    expect(judge(0.06, strict)).toBe('miss');
  });
});

describe('judgeRelease', () => {
  it.each([
    [0, 'perfect'],
    [0.5, 'perfect'],
    [-0.02, 'perfect'],
    [-0.05, 'great'],
    [-0.09, 'good'],
    [-0.101, 'miss'],
    [-1, 'miss'],
  ] as const)('終点からのずれ %s 秒で離すと %s', (delta, expected) => {
    expect(judgeRelease(delta)).toBe(expected);
  });
});

describe('isMissedByTime', () => {
  it('good の幅を過ぎたら見逃し', () => {
    // 0 を基準にして浮動小数点の誤差が出ないようにする
    expect(isMissedByTime(0, DEFAULT_JUDGE_WINDOWS.good)).toBe(false);
    expect(isMissedByTime(0, DEFAULT_JUDGE_WINDOWS.good + 0.001)).toBe(true);
  });
});
