import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  normalizeSettings,
  saveSettings,
  SETTINGS_KEY,
} from './settings';

/** テスト用の簡単な Storage */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('normalizeSettings', () => {
  it('範囲外の値を上限・下限にそろえる', () => {
    const s = normalizeSettings({ scrollSpeed: 99, judgeOffsetMs: -999, visualOffsetMs: 12.6 });
    expect(s.scrollSpeed).toBe(10);
    expect(s.judgeOffsetMs).toBe(-300);
    expect(s.visualOffsetMs).toBe(13);
  });

  it('型の違う値・未知のレーン数は初期値にする', () => {
    const s = normalizeSettings({ scrollSpeed: 'fast', lastLanes: 9 });
    expect(s.scrollSpeed).toBe(DEFAULT_SETTINGS.scrollSpeed);
    expect(s.lastLanes).toBe(4);
  });

  it('速さは 0.1 刻みに丸める', () => {
    expect(normalizeSettings({ scrollSpeed: 3.14 }).scrollSpeed).toBe(3.1);
  });
});

describe('loadSettings / saveSettings', () => {
  it('保存した設定を読み込める', () => {
    const storage = memoryStorage();
    saveSettings({ ...DEFAULT_SETTINGS, judgeOffsetMs: 25, lastLanes: 7 }, storage);
    const s = loadSettings(storage);
    expect(s.judgeOffsetMs).toBe(25);
    expect(s.lastLanes).toBe(7);
  });

  it('何も保存されていなければ初期値', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('壊れたデータは退避して初期値で始める', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{broken' });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    expect(keys.some((k) => k?.startsWith(`${SETTINGS_KEY}:broken:`))).toBe(true);
  });

  it('localStorage が使えない環境でも例外にならない', () => {
    const failing = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as Storage;
    expect(loadSettings(failing)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, failing)).toBe(false);
  });
});
