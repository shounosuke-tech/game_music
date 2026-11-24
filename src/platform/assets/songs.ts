import type { LaneMode } from '@/config/lanes';
import { buildPlayableChart, parseChart, type PlayableChart } from '@/core/chart';
import type { AudioEngine } from '@/platform/audio/AudioEngine';

/** 曲情報（詳細設計書 4.2）。Phase 2 で使う項目だけ */
export interface SongInfo {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly audio: Readonly<Record<string, string>>;
  readonly audioOffsetMs?: Readonly<Record<string, number>>;
  readonly charts: readonly {
    readonly difficulty: string;
    readonly level: number;
    readonly lanes: number;
    readonly file: string;
  }[];
}

export interface LoadedSong {
  readonly info: SongInfo;
  readonly chart: PlayableChart;
  readonly buffer: AudioBuffer;
}

/** 音源の形式と、ブラウザが再生できるかを調べる MIME タイプ（優先順） */
const AUDIO_FORMATS: readonly [format: string, mime: string][] = [
  ['opus', 'audio/ogg; codecs=opus'],
  ['aac', 'audio/mp4; codecs="mp4a.40.2"'],
  ['wav', 'audio/wav'],
];

/** ブラウザが再生できる音源の形式を選ぶ */
export function pickAudioFormat(
  available: Readonly<Record<string, string>>,
  canPlay: (mime: string) => boolean,
): string | null {
  for (const [format, mime] of AUDIO_FORMATS) {
    if (available[format] && canPlay(mime)) return format;
  }
  return null;
}

const songsBase = (): string => `${import.meta.env.BASE_URL}songs/`;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）: ${url}`);
  return res.json();
}

/** 曲情報・譜面・音源をまとめて読み込む */
export async function loadSong(
  engine: AudioEngine,
  songId: string,
  lanes: LaneMode,
  difficulty = 'normal',
): Promise<LoadedSong> {
  const dir = `${songsBase()}${encodeURIComponent(songId)}/`;
  const info = (await fetchJson(`${dir}song.json`)) as SongInfo;

  const entry = info.charts.find((c) => c.lanes === lanes && c.difficulty === difficulty);
  if (!entry) {
    throw new Error(`${info.title} に ${lanes} レーン（${difficulty}）の譜面がありません`);
  }

  const probe = document.createElement('audio');
  const format = pickAudioFormat(info.audio, (mime) => probe.canPlayType(mime) !== '');
  if (!format) throw new Error(`${info.title} の音源を、このブラウザで再生できません`);

  const [chartJson, buffer] = await Promise.all([
    fetchJson(`${dir}${entry.file}`),
    engine.load(`${dir}${info.audio[format]}`),
  ]);
  const audioOffsetSec = (info.audioOffsetMs?.[format] ?? 0) / 1000;
  const chart = buildPlayableChart(parseChart(chartJson), audioOffsetSec);
  return { info, chart, buffer };
}
