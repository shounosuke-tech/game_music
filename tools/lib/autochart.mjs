/**
 * 音源の解析結果から、仮の譜面を自動で作る（開発用）。
 * 手触りの確認に使うための譜面で、正式な譜面は譜面エディタ（Phase 3）で作る。
 *
 * 1. 16分音符のグリッドごとに、音の立ち上がりの強さを測る
 * 2. 拍の頭ほど優先し、強い順に目標のノーツ数だけ選ぶ
 * 3. 立ち上がりが強かった帯域（低音〜高音）でレーンを決める
 * 4. 強い拍の頭は同時押し、次の音まで間があくところはロングノーツにする
 */
import { sampleAt, secToFrame } from './analysis.mjs';

const TICKS_PER_BEAT = 960;
const GRID_TICKS = TICKS_PER_BEAT / 4; // 16分音符

/** レーン数ごとの、1秒あたりのノーツ数の目安（難易度 normal） */
const DENSITY = { 4: 3.2, 5: 3.6, 6: 4.0, 7: 4.4 };

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

/** 時刻 sec の前後 ±10ms で、最も強い立ち上がりの値 */
function peakAround(env, sec) {
  const c = secToFrame(sec);
  let max = 0;
  for (let x = c - 2; x <= c + 2; x += 0.5) max = Math.max(max, sampleAt(env, x));
  return max;
}

/**
 * グリッドごとの強さと帯域を求める（レーン数に関係しないので1回だけ計算する）
 */
export function analyzeGrid({ env, bandEnv, bpm, firstBeatSec, durationSec }) {
  const step = 60 / bpm / 4;
  const grid = [];
  for (let g = 0; firstBeatSec + g * step < durationSec - 0.2; g++) {
    const sec = firstBeatSec + g * step;
    const strength = peakAround(env, sec);
    const bands = bandEnv.map((b) => peakAround(b, sec));
    grid.push({ g, sec, strength, bands });
  }
  // その周り（前後16拍）の強さで割り、曲の中の音量の違いをならす
  const global = quantile(
    grid.map((x) => x.strength),
    0.75,
  );
  const W = 64;
  for (let i = 0; i < grid.length; i++) {
    const local = quantile(
      grid.slice(Math.max(0, i - W), i + W).map((x) => x.strength),
      0.9,
    );
    const quietness = Math.min(1, local / Math.max(global, 1e-9));
    grid[i].norm = (grid[i].strength / Math.max(local, 1e-9)) * quietness;
  }
  // 帯域ごとに、ふだんの大きさ（中央値より上の平均）で割る。
  // 低音はもともとエネルギーが大きいので、そのまま比べると低音のレーンばかりになるため
  const bandCount = grid[0]?.bands.length ?? 0;
  for (let b = 0; b < bandCount; b++) {
    const typical = Math.max(
      quantile(
        grid.map((x) => x.bands[b]),
        0.75,
      ),
      1e-9,
    );
    for (const x of grid) x.bands[b] /= typical;
  }
  return grid;
}

export function makeAutoChart(grid, { lanes, bpm, firstBeatSec, durationSec }) {
  // 拍の頭 > 8分の裏 > 16分 の順に優先する
  const weight = (g) => (g % 4 === 0 ? 1 : g % 2 === 0 ? 0.85 : 0.55);
  const scored = grid.map((x) => ({ ...x, score: x.norm * weight(x.g) }));
  const target = Math.round(DENSITY[lanes] * (durationSec - firstBeatSec));
  const threshold = quantile(
    scored.map((x) => x.score),
    Math.max(0, 1 - target / scored.length),
  );
  const chordThreshold = quantile(
    scored.map((x) => x.score),
    0.97,
  );
  const picked = scored.filter((x) => x.score >= threshold && x.score > 0);

  const notes = [];
  const lastTick = Array(lanes).fill(-Infinity); // レーンごとの最後のノーツ（終点を含む）
  const minGap = TICKS_PER_BEAT / 4; // 同じレーンは 16分より詰めない（いわゆる縦連打を避ける）
  const free = (lane, tick) => tick - lastTick[lane] > minGap;
  const put = (tick, lane, endTick) => {
    notes.push(endTick === undefined ? { tick, lane } : { tick, lane, endTick });
    lastTick[lane] = endTick ?? tick;
  };

  // 帯域（8つ）をレーンに割り当てたときの、レーンごとの強さ
  const laneScore = (bands, lane) => {
    let max = 0;
    for (let b = 0; b < bands.length; b++) {
      if (Math.min(lanes - 1, Math.floor((b * lanes) / bands.length)) === lane) {
        max = Math.max(max, bands[b]);
      }
    }
    return max;
  };
  const recent = []; // 最近使ったレーン（偏りを減らすため）
  const maxLong = Math.round(picked.length * 0.05);
  let longCount = 0;

  let prevLane = -1;
  for (let i = 0; i < picked.length; i++) {
    const x = picked[i];
    const tick = x.g * GRID_TICKS;
    // 強かった帯域のレーンを選ぶ（低音が左、高音が右）。最近よく使ったレーンと、直前のレーンは選びにくくする
    let lane = -1;
    let best = -Infinity;
    for (let l = 0; l < lanes; l++) {
      if (!free(l, tick)) continue;
      const used = recent.filter((r) => r === l).length;
      const v = laneScore(x.bands, l) - 0.35 * used - (l === prevLane ? 0.5 : 0);
      if (v > best) {
        best = v;
        lane = l;
      }
    }
    if (lane < 0) continue;
    recent.push(lane);
    if (recent.length > lanes * 2) recent.shift();

    // 拍の頭の強い音で、次のノーツまで1拍以上あくならロングノーツにする（全体の約5%まで）
    const next = picked[i + 1];
    const gapTicks = next ? (next.g - x.g) * GRID_TICKS : 0;
    if (longCount < maxLong && x.g % 4 === 0 && gapTicks >= TICKS_PER_BEAT && x.norm > 0.6) {
      put(tick, lane, tick + gapTicks - TICKS_PER_BEAT / 2);
      longCount++;
    } else {
      put(tick, lane);
    }

    // 特に強い拍の頭は、左右対称の位置と同時押し
    if (x.g % 4 === 0 && x.score >= chordThreshold) {
      const mirror = lanes - 1 - lane;
      if (mirror !== lane && free(mirror, tick)) put(tick, mirror);
    }
    prevLane = lane;
  }

  notes.sort((a, b) => a.tick - b.tick || a.lane - b.lane);
  return {
    version: 1,
    lanes,
    offsetMs: Math.round(firstBeatSec * 1000 * 100) / 100,
    bpm: [{ tick: 0, bpm }],
    meter: [{ tick: 0, numerator: 4, denominator: 4 }],
    notes,
  };
}
