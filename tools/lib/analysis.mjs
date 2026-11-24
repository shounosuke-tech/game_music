/**
 * 音源の解析（開発用ツール）。
 * - ffmpeg でモノラルの PCM にデコードする
 * - スペクトルの変化量（spectral flux）から「音の立ち上がりの強さ」の時系列を作る
 * - その周期性から BPM と1拍目の位置を推定する
 */
import { spawnSync } from 'node:child_process';

export const SAMPLE_RATE = 22050;
export const FRAME = 1024;
export const HOP = 128; // 約 5.8ms
export const FPS = SAMPLE_RATE / HOP;

/**
 * 立ち上がりの強さのフレーム f が、実際の音の時刻より何秒早く出るか。
 * 立ち上がりの鋭い音（クリック・キック・プラック）で測ると −33〜−39ms でほぼ一定だったので、36ms とする。
 * （ゆっくり立ち上がる音では −60ms 程度になるが、拍の基準になるのは鋭い音なので考えない）
 */
export const ONSET_LAG_SEC = 0.036;

/** 曲時刻（秒）→ 立ち上がりの強さの配列での位置 */
export const secToFrame = (sec) => (sec - ONSET_LAG_SEC) * FPS;
/** 立ち上がりの強さの配列での位置 → 曲時刻（秒） */
export const frameToSec = (frame) => frame / FPS + ONSET_LAG_SEC;

export function ffmpegPath() {
  return process.env.FFMPEG || 'ffmpeg';
}

/** ffmpeg を実行する。失敗したら例外 */
export function runFfmpeg(args, options = {}) {
  const res = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 1024 * 1024 * 1024,
    ...options,
  });
  if (res.error) {
    throw new Error(
      `ffmpeg を実行できません（${res.error.message}）。ffmpeg をインストールするか、環境変数 FFMPEG にパスを指定してください`,
    );
  }
  if (res.status !== 0) throw new Error(`ffmpeg が失敗しました: ${res.stderr?.toString()}`);
  return res.stdout;
}

/** モノラル・22050Hz の Float32Array にデコードする（MP3 の先頭の無音は ffmpeg が取り除く） */
export function decodeMono(file) {
  const out = runFfmpeg(['-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-']);
  return new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4);
}

/** その場で計算する基数2の FFT（re, im を書き換える） */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * 音の立ち上がりの強さ（全体と帯域ごと）を求める。
 * @param bands 帯域の数（低音から高音へ対数で等分）
 * @returns env: 全体の強さ, bandEnv: 帯域ごとの強さ [band][frame]
 */
export function onsetEnvelope(samples, bands = 8, compression = 100) {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP));
  const half = FRAME / 2;
  const window = new Float64Array(FRAME).map(
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME),
  );
  // 帯域の境界（60Hz〜10kHz を対数で等分）
  const edges = Array.from({ length: bands + 1 }, (_, b) => {
    const hz = 60 * (10000 / 60) ** (b / bands);
    return Math.min(half, Math.round((hz * FRAME) / SAMPLE_RATE));
  });

  const env = new Float64Array(frames);
  const bandEnv = Array.from({ length: bands }, () => new Float64Array(frames));
  let prev = new Float64Array(half);
  let cur = new Float64Array(half);
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = samples[off + i] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < half; k++) cur[k] = Math.log1p(compression * Math.hypot(re[k], im[k]));
    for (let b = 0; b < bands; b++) {
      let sum = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) sum += Math.max(0, cur[k] - prev[k]);
      bandEnv[b][f] = sum / Math.max(1, edges[b + 1] - edges[b]);
      env[f] += sum;
    }
    [prev, cur] = [cur, prev];
  }

  // ゆっくりした音量の変化を取り除く（前後 0.5 秒の平均を引く）
  const w = Math.round(FPS * 0.5);
  const out = new Float64Array(frames);
  let acc = 0;
  for (let f = 0; f < frames + w; f++) {
    if (f < frames) acc += env[f];
    if (f - 2 * w - 1 >= 0) acc -= env[f - 2 * w - 1];
    const c = f - w;
    if (c >= 0 && c < frames) {
      const n = Math.min(frames, c + w + 1) - Math.max(0, c - w);
      out[c] = Math.max(0, env[c] - acc / n);
    }
  }
  return { env: out, bandEnv };
}

/** フレーム位置 x（小数）での値を線形補間で取る */
export function sampleAt(env, x) {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  return env[i] + (env[i + 1] - env[i]) * (x - i);
}

