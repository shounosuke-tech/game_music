import { Application, Text } from 'pixi.js';
import { AudioEngine } from '@/audio/AudioEngine';
import { TimingDemoScene } from '@/scenes/TimingDemoScene';
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

  const title = new Text({
    text: 'Space キーまたはクリックでスタート\n（D F J K で叩く）',
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

  // 自動再生制限のため、音声はユーザー操作の中で開始する
  const start = async (): Promise<void> => {
    if (scene) return;
    await engine.resume();
    title.destroy();
    scene = new TimingDemoScene(engine);
    scene.resize(app.screen.width, app.screen.height);
    app.stage.addChild(scene);
    app.ticker.add(() => scene?.update());
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') void start();
  });
  app.canvas.addEventListener('pointerdown', () => void start());
  app.renderer.on('resize', (w: number, h: number) => {
    if (scene) scene.resize(w, h);
    else placeTitle();
  });
}

void bootstrap();
