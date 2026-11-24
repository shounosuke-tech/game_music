/**
 * 設定の保存（詳細設計書 4.4、4.6）。
 * Phase 2 ではプレイに必要な項目だけを扱い、残りは Phase 4 で足す。
 */
import { isLaneMode, type LaneMode } from '@/config/lanes';

export const SETTINGS_KEY = 'game_music:settings';
export const SETTINGS_VERSION = 1;

export interface Settings {
  readonly version: number;
  /** 0.5〜10.0。3.0 で判定ラインまで 1 秒で落ちる */
  readonly scrollSpeed: number;
  /** 判定のオフセット（ミリ秒）。−300〜+300 */
  readonly judgeOffsetMs: number;
  /** 表示のオフセット（ミリ秒）。−300〜+300 */
  readonly visualOffsetMs: number;
  readonly lastLanes: LaneMode;
  /** 最後に選んだ曲の ID */
  readonly lastSongId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  scrollSpeed: 3.0,
  judgeOffsetMs: 0,
  visualOffsetMs: 0,
  lastLanes: 4,
  lastSongId: '',
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** 値の範囲を整える。範囲外や型の違う値は初期値または上限・下限にする */
export function normalizeSettings(raw: unknown): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const lanes = num(o.lastLanes, DEFAULT_SETTINGS.lastLanes);
  return {
    version: SETTINGS_VERSION,
    scrollSpeed:
      Math.round(clamp(num(o.scrollSpeed, DEFAULT_SETTINGS.scrollSpeed), 0.5, 10) * 10) / 10,
    judgeOffsetMs: Math.round(clamp(num(o.judgeOffsetMs, 0), -300, 300)),
    visualOffsetMs: Math.round(clamp(num(o.visualOffsetMs, 0), -300, 300)),
    lastLanes: isLaneMode(lanes) ? lanes : DEFAULT_SETTINGS.lastLanes,
    lastSongId: typeof o.lastSongId === 'string' ? o.lastSongId : DEFAULT_SETTINGS.lastSongId,
  };
}

/** localStorage が使えない環境（プライベートモードなど）でも動くように、例外は握りつぶす */
export function loadSettings(storage: Storage | undefined = globalThis.localStorage): Settings {
  try {
    const text = storage?.getItem(SETTINGS_KEY);
    if (!text) return DEFAULT_SETTINGS;
    try {
      return normalizeSettings(JSON.parse(text));
    } catch {
      // 壊れたデータは退避して初期値で始める
      storage?.setItem(`${SETTINGS_KEY}:broken:${new Date().toISOString()}`, text);
      return DEFAULT_SETTINGS;
    }
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(
  settings: Settings,
  storage: Storage | undefined = globalThis.localStorage,
): boolean {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
