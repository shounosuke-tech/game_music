import type { Application, Container } from 'pixi.js';
import type { AudioEngine } from '@/platform/audio/AudioEngine';
import type { Settings } from '@/platform/storage/settings';

/** 画面の状態名。E2E テストで確認できるよう body の data-scene に出す */
export type SceneName = 'title' | 'loading' | 'play' | 'pause' | 'result' | 'error';

export interface Scene {
  readonly root: Container;
  update(): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

/** すべての画面が共有するもの */
export interface GameContext {
  readonly app: Application;
  readonly engine: AudioEngine;
  settings: Settings;
  updateSettings(patch: Partial<Settings>): void;
  show(scene: Scene): void;
  report(name: SceneName, detail?: Record<string, string>): void;
}

export const FONT =
  'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Yu Gothic UI", sans-serif';
export const MONO = 'Consolas, Menlo, monospace';
