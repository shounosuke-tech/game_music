import { describe, expect, it } from 'vitest';
import type { Judgment } from './judge';
import {
  applyJudgment,
  clearType,
  createScore,
  MAX_SCORE,
  scoreValue,
  type ScoreState,
} from './score';

function play(total: number, judgments: readonly Judgment[], delta: number | null = 0): ScoreState {
  return judgments.reduce((s, j) => applyJudgment(s, j, delta), createScore(total));
}

const repeat = (j: Judgment, n: number): Judgment[] => Array<Judgment>(n).fill(j);

describe('スコア', () => {
  it.each([1, 3, 7, 333, 1234, 9999])('全 Perfect（%i ノーツ）でちょうど 1,000,000 点', (n) => {
    expect(scoreValue(play(n, repeat('perfect', n)))).toBe(MAX_SCORE);
  });

  it('配点は Perfect 100% / Great 70% / Good 30% / Miss 0%', () => {
    expect(scoreValue(play(1, ['great']))).toBe(700_000);
    expect(scoreValue(play(1, ['good']))).toBe(300_000);
    expect(scoreValue(play(1, ['miss']))).toBe(0);
    expect(scoreValue(play(4, ['perfect', 'great', 'good', 'miss']))).toBe(500_000);
  });

  it('端数は切り捨てる', () => {
    // 3 ノーツ中 1 Perfect = 333,333.33…
    expect(scoreValue(play(3, ['perfect']))).toBe(333_333);
  });

  it('ノーツ数 0 では 0 点', () => {
    expect(scoreValue(createScore(0))).toBe(0);
  });
});

describe('コンボ', () => {
  it('Miss で 0 に戻り、最大コンボは残る', () => {
    const s = play(10, ['perfect', 'great', 'good', 'miss', 'perfect']);
    expect(s.combo).toBe(1);
    expect(s.maxCombo).toBe(3);
  });
});

describe('早い / 遅い', () => {
  it('Great と Good のずれの向きを数え、Perfect と Miss は数えない', () => {
    let s = createScore(10);
    s = applyJudgment(s, 'great', -0.05);
    s = applyJudgment(s, 'good', 0.08);
    s = applyJudgment(s, 'good', 0.09);
    s = applyJudgment(s, 'perfect', -0.01);
    s = applyJudgment(s, 'miss', null);
    expect(s.fast).toBe(1);
    expect(s.slow).toBe(2);
  });
});

describe('クリアゲージ', () => {
  it('全 Perfect なら上限 100 で止まる', () => {
    expect(play(100, repeat('perfect', 100)).gauge).toBe(100);
  });

  it('0 より下がらない', () => {
    expect(play(100, repeat('miss', 5)).gauge).toBe(0);
  });

  it('Good は Perfect の半分だけ増える', () => {
    expect(play(100, ['good']).gauge).toBeCloseTo(0.8, 12);
    expect(play(100, ['perfect']).gauge).toBeCloseTo(1.6, 12);
  });
});

describe('クリア種別', () => {
  it('全 Perfect はオールパーフェクト', () => {
    expect(clearType(play(5, repeat('perfect', 5)))).toBe('allPerfect');
  });

  it('Miss がなく全部判定済みならフルコンボ', () => {
    expect(clearType(play(5, [...repeat('perfect', 4), 'good']))).toBe('fullCombo');
  });

  it('Miss があってもゲージ 70% 以上ならクリア', () => {
    expect(clearType(play(100, [...repeat('perfect', 90), ...repeat('miss', 2)]))).toBe('cleared');
  });

  it('ゲージ 70% 未満ならクリア失敗', () => {
    expect(clearType(play(100, [...repeat('perfect', 40), ...repeat('miss', 60)]))).toBe('failed');
  });
});
