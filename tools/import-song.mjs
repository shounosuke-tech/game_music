#!/usr/bin/env node
/**
 * 曲を取り込む（開発用ツール）。
 *
 *   npm run song:import -- <音源ファイル> --id <曲ID> [オプション]
 *
 * 1. 音源を Opus と AAC に変換する（MP3 の先頭の無音は ffmpeg が取り除く）
 * 2. BPM と1拍目の位置を推定し、テンポが一定かを調べる
 * 3. 4〜7 レーンの仮の譜面を自動で作る
 * 4. 曲情報（song.json）を書き、曲一覧を作り直す
 *
 * オプション:
 *   --title <曲名> --artist <作曲者>  省略時は音源のタグから読む
 *   --bpm <数値>                      BPM を指定する（推定しない）
 *   --first-beat-ms <数値>            1拍目の位置（ミリ秒）を指定する
 *   --local                           ローカル専用の曲として印を付ける（公開しない曲）
 *   --charts-only                     音源の変換を飛ばし、譜面と曲情報だけを作り直す
 *
 * 出力先 public/songs/<曲ID>/ は、既定で Git に含めない（.gitignore）。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeMono,
  estimateFirstBeat,
  estimateTempo,
  onsetEnvelope,
  runFfmpeg,
  SAMPLE_RATE,
  tempoDrift,
} from './lib/analysis.mjs';
import { analyzeGrid, makeAutoChart } from './lib/autochart.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--local' || a === '--charts-only') args[a.slice(2)] = true;
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

/** 音源のタグ（曲名・作曲者）を読む */
function readTags(file) {
  const text = runFfmpeg(['-i', file, '-f', 'ffmetadata', '-']).toString('utf8');
  const tags = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\w+)=(.*)$/.exec(line);
    if (m) tags[m[1].toLowerCase()] = m[2];
  }
  return tags;
}

const args = parseArgs(process.argv.slice(2));
const input = args._[0];
const id = args.id;
if (!input || !id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error(
    '使い方: npm run song:import -- <音源ファイル> --id <曲ID（英小文字・数字・ハイフン）>',
  );
  process.exit(1);
}

const outDir = join(ROOT, 'public', 'songs', id);
mkdirSync(outDir, { recursive: true });
const tags = readTags(input);
const title = args.title ?? tags.title ?? id;
const artist = args.artist ?? tags.artist ?? '';

console.log(`取り込み: ${title} / ${artist}`);

// 1. 変換
if (!args['charts-only']) {
  console.log('変換中（Opus / AAC）…');
  runFfmpeg([
    '-y',
    '-i',
    input,
    '-vn',
    '-c:a',
    'libopus',
    '-b:a',
    '160k',
    join(outDir, 'song.opus'),
  ]);
  runFfmpeg([
    '-y',
    '-i',
    input,
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    join(outDir, 'song.m4a'),
  ]);
}

// 2. 解析
console.log('解析中…');
const samples = decodeMono(input);
const durationSec = samples.length / SAMPLE_RATE;
const { env, bandEnv } = onsetEnvelope(samples, 8);
const estimated = estimateTempo(env);
const bpm = args.bpm ? Number(args.bpm) : estimated.bpm;
const firstBeatSec =
  args['first-beat-ms'] !== undefined
    ? Number(args['first-beat-ms']) / 1000
    : args.bpm
      ? estimateFirstBeat(env, bpm)
      : estimated.firstBeatSec;
const drift = tempoDrift(env, bpm, firstBeatSec);
const strong = drift.filter((d) => d.strength > 0.3 * Math.max(...drift.map((x) => x.strength)));
const maxDrift = Math.max(0, ...strong.map((d) => Math.abs(d.shiftMs)));

// 3. 仮の譜面
const grid = analyzeGrid({ env, bandEnv, bpm, firstBeatSec, durationSec });
const charts = [];
for (const lanes of [4, 5, 6, 7]) {
  const chart = makeAutoChart(grid, { lanes, bpm, firstBeatSec, durationSec });
  const file = `normal.${lanes}k.json`;
  writeFileSync(join(outDir, file), JSON.stringify(chart) + '\n');
  charts.push({ difficulty: 'normal', level: 0, lanes, file, notes: chart.notes.length });
}

// 4. 曲情報
const song = {
  version: 1,
  id,
  title,
  artist,
  bpmLabel: String(Math.round(bpm * 100) / 100),
  audio: { opus: 'song.opus', aac: 'song.m4a' },
  audioOffsetMs: { opus: 0, aac: 0 },
  preview: { startSec: Math.round(durationSec * 0.4), durationSec: 15 },
  theme: { background: '#07090f', accent: '#66b3ff' },
  ...(args.local ? { local: true } : {}),
  autoChart: true,
  charts: charts.map(({ difficulty, level, lanes, file }) => ({ difficulty, level, lanes, file })),
};
writeFileSync(join(outDir, 'song.json'), JSON.stringify(song, null, 2) + '\n');
writeFileSync(
  join(outDir, 'analysis.json'),
  JSON.stringify(
    { durationSec, estimated, used: { bpm, firstBeatSec }, drift, maxDriftMs: maxDrift },
    null,
    2,
  ) + '\n',
);
execFileSync(process.execPath, [join(ROOT, 'tools', 'build-song-index.mjs')], { stdio: 'inherit' });

console.log(`
長さ        ${durationSec.toFixed(1)} 秒
BPM         ${bpm.toFixed(3)}${args.bpm ? '（指定）' : '（推定）'}
1拍目       ${(firstBeatSec * 1000).toFixed(1)} ms
テンポ      16拍ごとの拍のずれ 最大 ${maxDrift}ms（${maxDrift <= 8 ? '一定とみなせます' : '途中で変わっている可能性があります'}）
仮の譜面    ${charts.map((c) => `${c.lanes}K ${c.notes}個`).join(' / ')}
出力先      public/songs/${id}/`);
