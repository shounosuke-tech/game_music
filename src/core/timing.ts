/** 1拍あたりの tick 数。2・3・4・8・16 で割り切れ、1/32 拍や3連符を整数で表せる。 */
export const TICKS_PER_BEAT = 960;

export interface BpmEvent {
  /** この位置から */
  readonly tick: number;
  /** この BPM になる */
  readonly bpm: number;
}

/** tick と曲時刻（秒）の相互変換。BPM の変化を含む。 */
export interface TimingMap {
  tickToSeconds(tick: number): number;
  secondsToTick(seconds: number): number;
}

interface Segment {
  readonly tick: number;
  readonly seconds: number;
  /** 1 tick あたりの秒数 */
  readonly secPerTick: number;
}

export class TimingError extends Error {
  override name = 'TimingError';
}

/**
 * BPM の変化から TimingMap を作る。
 * 区間ごとの開始秒を前計算し、変換時は二分探索で区間を見つける（O(log n)）。
 *
 * @param bpmEvents tick の昇順。先頭は tick 0。
 */
export function createTimingMap(bpmEvents: readonly BpmEvent[]): TimingMap {
  validate(bpmEvents);

  const segments: Segment[] = [];
  let seconds = 0;
  for (let i = 0; i < bpmEvents.length; i++) {
    const ev = bpmEvents[i]!;
    const prev = segments[i - 1];
    if (prev) seconds += (ev.tick - prev.tick) * prev.secPerTick;
    segments.push({ tick: ev.tick, seconds, secPerTick: 60 / ev.bpm / TICKS_PER_BEAT });
  }

  /** key(segment) <= value を満たす最後の区間（なければ先頭） */
  const find = (value: number, key: (s: Segment) => number): Segment => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (key(segments[mid]!) <= value) lo = mid;
      else hi = mid - 1;
    }
    return segments[lo]!;
  };

  return {
    tickToSeconds(tick) {
      const s = find(tick, (x) => x.tick);
      return s.seconds + (tick - s.tick) * s.secPerTick;
    },
    secondsToTick(sec) {
      const s = find(sec, (x) => x.seconds);
      return s.tick + (sec - s.seconds) / s.secPerTick;
    },
  };
}

function validate(events: readonly BpmEvent[]): void {
  if (events.length === 0) throw new TimingError('BPM が1つも指定されていません');
  if (events[0]!.tick !== 0) throw new TimingError('最初の BPM は tick 0 に置く必要があります');
  events.forEach((ev, i) => {
    if (!Number.isInteger(ev.tick) || ev.tick < 0) {
      throw new TimingError(`bpm[${i}]: tick は 0 以上の整数にしてください`);
    }
    if (!(ev.bpm > 0) || !Number.isFinite(ev.bpm)) {
      throw new TimingError(`bpm[${i}]: BPM は 0 より大きい数にしてください`);
    }
    const prev = events[i - 1];
    if (prev && ev.tick <= prev.tick) {
      throw new TimingError(`bpm[${i}]: tick は昇順で、同じ位置に複数置けません`);
    }
  });
}
