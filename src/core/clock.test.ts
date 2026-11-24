import { describe, expect, it } from 'vitest';
import { beatToSeconds, noteY, performanceToAudioTime, secondsToBeat, toSongTime } from './clock';

describe('performanceToAudioTime', () => {
  it('performance.now() の差分を秒にして音声の時刻へ足す', () => {
    const stamp = { contextTime: 10, performanceTime: 5000 };
    expect(performanceToAudioTime(5000, stamp)).toBe(10);
    expect(performanceToAudioTime(5250, stamp)).toBeCloseTo(10.25);
    expect(performanceToAudioTime(4900, stamp)).toBeCloseTo(9.9);
  });
});

describe('toSongTime', () => {
  it('曲の開始時刻とオフセットを引く', () => {
    expect(toSongTime(12, 2)).toBe(10);
    expect(toSongTime(12, 2, 0.05)).toBeCloseTo(9.95);
  });
});

describe('beat と秒の変換', () => {
  it('BPM120 では1拍0.5秒', () => {
    expect(beatToSeconds(1, 120)).toBe(0.5);
    expect(beatToSeconds(8, 120)).toBe(4);
    expect(secondsToBeat(4, 120)).toBe(8);
  });
});

describe('noteY', () => {
  it('ノーツの時刻ちょうどで判定ライン上にある', () => {
    expect(noteY(5, 5, 600, 800)).toBe(600);
  });
  it('0.5秒前なら判定ラインより 400px 上にある', () => {
    expect(noteY(5, 4.5, 600, 800)).toBe(200);
  });
});