/** 拍の位置での強さの平均（BPM と1拍目の当てはまりの良さ） */
function gridScore(env, bpm, phaseFrames) {
  const step = (60 / bpm) * FPS;
  let sum = 0;
  let n = 0;
  for (let x = phaseFrames; x < env.length - 1; x += step) {
    sum += sampleAt(env, x);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

/** その BPM で最も当てはまる1拍目の位置（フレーム）と、そのときの値 */
function bestPhase(env, bpm) {
  const step = (60 / bpm) * FPS;
  let best = { phase: 0, score: -1 };
  for (let p = 0; p < step; p += 0.5) {
    const s = gridScore(env, bpm, p);
    if (s > best.score) best = { phase: p, score: s };
  }
  return best;
}

/**
 * BPM と1拍目の位置を推定する。
 * 1. 自己相関で大まかな BPM を求める（70〜200）
 * 2. その周りを 0.01 刻みで調べ、拍の位置の強さが最大になる BPM と位相を選ぶ
 */
export function estimateTempo(env, { minBpm = 70, maxBpm = 200 } = {}) {
  const minLag = Math.floor((60 / maxBpm) * FPS);
  const maxLag = Math.ceil((60 / minBpm) * FPS);
  let bestLag = minLag;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag];
    const bpm = (60 * FPS) / lag;
    // 人が拍と感じやすい 120 前後を少し優先する（倍・半分のテンポの取り違えを減らす）
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 128) / 0.9) ** 2);
    const v = (s / (env.length - lag)) * weight;
    if (v > bestVal) {
      bestVal = v;
      bestLag = lag;
    }
  }

  const rough = (60 * FPS) / bestLag;
  let best = { bpm: rough, phase: 0, score: -1 };
  for (let bpm = rough * 0.98; bpm <= rough * 1.02; bpm += 0.01) {
    const p = bestPhase(env, bpm);
    if (p.score > best.score) best = { bpm, phase: p.phase, score: p.score };
  }
  // 整数や 0.5 刻みの BPM に近ければ、そちらを採用する（作曲時の BPM はたいていきりの良い値）
  for (const candidate of [Math.round(best.bpm), Math.round(best.bpm * 2) / 2]) {
    if (Math.abs(candidate - best.bpm) < 0.05) {
      const p = bestPhase(env, candidate);
      if (p.score > best.score * 0.995) best = { bpm: candidate, phase: p.phase, score: p.score };
      break;
    }
  }
  const beatSec = 60 / best.bpm;
  const firstBeatSec = ((frameToSec(best.phase) % beatSec) + beatSec) % beatSec;
  return { bpm: best.bpm, firstBeatSec, score: best.score };
}

/** BPM が分かっているときに、1拍目の位置（秒）だけを推定する */
export function estimateFirstBeat(env, bpm) {
  const beatSec = 60 / bpm;
  const { phase } = bestPhase(env, bpm);
  return ((frameToSec(phase) % beatSec) + beatSec) % beatSec;
}

/**
 * テンポが一定かを調べる。16 拍ごとの区間で、推定した拍の位置からのずれ（ミリ秒）を求める。
 * ずれが小さく揃っていれば、テンポは一定とみなせる。
 */
export function tempoDrift(env, bpm, firstBeatSec) {
  const beat = 60 / bpm;
  const windowBeats = 16;
  const result = [];
  for (let startBeat = 0; ; startBeat += windowBeats) {
    const startSec = firstBeatSec + startBeat * beat;
    if ((startSec + windowBeats * beat) * FPS >= env.length) break;
    // この区間で、ずれ −40〜+40ms のどこが最も当てはまるか
    let best = { shift: 0, score: -1, energy: 0 };
    for (let ms = -40; ms <= 40; ms += 1) {
      let s = 0;
      for (let k = 0; k < windowBeats; k++) {
        s += sampleAt(env, secToFrame(startSec + k * beat + ms / 1000));
      }
      if (s > best.score) best = { shift: ms, score: s };
    }
    let energy = 0;
    for (
      let f = Math.floor(secToFrame(startSec));
      f < secToFrame(startSec + windowBeats * beat);
      f++
    ) {
      energy += env[f] ?? 0;
    }
    result.push({ startSec, shiftMs: best.shift, strength: best.score / windowBeats, energy });
  }
  return result;
}
