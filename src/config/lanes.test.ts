import { describe, expect, it } from 'vitest';
import {
  isLaneMode,
  keyLabel,
  LANE_MODES,
  laneIndexOf,
  laneKeys,
  laneKind,
  type LaneMode,
} from './lanes';

describe('キー配置', () => {
  it.each([
    [4, 'D F J K'],
    [5, 'D F SPACE J K'],
    [6, 'S D F J K L'],
    [7, 'S D F SPACE J K L'],
  ] as const)('%iレーンは %s', (mode, labels) => {
    expect(laneKeys(mode).map(keyLabel).join(' ')).toBe(labels);
  });

  it('各モードでキーが重複しない', () => {
    for (const mode of LANE_MODES) {
      expect(new Set(laneKeys(mode)).size).toBe(mode);
    }
  });

  it('キーからレーン番号を引ける', () => {
    expect(laneIndexOf(7, 'Space')).toBe(3);
    expect(laneIndexOf(4, 'Space')).toBe(-1);
    expect(laneIndexOf(6, 'KeyL')).toBe(5);
  });

  it('4〜7 だけがレーン数として有効', () => {
    expect(isLaneMode(4)).toBe(true);
    expect(isLaneMode(7)).toBe(true);
    expect(isLaneMode(3)).toBe(false);
    expect(isLaneMode(8)).toBe(false);
  });
});

describe('laneKind', () => {
  const kinds = (mode: LaneMode) =>
    laneKeys(mode)
      .map((_, i) => laneKind(mode, i))
      .join(' ');

  it('左右対称で、奇数レーンの中央は center', () => {
    expect(kinds(4)).toBe('outer inner inner outer');
    expect(kinds(5)).toBe('outer inner center inner outer');
    expect(kinds(6)).toBe('outer inner outer outer inner outer');
    expect(kinds(7)).toBe('outer inner outer center outer inner outer');
  });
});
