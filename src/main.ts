import { Application } from 'pixi.js';
import { isLaneMode } from '@/config/lanes';
import { AudioEngine } from '@/platform/audio/AudioEngine';
import { loadSettings, normalizeSettings, saveSettings } from '@/platform/storage/settings';
import type { GameContext, Scene } from '@/scenes/Scene';
import { TitleScene } from '@/scenes/TitleScene';
import './style.css';

async function bootstrap(): Promise<void> {
  const app = new Application();
  await app.init({
    background: 0x07090f,
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
  });
  document.getElementById('app')?.appendChild(app.canvas);

  let settings = loadSettings();
  // URL の ?lanes=7 や ?song=demo で、最初のレーン数と曲を指定できる（テスト・デバッグ用）
  const params = new URLSearchParams(location.search);
  const lanesParam = Number(params.get('lanes'));
  if (isLaneMode(lanesParam)) settings = { ...settings, lastLanes: lanesParam };
  const songParam = params.get('song');
  if (songParam) settings = { ...settings, lastSongId: songParam };

  let current: Scene | null = null;

  const ctx: GameContext = {
    app,
    engine: new AudioEngine(),
    get settings() {
      return settings;
    },
    set settings(value) {
      settings = value;
    },
    updateSettings(patch) {
      settings = normalizeSettings({ ...settings, ...patch });
      saveSettings(settings);
    },
    show(scene) {
      if (current) {
        app.stage.removeChild(current.root);
        current.destroy();
      }
      current = scene;
      app.stage.addChild(scene.root);
      scene.resize(app.screen.width, app.screen.height);
    },
    // 今の画面とレーン数を DOM に出す（E2E テストで状態を確認するため）
    report(name, detail = {}) {
      document.body.dataset.scene = name;
      for (const [k, v] of Object.entries(detail)) document.body.dataset[k] = v;
    },
  };

  app.ticker.add(() => current?.update());
  app.renderer.on('resize', (w: number, h: number) => current?.resize(w, h));
  ctx.show(new TitleScene(ctx));
}

void bootstrap();
