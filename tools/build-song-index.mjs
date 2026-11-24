#!/usr/bin/env node
/**
 * public/songs/ にある曲（song.json を持つフォルダ）から、曲一覧 public/songs/index.json を作る。
 * 仮の曲（demo）は最後に並べる。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SONGS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'songs');

const songs = readdirSync(SONGS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(SONGS, d.name, 'song.json')))
  .map((d) => JSON.parse(readFileSync(join(SONGS, d.name, 'song.json'), 'utf8')))
  .sort(
    (a, b) => Number(a.id === 'demo') - Number(b.id === 'demo') || a.title.localeCompare(b.title),
  )
  .map((s) => s.id);

writeFileSync(join(SONGS, 'index.json'), JSON.stringify({ version: 1, songs }, null, 2) + '\n');
console.log(`曲一覧: ${songs.join(', ')}`);
