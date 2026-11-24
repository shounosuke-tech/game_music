/**
 * public/songs にある曲データがすべて正しいことを確認する。
 * 曲や譜面を追加したときに、形式の誤りをテストで見つけるためのもの。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlayableChart, parseChart } from '@/core/chart';

const SONGS_DIR = join(process.cwd(), 'public', 'songs');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

interface SongJson {
  id: string;
  audio: Record<string, string>;
  charts: { lanes: number; file: string }[];
}

const index = readJson(join(SONGS_DIR, 'index.json')) as { songs: string[] };

describe.each(index.songs)('曲 %s', (songId) => {
  const dir = join(SONGS_DIR, songId);
  const song = readJson(join(dir, 'song.json')) as SongJson;

  it('曲情報の ID がフォルダ名と一致する', () => {
    expect(song.id).toBe(songId);
  });

  it('音源ファイルが存在する', () => {
    for (const file of Object.values(song.audio)) expect(existsSync(join(dir, file))).toBe(true);
  });

  it.each(song.charts.map((c) => [c.file, c] as const))('譜面 %s が検証に通る', (_, entry) => {
    const chart = parseChart(readJson(join(dir, entry.file)));
    expect(chart.lanes).toBe(entry.lanes);
    expect(buildPlayableChart(chart).notes.length).toBeGreaterThan(0);
  });
});
