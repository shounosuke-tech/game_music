#!/usr/bin/env node
/**
 * 開発用の仮の曲（音源・曲情報・4〜7レーンの譜面）を生成する。
 * 出力先: public/songs/demo/ （Git には含めない。npm run dev / build の前に自動で実行される）
 *
 * 曲: BPM 128、4/4 拍子、26 小節（約 49 秒）
 *   小節 0      カウント（ハイハット4回）
 *   小節 1〜8   キック・ハイハット・ベース
 *   小節 9〜16  スネアとアルペジオを追加
 *   小節 17〜22 全パート（リード追加）
 *   小節 23〜24 16分のフレーズ
 *   小節 25     締めの一発
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'songs', 'demo');
const SAMPLE_RATE = 44100;
const BPM = 128;
const TICKS_PER_BEAT = 960;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 26;
const DURATION = BARS * BAR + 1.5;

/** 決まった種から同じ乱数列を作る（出力を毎回同じにするため） */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 音源

const buf = new Float32Array(Math.ceil(DURATION * SAMPLE_RATE));
const noise = mulberry32(1);
const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

/** time 秒から、関数 f(t, i) が返す音を length 秒ぶん足す */
function add(time, length, f) {
  const start = Math.round(time * SAMPLE_RATE);
  const n = Math.round(length * SAMPLE_RATE);
  for (let i = 0; i < n && start + i < buf.length; i++) buf[start + i] += f(i / SAMPLE_RATE, i);
}

const kick = (t0) =>
  add(t0, 0.35, (t) => {
    const phase = 2 * Math.PI * (45 * t + (75 / 30) * (1 - Math.exp(-30 * t)));
    return 0.9 * Math.sin(phase) * Math.exp(-9 * t);
  });

const snare = (t0) =>
  add(t0, 0.2, (t) => {
    const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-30 * t);
    return 0.35 * tone + 0.35 * (noise() * 2 - 1) * Math.exp(-18 * t);
  });

const hat = (t0, gain = 0.12) => {
  let prev = 0;
  add(t0, 0.06, (t) => {
    const x = noise() * 2 - 1;
    const hp = x - prev; // 簡易ハイパス
    prev = x;
    return gain * hp * Math.exp(-70 * t);
  });
};

const crash = (t0) => {
  let prev = 0;
  add(t0, 2.0, (t) => {
    const x = noise() * 2 - 1;
    const hp = x - prev;
    prev = x;
    return 0.18 * hp * Math.exp(-2.2 * t);
  });
};

/** のこぎり波に近い音（倍音を足し合わせる） */
const saw = (hz, t, harmonics) => {
  let v = 0;
  for (let k = 1; k <= harmonics; k++) v += Math.sin(2 * Math.PI * hz * k * t) / k;
  return v;
};

const bass = (t0, midi, len) =>
  add(t0, len, (t) => 0.22 * saw(midiToHz(midi), t, 6) * Math.exp(-4 * t) * Math.min(1, t * 400));

const pluck = (t0, midi, gain) =>
  add(t0, 0.25, (t) => gain * saw(midiToHz(midi), t, 4) * Math.exp(-14 * t) * Math.min(1, t * 600));

const lead = (t0, midi, len) =>
  add(t0, len, (t) => {
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * t);
    const env = Math.min(1, t * 80) * Math.min(1, (len - t) * 20);
    return 0.09 * saw(midiToHz(midi) * vib, t, 5) * env;
  });

// コード進行（1小節ずつ）: Am - F - C - G
const CHORDS = [
  { root: 45, tones: [57, 60, 64] },
  { root: 41, tones: [53, 57, 60] },
  { root: 48, tones: [55, 60, 64] },
  { root: 43, tones: [55, 59, 62] },
];
const LEAD_LINE = [76, 74, 72, 74, 72, 71, 69, 67]; // 2拍ずつ

const barTime = (bar) => bar * BAR;

for (let b = 0; b < 4; b++) hat(barTime(0) + b * BEAT, 0.2); // カウント

for (let bar = 1; bar <= 24; bar++) {
  const t = barTime(bar);
  const chord = CHORDS[(bar - 1) % 4];
  for (let beat = 0; beat < 4; beat++) kick(t + beat * BEAT);
  for (let e = 0; e < 8; e++) hat(t + e * (BEAT / 2), e % 2 === 0 ? 0.08 : 0.13);
  for (let e = 0; e < 8; e++)
    bass(t + e * (BEAT / 2), chord.root + (e % 2 === 1 ? 12 : 0), BEAT / 2);
  if (bar >= 9) {
    snare(t + BEAT);
    snare(t + 3 * BEAT);
    for (let s = 0; s < 16; s++) {
      const tone = chord.tones[s % 3] + (s % 6 >= 3 ? 12 : 0);
      pluck(t + s * (BEAT / 4), tone, bar >= 23 ? 0.1 : 0.06);
    }
  }
  if (bar >= 17 && bar <= 22) {
    const idx = ((bar - 17) % 4) * 2;
    lead(t, LEAD_LINE[idx], BEAT * 2);
    lead(t + 2 * BEAT, LEAD_LINE[idx + 1], BEAT * 2);
  }
}
// 締め
kick(barTime(25));
crash(barTime(25));
bass(barTime(25), 45, BEAT * 3);
for (const m of [57, 60, 64, 69]) lead(barTime(25), m, BEAT * 3);

