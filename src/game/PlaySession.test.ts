import { describe, expect, it } from 'vitest';
import type { PlayableChart, PlayableNote } from '@/core/chart';
import { MAX_SCORE, scoreValue } from '@/core/score';
import { PlaySession, type JudgmentEvent } from './PlaySession';

/** [lane, time, endTime?] の配列から譜面を作る */
function chart(defs: [number, number, number?][]): PlayableChart {
  const notes: PlayableNote[] = defs
    .map(([lane, time, endTime]) => ({ lane, time, endTime: endTime ?? null }))
    .sort((a, b) => a.time - b.time || a.lane - b.lane)
    .map((n, id) => ({ ...n, id, chordId: null }));
  return {
    lanes: 4,
    notes,
    totalObjects: notes.reduce((s, n) => s + (n.endTime === null ? 1 : 2), 0),
    endTime: Math.max(0, ...notes.map((n) => n.endTime ?? n.time)),
    barLines: [],
  };
}

function setup(defs: [number, number, number?][]) {
  const events: JudgmentEvent[] = [];
  const session = new PlaySession(chart(defs), { onJudgment: (e) => events.push(e) });
  const log = () => events.map((e) => `${e.note.id}:${e.part}:${e.judgment}`);
  return { session, events, log };
}

describe('通常ノーツ', () => {
  it('ちょうどで押すと Perfect', () => {
    const { session, log } = setup([[0, 1]]);
    session.press(0, 1.0);
    expect(log()).toEqual(['0:head:perfect']);
    expect(session.noteState(0)).toBe('done');
    expect(session.isComplete).toBe(true);
  });

  it('ずれに応じて判定し、ずれを記録する', () => {
    const { session, events } = setup([[0, 1]]);
    session.press(0, 1.05);
    expect(events[0]!.judgment).toBe('great');
    expect(events[0]!.delta).toBeCloseTo(0.05, 12);
  });

  it('早すぎる入力は空打ちで、ノーツは残る', () => {
    const { session, log } = setup([[0, 1]]);
    session.press(0, 0.5);
    expect(log()).toEqual([]);
    expect(session.noteState(0)).toBe('waiting');
  });

  it('違うレーンの入力では判定しない', () => {
    const { session, log } = setup([[0, 1]]);
    session.press(1, 1.0);
    expect(log()).toEqual([]);
  });

  it('Good の幅を過ぎると見逃しで Miss', () => {
    const { session, log } = setup([[0, 1]]);
    session.update(1.099); // Good の幅（0.1 秒）の内側
    expect(log()).toEqual([]);
    session.update(1.101);
    expect(log()).toEqual(['0:head:miss']);
  });

  it('同じレーンの連続ノーツは先のものから順に判定する', () => {
    const { session, log } = setup([
      [0, 1],
      [0, 1.15],
    ]);
    session.press(0, 1.08); // 1つ目に Good（2つ目には近いが、先のノーツが優先）
    session.press(0, 1.15);
    expect(log()).toEqual(['0:head:good', '1:head:perfect']);
  });

  it('時間が飛んでも、過ぎたノーツはすべて見逃しになる', () => {
    const { session, log } = setup([
      [0, 1],
      [0, 2],
      [1, 3],
    ]);
    session.update(10);
    expect(log()).toEqual(['0:head:miss', '1:head:miss', '2:head:miss']);
    expect(session.isComplete).toBe(true);
  });
});

describe('ロングノーツ', () => {
  it('押して終点まで押し続けると、始点と終点がともに判定される', () => {
    const { session, log } = setup([[2, 1, 2]]);
    session.press(2, 1.0);
    expect(session.noteState(0)).toBe('holding');
    expect(session.isHolding(2)).toBe(true);
    session.update(1.99);
    expect(log()).toEqual(['0:head:perfect']);
    session.update(2.0);
    expect(log()).toEqual(['0:head:perfect', '0:tail:perfect']);
    expect(session.isHolding(2)).toBe(false);
    expect(session.isComplete).toBe(true);
  });

  it('終点の少し前に離すと、ずれに応じた判定', () => {
    const { session, events } = setup([[2, 1, 2]]);
    session.press(2, 1.0);
    session.release(2, 1.95);
    expect(events[1]!.part).toBe('tail');
    expect(events[1]!.judgment).toBe('great');
    expect(events[1]!.delta).toBeCloseTo(-0.05, 12);
  });

  it('早く離しすぎると終点は Miss', () => {
    const { session, log } = setup([[2, 1, 2]]);
    session.press(2, 1.0);
    session.release(2, 1.5);
    expect(log()).toEqual(['0:head:perfect', '0:tail:miss']);
  });

  it('始点を見逃すと、終点も Miss', () => {
    const { session, log } = setup([[2, 1, 2]]);
    session.update(1.2);
    expect(log()).toEqual(['0:head:miss', '0:tail:miss']);
  });

  it('押している間は同じレーンの別のノーツを判定しない', () => {
    const { session, log } = setup([
      [2, 1, 2],
      [2, 2.5],
    ]);
    session.press(2, 1.0);
    session.press(2, 1.5); // キーリピートなどの二重押し
    expect(log()).toEqual(['0:head:perfect']);
  });

  it('releaseAll で押しているロングノーツをすべて離す', () => {
    const { session, log } = setup([
      [0, 1, 3],
      [3, 1, 3],
    ]);
    session.press(0, 1);
    session.press(3, 1);
    session.releaseAll(1.5);
    expect(log()).toEqual(['0:head:perfect', '1:head:perfect', '0:tail:miss', '1:tail:miss']);
  });
});

describe('スコアとの連携', () => {
  it('全 Perfect で 1,000,000 点、最大コンボは判定オブジェクト数', () => {
    const { session } = setup([
      [0, 1],
      [1, 1.5, 2],
      [3, 2.5],
    ]);
    session.press(0, 1);
    session.press(1, 1.5);
    session.update(2);
    session.press(3, 2.5);
    expect(scoreValue(session.score)).toBe(MAX_SCORE);
    expect(session.score.maxCombo).toBe(4);
  });
});
