import { Application, Text } from 'pixi.js';
import { AudioEngine } from '@/audio/AudioEngine';
import { isLaneMode, keyLabel, laneKeys, type LaneMode } from '@/config/lanes';
import { TimingDemoScene } from '@/scenes/TimingDemoScene';
import './style.css';

/** URL の ?lanes=7 などで初期のレーン数を指定できる（テスト・デバッグ用） */
function initialLaneMode(): LaneMode {
  const n = Number(new URLSearchParams(location.search).get('lanes'));
  return isLaneMode(n) ? n : 4;
}

/** 今の画面とレーン数を DOM に出す（E2E テストで状態を確認するため） */
function reportState(scene: 'title' | 'play', mode: LaneMode): void {
  document.body.dataset.scene = scene;
  document.body.dataset.lanes = String(mode);
}

function titleMessage(mode: LaneMode): string {
  const keys = laneKeys(mode).map(keyLabel).join(' ');
  return [
    `${mode} レーン（${keys}）`,
    '',
    '4〜7 キーでレーン数を切り替え',
    'Enter キーまたはクリックでスタート',
  ].join('\n');
}

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

  let mode = initialLaneMode();
  const title = new Text({
    text: titleMessage(mode),
    style: {
      fill: 0xf5f7fa,
      fontSize: 24,
      align: 'center',
      fontFamily: 'system-ui, sans-serif',
      lineHeight: 36,
    },
  });
  title.anchor.set(0.5);
  const placeTitle = () => title.position.set(app.screen.width / 2, app.screen.height / 2);
  placeTitle();
  app.stage.addChild(title);

  const engine = new AudioEngine();
  let scene: TimingDemoScene | null = null;
  let starting = false;

  // 自動再生制限のため、音声はユーザー操作の中で開始する
  const start = async (): Promise<void> => {
    if (starting) return;
    starting = true;
    await engine.resume();
    title.destroy();
    scene = new TimingDemoScene(engine, mode);
    scene.resize(app.screen.width, app.screen.height);
    app.stage.addChild(scene);
    app.ticker.add(() => scene?.update());
    reportState('play', mode);
  };

  window.addEventListener('keydown', (e) => {
    if (starting) return;
    if (e.code === 'Enter') {
      void start();
      return;
    }
    const n = Number(e.key);
    if (isLaneMode(n)) {
      mode = n;
      title.text = titleMessage(mode);
      reportState('title', mode);
    }
  });
  app.canvas.addEventListener('pointerdown', () => void start());
  app.renderer.on('resize', (w: number, h: number) => {
    if (scene) scene.resize(w, h);
    else placeTitle();
  });

  // 入力の受け付けを始めてから、タイトル画面の準備完了を知らせる
  reportState('title', mode);
}

void bootstrap();