// 正規化して 16bit の WAV にする
let peak = 0;
for (const v of buf) peak = Math.max(peak, Math.abs(v));
const gain = 0.9 / peak;
const pcm = Buffer.alloc(44 + buf.length * 2);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + buf.length * 2, 4);
pcm.write('WAVE', 8);
pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20); // PCM
pcm.writeUInt16LE(1, 22); // モノラル
pcm.writeUInt32LE(SAMPLE_RATE, 24);
pcm.writeUInt32LE(SAMPLE_RATE * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(buf.length * 2, 40);
for (let i = 0; i < buf.length; i++) {
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i] * gain)) * 32767), 44 + i * 2);
}

// ---------------------------------------------------------------- 譜面

const T = TICKS_PER_BEAT;
const BAR_TICKS = T * 4;

function makeChart(lanes) {
  const rand = mulberry32(100 + lanes);
  const notes = [];
  const busyUntil = Array(lanes).fill(-1); // レーンごとに、ロングノーツなどで使用中の最後の tick
  const center = (lanes - 1) / 2;

  const free = (lane, tick) => tick > busyUntil[lane];
  const put = (tick, lane, endTick) => {
    if (!free(lane, tick)) return false;
    notes.push(endTick === undefined ? { tick, lane } : { tick, lane, endTick });
    busyUntil[lane] = endTick ?? tick;
    return true;
  };
  const pick = (tick, avoid = []) => {
    const candidates = [];
    for (let l = 0; l < lanes; l++) if (free(l, tick) && !avoid.includes(l)) candidates.push(l);
    return candidates.length ? candidates[Math.floor(rand() * candidates.length)] : -1;
  };

  // 小節 1〜8: 4分音符で端から端へ往復
  let walk = 0;
  let dir = 1;
  for (let bar = 1; bar <= 8; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      put(bar * BAR_TICKS + beat * T, walk);
      if (walk + dir < 0 || walk + dir >= lanes) dir = -dir;
      walk += dir;
    }
  }

  // 小節 9〜16: 8分音符。各小節の頭は左右対称の同時押し
  for (let bar = 9; bar <= 16; bar++) {
    const base = bar * BAR_TICKS;
    const pairLane = Math.floor(rand() * Math.floor(lanes / 2));
    put(base, pairLane);
    put(base, lanes - 1 - pairLane);
    let last = -1;
    for (let e = 1; e < 8; e++) {
      const tick = base + e * (T / 2);
      const lane = pick(tick, [last]);
      if (lane >= 0) put(tick, lane);
      last = lane;
    }
  }

  // 小節 17〜22: ロングノーツと、その間の8分音符
  for (let bar = 17; bar <= 22; bar++) {
    const base = bar * BAR_TICKS;
    const holdLane = bar % 2 === 1 ? 0 : lanes - 1;
    put(base, holdLane, base + T * 2);
    for (let e = 1; e < 4; e++) {
      const tick = base + e * (T / 2);
      const lane = pick(tick, [holdLane]);
      if (lane >= 0) put(tick, lane);
    }
    const secondHold = Math.round(center);
    put(base + T * 2, secondHold, base + T * 3);
    for (let e = 5; e < 8; e++) {
      const tick = base + e * (T / 2);
      const lane = pick(tick, [secondHold]);
      if (lane >= 0) put(tick, lane);
    }
  }

  // 小節 23〜24: 16分音符の交互押し（2レーンずつ）
  for (let bar = 23; bar <= 24; bar++) {
    const base = bar * BAR_TICKS;
    for (let beat = 0; beat < 4; beat++) {
      const a = Math.floor(rand() * lanes);
      const b = (a + 1 + Math.floor(rand() * (lanes - 1))) % lanes;
      for (let s = 0; s < 4; s++) put(base + beat * T + s * (T / 4), s % 2 === 0 ? a : b);
    }
  }

  // 小節 25: 締めの同時押し（両端と中央）
  const end = 25 * BAR_TICKS;
  put(end, 0);
  put(end, lanes - 1);
  if (lanes % 2 === 1) put(end, center);

  notes.sort((x, y) => x.tick - y.tick || x.lane - y.lane);
  return {
    version: 1,
    lanes,
    offsetMs: 0,
    bpm: [{ tick: 0, bpm: BPM }],
    meter: [{ tick: 0, numerator: 4, denominator: 4 }],
    notes,
  };
}

// ---------------------------------------------------------------- 出力

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'song.wav'), pcm);

const charts = [];
for (const lanes of [4, 5, 6, 7]) {
  const file = `normal.${lanes}k.json`;
  writeFileSync(join(OUT_DIR, file), JSON.stringify(makeChart(lanes)) + '\n');
  charts.push({ difficulty: 'normal', level: 5, lanes, file });
}

const song = {
  version: 1,
  id: 'demo',
  title: 'Demo Song（仮）',
  artist: 'game_music',
  bpmLabel: String(BPM),
  audio: { wav: 'song.wav' },
  audioOffsetMs: { wav: 0 },
  preview: { startSec: 30, durationSec: 15 },
  theme: { background: '#07090f', accent: '#66b3ff' },
  charts,
};
writeFileSync(join(OUT_DIR, 'song.json'), JSON.stringify(song, null, 2) + '\n');
writeFileSync(
  join(OUT_DIR, '..', 'index.json'),
  JSON.stringify({ version: 1, songs: ['demo'] }, null, 2) + '\n',
);

console.log(
  `demo song: ${DURATION.toFixed(1)}s, charts: ${charts.map((c) => c.lanes + 'K').join(' ')}`,
);
